import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setup, signup, teardown, type TestContext, type TestUser } from './helpers.js';

let ctx: TestContext;
let a: TestUser;
let b: TestUser;
beforeAll(async () => {
  ctx = await setup();
  a = await signup(ctx.app, 'a@example.com');
  b = await signup(ctx.app, 'b@example.com');
});
afterAll(() => teardown(ctx));

async function create(user: TestUser, title: string, rank: number, tags: string[] = []) {
  const res = await call(ctx.app, user, 'POST', '/api/tasks', { title, rank, tags });
  expect(res.statusCode).toBe(201);
  return res.json() as { id: string; rank: number };
}

describe('CRUD', () => {
  it('creates, lists by rank, and returns PostgREST-shaped rows', async () => {
    const second = await create(a, '  second  ', 2, ['x']);
    await create(a, 'first', 1);
    const rows = (await call(ctx.app, a, 'GET', '/api/tasks?status=active')).json();
    expect(rows.map((r: { title: string }) => r.title)).toEqual(['first', 'second']);
    const row = rows[1];
    expect(row.id).toBe(second.id);
    expect(row.user_id).toBe(a.id);
    expect(row.tags).toEqual(['x']);
    expect(row.hours_spent).toBeNull();
    expect(row.last_triaged_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(row.created_at).toISOString()).toBe(row.created_at);
  });

  it('patches an allow-listed set of fields; hours come back as numbers', async () => {
    const t = await create(a, 'patch me', 10);
    const res = await call(ctx.app, a, 'PATCH', `/api/tasks/${t.id}`, {
      title: 'patched', status: 'done', completed_at: '2026-10-01T10:00:00.000Z', hours_spent: 1.5, last_triaged_on: '2026-10-01',
    });
    expect(res.statusCode).toBe(204);
    const { rows } = await ctx.pool.query('select * from tasks where id = $1', [t.id]);
    expect(rows[0]).toMatchObject({ title: 'patched', status: 'done', hours_spent: 1.5, last_triaged_on: '2026-10-01' });

    const reopen = await call(ctx.app, a, 'PATCH', `/api/tasks/${t.id}`, { status: 'active', completed_at: null, hours_spent: null });
    expect(reopen.statusCode).toBe(204);
  });

  it('cannot reassign user_id through PATCH', async () => {
    const t = await create(a, 'mine', 11);
    await call(ctx.app, a, 'PATCH', `/api/tasks/${t.id}`, { user_id: b.id, title: 'still mine' });
    const { rows } = await ctx.pool.query('select user_id from tasks where id = $1', [t.id]);
    expect(rows[0].user_id).toBe(a.id);
  });

  it('last-active-rank is the highest active rank, or null', async () => {
    const fresh = await signup(ctx.app, 'fresh@example.com');
    expect((await call(ctx.app, fresh, 'GET', '/api/tasks/last-active-rank')).json()).toEqual({ rank: null });
    await create(fresh, 'one', 3);
    await create(fresh, 'two', 7.5);
    expect((await call(ctx.app, fresh, 'GET', '/api/tasks/last-active-rank')).json()).toEqual({ rank: 7.5 });
  });

  it('profile theme defaults to system and upserts', async () => {
    expect((await call(ctx.app, a, 'GET', '/api/profile/theme')).json()).toEqual({ theme: 'system' });
    expect((await call(ctx.app, a, 'PUT', '/api/profile/theme', { theme: 'dark' })).statusCode).toBe(204);
    expect((await call(ctx.app, a, 'PUT', '/api/profile/theme', { theme: 'light' })).statusCode).toBe(204);
    expect((await call(ctx.app, a, 'GET', '/api/profile/theme')).json()).toEqual({ theme: 'light' });
    expect((await call(ctx.app, a, 'PUT', '/api/profile/theme', { theme: 'neon' })).statusCode).toBe(400);
  });
});

describe('isolation (replaces RLS)', () => {
  it("user B cannot list, patch, or rank-update user A's task", async () => {
    const t = await create(a, 'private', 50);

    const list = (await call(ctx.app, b, 'GET', '/api/tasks')).json();
    expect(list.map((r: { id: string }) => r.id)).not.toContain(t.id);

    const patch = await call(ctx.app, b, 'PATCH', `/api/tasks/${t.id}`, { title: 'hijacked', status: 'dropped', rank: 0.5 });
    expect(patch.statusCode).toBe(404);

    const ranks = await call(ctx.app, b, 'PATCH', '/api/tasks/ranks', { updates: [{ id: t.id, rank: 0.5 }] });
    expect(ranks.statusCode).toBe(404);

    const { rows } = await ctx.pool.query('select title, status, rank from tasks where id = $1', [t.id]);
    expect(rows[0]).toEqual({ title: 'private', status: 'active', rank: 50 });
  });

  it("closed and completed-since never include another user's tasks", async () => {
    const t = await create(a, 'done by a', 60);
    await call(ctx.app, a, 'PATCH', `/api/tasks/${t.id}`, { status: 'done', completed_at: '2026-10-05T12:00:00.000Z' });
    const q = 'from=2026-10-05T00:00:00.000Z&to=2026-10-06T00:00:00.000Z';
    expect((await call(ctx.app, a, 'GET', `/api/tasks/closed?${q}`)).json()).toHaveLength(1);
    expect((await call(ctx.app, b, 'GET', `/api/tasks/closed?${q}`)).json()).toHaveLength(0);
    expect((await call(ctx.app, b, 'GET', '/api/tasks/completed-since?since=2026-10-01T00:00:00.000Z')).json()).toEqual({ completed: false });
  });
});

