import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Config } from './config.js';
import type { Pool } from './db.js';
import { validateEmail, validatePassword } from './validation.js';

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
  }
}

const COOKIE_NAME = 'reflow_session';
const BCRYPT_COST = 10;
// Compared against when the email is unknown, so signin takes the same time either way.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_COST);

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

const credentialsSchema = {
  type: 'object',
  required: ['email', 'password'],
  properties: { email: { type: 'string' }, password: { type: 'string' } },
};

async function startSession(pool: Pool, config: Config, reply: FastifyReply, userId: string) {
  const token = randomBytes(32).toString('base64url');
  const ttlSeconds = config.sessionTtlDays * 24 * 60 * 60;
  await pool.query(
    `insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + make_interval(secs => $3))`,
    [hashToken(token), userId, ttlSeconds],
  );
  reply.setCookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path: '/api',
    maxAge: ttlSeconds,
  });
}

/** preHandler for every non-auth route: resolves the session cookie to request.userId or replies 401. */
export function requireSession(pool: Pool) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.cookies[COOKIE_NAME];
    if (token) {
      const { rows } = await pool.query<{ user_id: string }>(
        'select user_id from sessions where token_hash = $1 and expires_at > now()',
        [hashToken(token)],
      );
      if (rows[0]) {
        request.userId = rows[0].user_id;
        return;
      }
    }
    return reply.code(401).send({ error: 'Not signed in' });
  };
}

export async function authRoutes(app: FastifyInstance, { pool, config }: { pool: Pool; config: Config }) {
  const limited =
    config.authRateLimitPerMin > 0
      ? { config: { rateLimit: { max: config.authRateLimitPerMin, timeWindow: '1 minute' } } }
      : {};

  app.post<{ Body: { email: string; password: string } }>(
    '/api/auth/signup',
    { schema: { body: credentialsSchema }, ...limited },
    async (request, reply) => {
      const email = validateEmail(request.body.email);
      if (!email.ok) return reply.code(400).send({ error: email.error });
      const password = validatePassword(request.body.password, 'signup');
      if (!password.ok) return reply.code(400).send({ error: password.error });

      const hash = await bcrypt.hash(password.value, BCRYPT_COST);
      // PoC (D8): no email confirmation, so the account is confirmed immediately.
      const { rows } = await pool.query<{ id: string }>(
        `insert into users (email, encrypted_password, email_confirmed_at) values ($1, $2, now())
         on conflict do nothing returning id`,
        [email.value.toLowerCase(), hash],
      );
      if (!rows[0]) return reply.code(400).send({ error: 'Unable to sign up with those details' });

      await startSession(pool, config, reply, rows[0].id);
      return { user: { id: rows[0].id, email: email.value.toLowerCase() } };
    },
  );

  app.post<{ Body: { email: string; password: string } }>(
    '/api/auth/signin',
    { schema: { body: credentialsSchema }, ...limited },
    async (request, reply) => {
      const invalid = () => reply.code(400).send({ error: 'Invalid login credentials' });
      const email = validateEmail(request.body.email);
      const password = validatePassword(request.body.password, 'signin');
      if (!email.ok || !password.ok) return invalid();

      const { rows } = await pool.query<{ id: string; email: string; encrypted_password: string | null }>(
        'select id, email, encrypted_password from users where lower(email) = $1',
        [email.value.toLowerCase()],
      );
      const user = rows[0];
      const matches = await bcrypt.compare(password.value, user?.encrypted_password ?? DUMMY_HASH);
      if (!user || !matches) return invalid();

      await pool.query('delete from sessions where user_id = $1 and expires_at < now()', [user.id]);
      await startSession(pool, config, reply, user.id);
      return { user: { id: user.id, email: user.email } };
    },
  );

  app.post('/api/auth/signout', async (request, reply) => {
    const token = request.cookies[COOKIE_NAME];
    if (token) await pool.query('delete from sessions where token_hash = $1', [hashToken(token)]);
    reply.clearCookie(COOKIE_NAME, { path: '/api' });
    return reply.code(204).send();
  });

  app.get('/api/auth/session', { preHandler: requireSession(pool) }, async (request, reply) => {
    const { rows } = await pool.query<{ id: string; email: string }>('select id, email from users where id = $1', [
      request.userId,
    ]);
    if (!rows[0]) return reply.code(401).send({ error: 'Not signed in' });
    return { user: rows[0] };
  });
}
