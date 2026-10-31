import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createPool } from '../src/db.js';
import { runMigrations } from '../src/migrate.js';

export interface TestContext {
  app: FastifyInstance;
  pool: ReturnType<typeof createPool>;
}

/** Wipes the public schema of the test database, migrates, and builds the app. */
export async function setup(env: Record<string, string> = {}): Promise<TestContext> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is required (see server/.env.example)');
  // This wipes the schema, so refuse anything that isn't obviously a test database.
  if (!/\/[^/?]*_test(\?|$)/.test(url)) throw new Error('TEST_DATABASE_URL must point at a database ending in _test');

  const pool = createPool(url);
  await pool.query('drop schema public cascade');
  await pool.query('create schema public');
  await runMigrations(pool);

  const config = loadConfig({
    DATABASE_URL: url,
    COOKIE_SECURE: 'false',
    AUTH_RATE_LIMIT_PER_MIN: '0',
    ...env,
  });
  const app = await buildApp({ config, pool, logger: false });
  await app.ready();
  return { app, pool };
}

export async function teardown({ app, pool }: TestContext) {
  await app.close();
  await pool.end();
}

export interface TestUser {
  id: string;
  cookie: string;
}

const json = { 'content-type': 'application/json' };

export async function signup(app: FastifyInstance, email: string, password = 'password123'): Promise<TestUser> {
  const res = await app.inject({ method: 'POST', url: '/api/auth/signup', headers: json, payload: { email, password } });
  if (res.statusCode !== 200) throw new Error(`signup failed: ${res.statusCode} ${res.body}`);
  const setCookie = res.cookies.find((c) => c.name === 'reflow_session');
  return { id: res.json().user.id, cookie: `reflow_session=${setCookie!.value}` };
}

/** inject() with the user's session cookie and a JSON content type. */
export function call(app: FastifyInstance, user: TestUser, method: 'GET' | 'POST' | 'PATCH' | 'PUT', url: string, payload?: unknown) {
  return app.inject({ method, url, headers: { ...json, cookie: user.cookie }, payload: payload as object });
}