describe('validation', () => {
  it('rejects blank and over-long titles, too many tags, and bad hours', async () => {
    const t = await create(a, 'valid', 70);
    const bad = [
      call(ctx.app, a, 'POST', '/api/tasks', { title: '   ', rank: 1 }),
      call(ctx.app, a, 'POST', '/api/tasks', { title: 'x'.repeat(201), rank: 1 }),
      call(ctx.app, a, 'POST', '/api/tasks', { title: 'ok', rank: 1, tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }),
      call(ctx.app, a, 'POST', '/api/tasks', { title: 'ok', rank: null }),
      call(ctx.app, a, 'PATCH', `/api/tasks/${t.id}`, { hours_spent: 0 }),
      call(ctx.app, a, 'PATCH', `/api/tasks/${t.id}`, { hours_spent: 25 }),
      call(ctx.app, a, 'PATCH', `/api/tasks/${t.id}`, { title: '' }),
      call(ctx.app, a, 'PATCH', `/api/tasks/${t.id}`, { status: 'archived' }),
      call(ctx.app, a, 'PATCH', `/api/tasks/${t.id}`, {}),
      call(ctx.app, a, 'PATCH', '/api/tasks/not-a-uuid', { title: 'x' }),
    ];
    expect((await Promise.all(bad)).map((r) => r.statusCode)).toEqual(Array(bad.length).fill(400));
  });
});

describe('queries', () => {
  it('closed uses [from, to) and orders newest first', async () => {
    const user = await signup(ctx.app, 'range@example.com');
    const stamps = ['2026-10-10T00:00:00.000Z', '2026-10-10T12:00:00.000Z', '2026-10-11T00:00:00.000Z'];
    for (const [i, at] of stamps.entries()) {
      const t = await create(user, `t${i}`, i);
      await call(ctx.app, user, 'PATCH', `/api/tasks/${t.id}`, { status: i === 1 ? 'dropped' : 'done', completed_at: at });
    }
    const q = 'from=2026-10-10T00:00:00.000Z&to=2026-10-11T00:00:00.000Z';
    const rows = (await call(ctx.app, user, 'GET', `/api/tasks/closed?${q}`)).json();
    expect(rows.map((r: { title: string }) => r.title)).toEqual(['t1', 't0']);
  });

  it('completed-since is true only for done tasks at or after the cutoff', async () => {
    const user = await signup(ctx.app, 'since@example.com');
    const t = await create(user, 'x', 1);
    const q = (since: string) => call(ctx.app, user, 'GET', `/api/tasks/completed-since?since=${since}`);
    expect((await q('2026-10-10T00:00:00.000Z')).json()).toEqual({ completed: false });
    await call(ctx.app, user, 'PATCH', `/api/tasks/${t.id}`, { status: 'dropped', completed_at: '2026-10-10T08:00:00.000Z' });
    expect((await q('2026-10-10T00:00:00.000Z')).json()).toEqual({ completed: false }); // dropped doesn't count
    await call(ctx.app, user, 'PATCH', `/api/tasks/${t.id}`, { status: 'done' });
    expect((await q('2026-10-10T00:00:00.000Z')).json()).toEqual({ completed: true });
    expect((await q('2026-10-10T08:00:00.001Z')).json()).toEqual({ completed: false });
  });

  it('bulk rank update is atomic', async () => {
    const user = await signup(ctx.app, 'bulk@example.com');
    const t1 = await create(user, 'one', 1);
    const t2 = await create(user, 'two', 2);
    const missing = '00000000-0000-4000-8000-000000000000';

    const bad = await call(ctx.app, user, 'PATCH', '/api/tasks/ranks', {
      updates: [{ id: t1.id, rank: 10 }, { id: missing, rank: 11 }],
    });
    expect(bad.statusCode).toBe(404);
    expect((await ctx.pool.query('select rank from tasks where id = $1', [t1.id])).rows[0].rank).toBe(1);

    const ok = await call(ctx.app, user, 'PATCH', '/api/tasks/ranks', {
      updates: [{ id: t1.id, rank: 20 }, { id: t2.id, rank: 10 }],
    });
    expect(ok.statusCode).toBe(204);
    const order = (await call(ctx.app, user, 'GET', '/api/tasks')).json();
    expect(order.map((r: { title: string }) => r.title)).toEqual(['two', 'one']);
  });
});

describe('health', () => {
  it('reports ok with the version', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/health' });
    expect(res.json()).toEqual({ ok: true, version: 'dev' });
  });
});
