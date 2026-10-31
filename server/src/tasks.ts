import type { FastifyInstance } from 'fastify';
import type { Pool } from './db.js';
import type { createTaskStream } from './stream.js';
import { HOURS_MAX, TAG_MAX_LENGTH, TAGS_MAX_COUNT, TITLE_MAX_LENGTH, validateTitle } from './validation.js';

type TaskStream = ReturnType<typeof createTaskStream>;

const uuid = { type: 'string', format: 'uuid' } as const;
const dateTime = { type: 'string', format: 'date-time' } as const;
const tags = {
  type: 'array',
  maxItems: TAGS_MAX_COUNT,
  items: { type: 'string', maxLength: TAG_MAX_LENGTH },
} as const;
const title = { type: 'string', maxLength: TITLE_MAX_LENGTH * 2 } as const; // trimmed/cleaned in the handler
// numeric(5,2) rounds to 2 decimals and the DB requires > 0, hence the 0.01 floor.
const hours = { type: ['number', 'null'], minimum: 0.01, maximum: HOURS_MAX } as const;

// The only columns PATCH /api/tasks/:id may touch. user_id and the rest are never client-writable.
const PATCHABLE = ['title', 'tags', 'status', 'completed_at', 'rank', 'last_triaged_on', 'hours_spent'] as const;

export async function taskRoutes(app: FastifyInstance, { pool, stream }: { pool: Pool; stream: TaskStream }) {
  app.get('/api/tasks', { schema: { querystring: { type: 'object', properties: { status: { enum: ['active'] } } } } },
    async (request) => {
      const { rows } = await pool.query(
        `select * from tasks where user_id = $1 and status = 'active' order by rank asc`,
        [request.userId],
      );
      return rows;
    },
  );

  app.post<{ Body: { title: string; rank: number; tags?: string[] } }>(
    '/api/tasks',
    { schema: { body: { type: 'object', required: ['title', 'rank'], properties: { title, rank: { type: 'number' }, tags } } } },
    async (request, reply) => {
      const t = validateTitle(request.body.title);
      if (!t.ok) return reply.code(400).send({ error: t.error });
      const { rows } = await pool.query(
        `insert into tasks (user_id, title, rank, tags) values ($1, $2, $3, $4) returning *`,
        [request.userId, t.value, request.body.rank, request.body.tags ?? []],
      );
      return reply.code(201).send(rows[0]);
    },
  );

  // Registered as a static path; find-my-way prefers it over /api/tasks/:id.
  app.patch<{ Body: { updates: { id: string; rank: number }[] } }>(
    '/api/tasks/ranks',
    {
      schema: {
        body: {
          type: 'object',
          required: ['updates'],
          properties: {
            updates: {
              type: 'array',
              minItems: 1,
              maxItems: 1000,
              items: { type: 'object', required: ['id', 'rank'], properties: { id: uuid, rank: { type: 'number' } } },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const ranks = new Map(request.body.updates.map((u) => [u.id, u.rank]));
      const client = await pool.connect();
      try {
        await client.query('begin');
        const result = await client.query(
          `update tasks t set rank = v.rank
             from unnest($1::uuid[], $2::float8[]) as v(id, rank)
            where t.id = v.id and t.user_id = $3`,
          [[...ranks.keys()], [...ranks.values()], request.userId],
        );
        // Any id that isn't this user's row means nothing is applied.
        if (result.rowCount !== ranks.size) {
          await client.query('rollback');
          return reply.code(404).send({ error: 'Task not found' });
        }
        await client.query('commit');
      } catch (err) {
        await client.query('rollback');
        throw err;
      } finally {
        client.release();
      }
      return reply.code(204).send();
    },
  );

  app.get<{ Querystring: { since: string } }>(
    '/api/tasks/completed-since',
    { schema: { querystring: { type: 'object', required: ['since'], properties: { since: dateTime } } } },
    async (request) => {
      const { rows } = await pool.query<{ completed: boolean }>(
        `select exists (select 1 from tasks where user_id = $1 and status = 'done' and completed_at >= $2) as completed`,
        [request.userId, request.query.since],
      );
      return { completed: rows[0].completed };
    },
  );

  app.get<{ Querystring: { from: string; to: string } }>(
    '/api/tasks/closed',
    {
      schema: {
        querystring: { type: 'object', required: ['from', 'to'], properties: { from: dateTime, to: dateTime } },
      },
    },
    async (request) => {
      const { rows } = await pool.query(
        `select * from tasks
          where user_id = $1 and status in ('done', 'dropped') and completed_at >= $2 and completed_at < $3
          order by completed_at desc`,
        [request.userId, request.query.from, request.query.to],
      );
      return rows;
    },
  );

  app.get('/api/tasks/last-active-rank', async (request) => {
    const { rows } = await pool.query<{ rank: number }>(
      `select rank from tasks where user_id = $1 and status = 'active' order by rank desc limit 1`,
      [request.userId],
    );
    return { rank: rows[0]?.rank ?? null };
  });

  app.get('/api/tasks/stream', async (request, reply) => {
    stream.subscribe(request.userId, request, reply);
  });

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>(
    '/api/tasks/:id',
    {
      schema: {
        params: { type: 'object', properties: { id: uuid } },
        body: {
          type: 'object',
          properties: {
            title,
            tags,
            status: { enum: ['active', 'done', 'dropped'] },
            completed_at: { anyOf: [dateTime, { type: 'null' }] },
            rank: { type: 'number' },
            last_triaged_on: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
            hours_spent: hours,
          },
        },
      },
    },
    async (request, reply) => {
      // Fastify's Ajv strips unknown properties, but stay explicit about what is writable.
      const body = request.body;
      const sets: string[] = [];
      const values: unknown[] = [];
      for (const column of PATCHABLE) {
        if (!(column in body)) continue;
        let value = body[column];
        if (column === 'title') {
          const t = validateTitle(value as string);
          if (!t.ok) return reply.code(400).send({ error: t.error });
          value = t.value;
        }
        values.push(value);
        sets.push(`${column} = $${values.length}`);
      }
      if (sets.length === 0) return reply.code(400).send({ error: 'Nothing to update' });

      values.push(request.params.id, request.userId);
      const result = await pool.query(
        `update tasks set ${sets.join(', ')} where id = $${values.length - 1} and user_id = $${values.length}`,
        values,
      );
      if (result.rowCount === 0) return reply.code(404).send({ error: 'Task not found' });
      return reply.code(204).send();
    },
  );

  app.get('/api/profile/theme', async (request) => {
    const { rows } = await pool.query<{ theme_preference: string }>(
      'select theme_preference from profiles where user_id = $1',
      [request.userId],
    );
    return { theme: rows[0]?.theme_preference ?? 'system' };
  });

  app.put<{ Body: { theme: string } }>(
    '/api/profile/theme',
    {
      schema: {
        body: { type: 'object', required: ['theme'], properties: { theme: { enum: ['system', 'light', 'dark'] } } },
      },
    },
    async (request, reply) => {
      await pool.query(
        `insert into profiles (user_id, theme_preference) values ($1, $2)
         on conflict (user_id) do update set theme_preference = excluded.theme_preference`,
        [request.userId, request.body.theme],
      );
      return reply.code(204).send();
    },
  );
}
