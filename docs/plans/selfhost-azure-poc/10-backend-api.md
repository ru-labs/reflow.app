# Phase 10 — Self-hosted backend API (`server/`)

Outcome: a small Node API that replaces exactly what the SPA uses from
Supabase (PostgREST queries, Auth, Realtime), for the self-hosted build only.
Production is not affected by anything in this phase.

**Agent: read first.** `src/lib/tasks.ts`, `src/lib/theme.ts`,
`src/lib/validation.ts`, `src/hooks/useAuth.ts`, `src/hooks/useTasks.ts`, and
`supabase/migrations/*.sql` (non-`preprod_` files, in order). The API must
reproduce their behaviour. Decisions D1, D4–D6 in `00-overview.md` are settled.
Don't revisit them.

**Prerequisite [you]:** phases 05 and 09 done (the DB now runs under Dokploy; the tunnel is unchanged). The laptop has an SSH tunnel
(`ssh -N -L 15432:localhost:5432 reflow-vm`) and `server/.env` holds
`DATABASE_URL` (→ `reflow_dev`) and `TEST_DATABASE_URL` (→ `reflow_test`).

## Project skeleton

- [ ] **[agent]** Check out `feature/selfhost-poc` (created in phase 09) and pull. Every push to it triggers a Dokploy build of the default (Supabase) app; see phase 09 "Auto-deploy from git".
- [ ] **[agent]** `server/` as its **own npm package** (own `package.json`, `tsconfig.json`, lockfile), independent of the root app build. Stack: Node 24, TypeScript, **Fastify 5**, `pg`, `@fastify/cookie`, `@fastify/rate-limit`, `bcrypt` (native; fall back to `bcryptjs` only if the Alpine build is a problem), `vitest`, `tsx` for dev. Use Fastify's built-in JSON-schema validation. No ORM, no zod.
- [ ] **[agent]** Scripts: `dev` (tsx watch, loads `server/.env`), `build` (tsc → `dist/`), `start`, `test`, `migrate`.
- [ ] **[agent]** Make sure the root `tsc -b`, `oxlint` and `vitest` configs don't pick up `server/` (exclude it if needed), and root `npm run build`/`test`/`lint` still pass unchanged.
- [ ] **[agent]** `server/.env.example` documents: `DATABASE_URL`, `TEST_DATABASE_URL`, `PORT` (3000), `COOKIE_SECURE` (true in prod, false for local http), `SESSION_TTL_DAYS` (30), `AUTH_RATE_LIMIT_PER_MIN` (e.g. 10; `0` disables, used by the load test), `RUN_MIGRATIONS` (true). Note that root `.gitignore` already ignores `.env*`; add a `!server/.env.example` negation so the example is committed.

## Database schema — `server/migrations/0001_init.sql`

- [ ] **[agent]** Migration runner `server/src/migrate.ts`: applies `migrations/*.sql` in filename order, each in a transaction. Tracks applied files in a `schema_migrations(filename, applied_at)` table and takes `pg_advisory_lock` so two containers can't race. Runs on API startup when `RUN_MIGRATIONS=true`.
- [ ] **[agent]** `users(id uuid pk default gen_random_uuid(), email text not null, encrypted_password text, email_confirmed_at timestamptz, created_at timestamptz not null default now())`, with a unique index on `lower(email)`. Column names mirror Supabase `auth.users` so the phase-15 migration is a straight copy.
- [ ] **[agent]** `sessions(token_hash text pk, user_id uuid not null references users on delete cascade, created_at timestamptz default now(), expires_at timestamptz not null)` + an index on `user_id`.
- [ ] **[agent]** `tasks` equal to the **end state** of the Supabase migrations 0001+0002+0005+0006: all columns (incl. `note`, `due_time`, `tags text[] not null default '{}'`, `hours_spent numeric(5,2)`), all check constraints (`status`, title length/not blank, tags count, hours range), both indexes. FK `user_id → users(id) on delete cascade`. No RLS: isolation is enforced in the API (below).
- [ ] **[agent]** `profiles` equal to Supabase `0004_profiles.sql`, FK → `users`.
- [ ] **[agent]** Trigger `tasks_notify` (after insert or update, for each row): `pg_notify('task_changes', json_build_object('id', NEW.id, 'user_id', NEW.user_id)::text)`. Send **ids only**: NOTIFY payloads are capped at 8000 bytes and `note` is unbounded.
- [ ] **[agent]** Verify: `npm run migrate` against `reflow_dev` succeeds twice in a row (the second run is a no-op).

## Auth — `server/src/auth.ts`

