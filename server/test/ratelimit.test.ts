import { afterAll, beforeAll, expect, it } from 'vitest';
import { setup, teardown, type TestContext } from './helpers.js';

let ctx: TestContext;
beforeAll(async () => void (ctx = await setup({ AUTH_RATE_LIMIT_PER_MIN: '3' })));
afterAll(() => teardown(ctx));

it('limits signin attempts per IP', async () => {
  const statuses: number[] = [];
  for (let i = 0; i < 5; i++) {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/signin',
      headers: { 'content-type': 'application/json' },
      payload: { email: 'a@example.com', password: 'whatever1' },
    });
    statuses.push(res.statusCode);
  }
  expect(statuses).toEqual([400, 400, 400, 429, 429]);
});
