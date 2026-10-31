import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { authRoutes, requireSession } from './auth.js';
import type { Config } from './config.js';
import type { Pool } from './db.js';
import { createTaskStream } from './stream.js';
import { taskRoutes } from './tasks.js';

export async function buildApp({ config, pool, logger = true }: { config: Config; pool: Pool; logger?: boolean }) {
  const app = Fastify({
    logger,
    // Runs behind Traefik/Caddy, so request.ip must come from X-Forwarded-For (rate limiting is per IP).
    trustProxy: true,
    // Shutdown must not wait on lingering keep-alive or event-stream connections.
    forceCloseConnections: true,
    // No coercion: `null` must not silently become 0 for a number field.
    ajv: { customOptions: { coerceTypes: false } },
  });

  await app.register(cookie);
  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: () =>
      Object.assign(new Error('Too many attempts, try again in a minute'), { statusCode: 429 }),
  });

  // Cheap CSRF guard next to SameSite=Lax: a cross-site form post can't send application/json.
  app.addHook('onRequest', async (request, reply) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
    if (!request.headers['content-type']?.startsWith('application/json')) {
      return reply.code(415).send({ error: 'Content-Type must be application/json' });
    }
  });

  app.setErrorHandler((err: Error & { statusCode?: number; code?: string }, request, reply) => {
    // A DB check constraint tripped despite request validation: still the caller's fault.
    if (err.code === '23514') return reply.code(400).send({ error: 'Invalid value' });
    if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ error: err.message });
    request.log.error(err);
    return reply.code(500).send({ error: 'Internal server error' });
  });

  app.get('/api/health', async (_request, reply) => {
    try {
      await pool.query('select 1');
      return { ok: true, version: config.appVersion };
    } catch {
      return reply.code(503).send({ ok: false });
    }
  });

  await app.register(authRoutes, { pool, config });

  const stream = createTaskStream(pool, config.databaseUrl, app.log);
  app.addHook('onReady', stream.start);
  // preClose: open event streams would otherwise keep server.close() waiting.
  app.addHook('preClose', stream.close);

  await app.register(async (authed) => {
    authed.addHook('preHandler', requireSession(pool));
    await authed.register(taskRoutes, { pool, stream });
  });

  return app;
}
