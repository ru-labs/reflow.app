import { afterAll, beforeAll, expect, it } from 'vitest';
import { call, setup, signup, teardown, type TestContext, type TestUser } from './helpers.js';

let ctx: TestContext;
let base: string;
let a: TestUser;
let b: TestUser;
beforeAll(async () => {
  ctx = await setup();
  base = await ctx.app.listen({ port: 0, host: '127.0.0.1' });
  a = await signup(ctx.app, 'a@example.com');
  b = await signup(ctx.app, 'b@example.com');
});
afterAll(() => teardown(ctx));

/** Opens the SSE stream and accumulates the decoded text until closed. */
async function openStream(user: TestUser) {
  const abort = new AbortController();
  const res = await fetch(`${base}/api/tasks/stream`, { headers: { cookie: user.cookie }, signal: abort.signal });
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toBe('text/event-stream');
  let received = '';
  const reader = res.body!.getReader();
  const reading = (async () => {
    const decoder = new TextDecoder();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        received += decoder.decode(value);
      }
    } catch {
      // aborted
    }
  })();
  return {
    get text() {
      return received;
    },
    async close() {
      abort.abort();
      await reading;
    },
  };
}

const waitFor = async (fn: () => boolean, ms = 2000) => {
  const end = Date.now() + ms;
  while (!fn() && Date.now() < end) await new Promise((r) => setTimeout(r, 25));
};

it("delivers a user's own task changes within 2s, and not other users'", async () => {
  const streamA = await openStream(a);
  try {
    const created = (await call(ctx.app, a, 'POST', '/api/tasks', { title: 'live', rank: 1 })).json();
    await waitFor(() => streamA.text.includes('event: task'));
    expect(streamA.text).toContain('event: task');
    expect(streamA.text).toContain('"title":"live"');

    await call(ctx.app, a, 'PATCH', `/api/tasks/${created.id}`, { title: 'renamed' });
    await waitFor(() => streamA.text.includes('"title":"renamed"'));
    expect(streamA.text).toContain('"title":"renamed"');

    const before = streamA.text;
    await call(ctx.app, b, 'POST', '/api/tasks', { title: 'bs secret', rank: 1 });
    await new Promise((r) => setTimeout(r, 500));
    expect(streamA.text).toBe(before);
  } finally {
    await streamA.close();
  }
});

it('requires a session', async () => {
  const res = await fetch(`${base}/api/tasks/stream`);
  await res.arrayBuffer();
  expect(res.status).toBe(401);
});