- [ ] **[agent]** `POST /api/auth/signup {email, password}` validates with the same limits as `src/lib/validation.ts` (email ≤254 + format; password ≤72, min length the same as the Supabase project, default 6). Hashes with **bcrypt cost 10**. PoC: sets `email_confirmed_at = now()` immediately (D8), creates a session, and returns `{ user: { id, email } }`. A duplicate email returns 400 with a generic message.
- [ ] **[agent]** `POST /api/auth/signin`: wrong email or password both return 400 `{ error: "Invalid login credentials" }` (same string Supabase returns, so the UI copy is unchanged). On success, same response shape as signup.
- [ ] **[agent]** Session: 32 random bytes, base64url, sent as cookie `reflow_session` (`HttpOnly`, `Secure` per `COOKIE_SECURE`, `SameSite=Lax`, `Path=/api`, `Max-Age` = TTL). Only `sha256(token)` is stored in `sessions`.
- [ ] **[agent]** `POST /api/auth/signout` deletes the session row and clears the cookie. `GET /api/auth/session` returns `{ user }` or 401.
- [ ] **[agent]** A `preHandler` on all non-auth routes resolves the cookie to `request.userId` or replies 401. Mutating routes require `Content-Type: application/json` (cheap CSRF guard next to SameSite=Lax).
- [ ] **[agent]** Rate-limit signup/signin per IP using `AUTH_RATE_LIMIT_PER_MIN`.
- [ ] **[agent]** Never log request bodies (passwords). Fastify's default logger at `info` is fine.

## Data routes — one per function in `src/lib/tasks.ts` / `theme.ts`

Every query includes `WHERE user_id = $userId`. Touching another user's row
returns **404**, not 403. **The server never computes "today"**: the client
sends dates, exactly as the current code does.

- [ ] **[agent]** `GET /api/tasks?status=active` → active tasks ordered by `rank asc` (`listActiveTasks`).
- [ ] **[agent]** `POST /api/tasks {title, rank, tags}` → created row (`createTask`), 201.
- [ ] **[agent]** `PATCH /api/tasks/:id` with an allow-list of fields: `title, tags, status, completed_at, rank, last_triaged_on, hours_spent`. Covers `updateTask`, `updateTaskStatus`, `updateTaskRank`, `markTriaged`, `updateTaskHours`, `reopenTask`. Returns 204.
- [ ] **[agent]** `PATCH /api/tasks/ranks {updates:[{id,rank}]}` → all in **one transaction** (`updateTaskRanks`).
- [ ] **[agent]** `GET /api/tasks/completed-since?since=<ISO>` → `{ completed: boolean }` (`hasCompletedToday`; the client passes its local midnight).
- [ ] **[agent]** `GET /api/tasks/closed?from=<ISO>&to=<ISO>` → done+dropped, `completed_at` in `[from,to)`, newest first (`listClosedTasks`).
- [ ] **[agent]** `GET /api/tasks/last-active-rank` → `{ rank: number | null }`.
- [ ] **[agent]** `GET /api/profile/theme` → `{ theme }` (default `system`). `PUT /api/profile/theme {theme}` → upsert.
- [ ] **[agent]** Return `numeric` columns (`hours_spent`) as JSON numbers, and timestamps as ISO strings, the same shapes PostgREST returns today.

## Realtime — `server/src/stream.ts` (SSE)

- [ ] **[agent]** One dedicated `pg` client runs `LISTEN task_changes`, kept separate from the pool and reconnected on error.
- [ ] **[agent]** `GET /api/tasks/stream` (authenticated): `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`. The connection registers in `Map<userId, Set<reply>>`, with a heartbeat comment (`: ping`) every 25 s and cleanup on close.
- [ ] **[agent]** On a notification: if the user has open streams, fetch that one row by id and write `event: task\ndata: <row json>\n\n` to each. With no listeners, skip the query.

## Ops endpoints + container

- [ ] **[agent]** `GET /api/health` → runs `select 1`, returns `{ ok: true, version }` (version from env `APP_VERSION`) or 503.
- [ ] **[agent]** `pg.Pool` with `max: 20`, plus a graceful shutdown on SIGTERM (close streams, then the pool).
- [ ] **[agent]** `server/Dockerfile`: multi-stage `node:24-alpine`, `npm ci` → `tsc` → a prod-deps-only runtime stage, `USER node`, `EXPOSE 3000`, `CMD ["node","dist/index.js"]`. Copy `migrations/` into the image.
- [ ] **[agent]** Add a `server/README.md` section (short): how to run locally with the tunnel, env vars, and how to run tests.

## Tests — `server/test/*.test.ts` (vitest, real Postgres via `TEST_DATABASE_URL`)

- [ ] **[agent]** Each test file resets the schema (drop/recreate, then run migrations) so tests are independent.
- [ ] **[agent]** Auth: signup → cookie set; signin wrong password → 400 with the exact message; signout → subsequent `GET /api/auth/session` returns 401; expired session → 401.
- [ ] **[agent]** **Isolation:** user B cannot list, patch, or rank-update user A's task (404, row unchanged). This is the test that replaces RLS. Treat it as critical.
- [ ] **[agent]** Validation: title blank or >200, >10 tags, and hours 0 or 25 are all rejected with 400 (and the DB constraints would reject them too).
- [ ] **[agent]** `closed` range bounds are `[from, to)`. `completed-since` is true/false correctly. Bulk ranks are atomic: one bad id → nothing updated.
- [ ] **[agent]** SSE: open a stream as user A, PATCH A's task → the event arrives within 2 s. A PATCH by user B produces no event on A's stream.
- [ ] **[agent]** `npm test` in `server/` is green. Root `npm run test && npm run lint && npm run build` is still green.
- [ ] **[agent]** Commit on `feature/selfhost-poc`. Session log line, then move this file to `archive/`.
