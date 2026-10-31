import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setup, signup, teardown, type TestContext } from './helpers.js';

const json = { 'content-type': 'application/json' };
let ctx: TestContext;
beforeAll(async () => void (ctx = await setup()));
afterAll(() => teardown(ctx));

describe('auth', () => {
  it('signup sets an httpOnly session cookie and stores only a hash of the token', async () => {
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/auth/signup', headers: json, payload: { email: 'Ann@Example.com', password: 'secret123' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.email).toBe('ann@example.com');
    const cookie = res.cookies.find((c) => c.name === 'reflow_session')!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.path).toBe('/api');
    expect(cookie.sameSite).toBe('Lax');
    const { rows } = await ctx.pool.query('select token_hash from sessions');
    expect(rows.map((r) => r.token_hash)).not.toContain(cookie.value);
  });

  it('rejects a duplicate email (case-insensitive) with 400', async () => {
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/auth/signup', headers: json, payload: { email: 'ANN@example.com', password: 'secret123' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('signup enforces the same limits as the client', async () => {
    const short = await ctx.app.inject({ method: 'POST', url: '/api/auth/signup', headers: json, payload: { email: 'b@example.com', password: '123' } });
    const bad = await ctx.app.inject({ method: 'POST', url: '/api/auth/signup', headers: json, payload: { email: 'nope', password: 'secret123' } });
    const long = await ctx.app.inject({ method: 'POST', url: '/api/auth/signup', headers: json, payload: { email: 'b@example.com', password: 'x'.repeat(73) } });
    expect([short.statusCode, bad.statusCode, long.statusCode]).toEqual([400, 400, 400]);
  });

  it('signin with a wrong password or unknown email returns the exact Supabase message', async () => {
    for (const payload of [
      { email: 'ann@example.com', password: 'wrong-pass' },
      { email: 'nobody@example.com', password: 'secret123' },
    ]) {
      const res = await ctx.app.inject({ method: 'POST', url: '/api/auth/signin', headers: json, payload });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: 'Invalid login credentials' });
    }
  });

  it('signin works, session resolves, signout revokes it', async () => {
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/auth/signin', headers: json, payload: { email: 'ann@example.com', password: 'secret123' },
    });
    expect(res.statusCode).toBe(200);
    const user = { id: res.json().user.id, cookie: `reflow_session=${res.cookies[0].value}` };

    expect((await call(ctx.app, user, 'GET', '/api/auth/session')).json().user.email).toBe('ann@example.com');
    expect((await call(ctx.app, user, 'POST', '/api/auth/signout', {})).statusCode).toBe(204);
    expect((await call(ctx.app, user, 'GET', '/api/auth/session')).statusCode).toBe(401);
  });

  it('an expired session is rejected', async () => {
    const user = await signup(ctx.app, 'expired@example.com');
    await ctx.pool.query(`update sessions set expires_at = now() - interval '1 minute' where user_id = $1`, [user.id]);
    expect((await call(ctx.app, user, 'GET', '/api/tasks')).statusCode).toBe(401);
  });

  it('data routes need a session', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/api/tasks' })).statusCode).toBe(401);
  });

  it('mutating requests without a JSON content type are refused', async () => {
    const user = await signup(ctx.app, 'csrf@example.com');
    const res = await ctx.app.inject({
      method: 'POST', url: '/api/tasks', headers: { cookie: user.cookie, 'content-type': 'text/plain' }, payload: 'title=x',
    });
    expect(res.statusCode).toBe(415);
  });
});
