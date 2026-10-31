# reflow server

Small Fastify API that replaces what the SPA uses from Supabase (queries, auth,
realtime) for the self-hosted build. Plan: `docs/plans/selfhost-azure-poc/`.

## Run locally

Needs Node 24 and the SSH tunnel to the VM's Postgres:

```bash
ssh -N -L 15432:localhost:5432 reflow-vm   # leave running
cd server
cp .env.example .env                        # fill in the DB password
npm install
npm run migrate                             # applies migrations/*.sql (also runs on startup)
npm run dev                                 # http://localhost:3000
```

Env vars are documented in `.env.example`. `DATABASE_URL` points at `reflow_dev`.

## Tests

```bash
npm test          # real Postgres via TEST_DATABASE_URL
npm run typecheck
```

Each test file **drops and recreates the `public` schema** of `TEST_DATABASE_URL`
(the database name must end in `_test`) and runs the migrations.

## Notes

- Mutating requests must send `Content-Type: application/json`, including
  `POST /api/auth/signout` (send `{}`), else 415.
- `request.ip` comes from `X-Forwarded-For` (`trustProxy`), so the reverse proxy
  in front must overwrite that header, or per-IP rate limiting is bypassable.
- `GET /api/tasks/stream` is Server-Sent Events. Events missed while the browser
  was disconnected are not replayed: the client should refetch on reconnect.
