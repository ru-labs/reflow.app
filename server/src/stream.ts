import type { FastifyBaseLogger, FastifyReply, FastifyRequest } from 'fastify';
import pg from 'pg';
import type { Pool } from './db.js';

const HEARTBEAT_MS = 25_000;
const RECONNECT_MS = 2_000;

/**
 * Fans Postgres LISTEN/NOTIFY task changes out to per-user SSE streams. The
 * trigger sends ids only; the row is fetched here, and only when that user has
 * a stream open.
 */
export function createTaskStream(pool: Pool, connectionString: string, log: FastifyBaseLogger) {
  const streams = new Map<string, Set<FastifyReply>>();
  let listener: pg.Client | null = null;
  let closed = false;
  let reconnectTimer: NodeJS.Timeout | undefined;
  const heartbeat = setInterval(() => write(': ping\n\n'), HEARTBEAT_MS);

  function write(chunk: string, only?: Set<FastifyReply>) {
    for (const set of only ? [only] : streams.values()) for (const reply of set) reply.raw.write(chunk);
  }

  async function onNotification(payload: string | undefined) {
    try {
      const { id, user_id } = JSON.parse(payload ?? '') as { id: string; user_id: string };
      const listeners = streams.get(user_id);
      if (!listeners) return;
      const { rows } = await pool.query('select * from tasks where id = $1', [id]);
      if (rows[0]) write(`event: task\ndata: ${JSON.stringify(rows[0])}\n\n`, listeners);
    } catch (err) {
      log.error(err, 'task stream notification failed');
    }
  }

  async function connect() {
    const client = new pg.Client({ connectionString });
    client.on('notification', (msg) => void onNotification(msg.payload));
    let dropped = false;
    const reconnect = (err?: Error) => {
      if (dropped) return;
      dropped = true;
      if (err) log.error(err, 'task stream listener lost');
      listener = null;
      client.end().catch(() => {});
      if (!closed) reconnectTimer = setTimeout(() => connect().catch(() => {}), RECONNECT_MS);
    };
    client.on('error', reconnect);
    client.on('end', () => reconnect());
    try {
      await client.connect();
      await client.query('listen task_changes');
      listener = client;
    } catch (err) {
      reconnect(err as Error);
      throw err;
    }
  }

  return {
    /** Connects the dedicated LISTEN client; rejects if the first connection fails, so startup surfaces a bad DB. */
    start: connect,

    /** Hijacks the reply and keeps it open as an event stream for this user. */
    subscribe(userId: string, request: FastifyRequest, reply: FastifyReply) {
      reply.hijack();
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      });
      reply.raw.write(': connected\n\n');
      let set = streams.get(userId);
      if (!set) streams.set(userId, (set = new Set()));
      set.add(reply);
      request.raw.on('close', () => {
        set.delete(reply);
        if (set.size === 0) streams.delete(userId);
      });
    },

    async close() {
      closed = true;
      clearInterval(heartbeat);
      clearTimeout(reconnectTimer);
      for (const set of streams.values()) for (const reply of set) reply.raw.end();
      streams.clear();
      await listener?.end().catch(() => {});
    },
  };
}
