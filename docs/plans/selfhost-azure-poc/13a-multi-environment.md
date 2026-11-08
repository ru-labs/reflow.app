# Phase 13a — Two environments on one VM: `test` and `prod`

Outcome: the stack from phase 12 becomes the **test** environment at
`https://test.usereflow.app`, and a second, empty **prod** stack runs beside it
with its own Postgres, volume and domain. Nothing is shared except the VM,
Dokploy and Traefik. Prod gets real data and its real domain
(`usereflow.app`) at the cutover (phase 15). Vercel and Supabase stay live
until then.

Numbered 13a so the existing phase files keep their names. It runs after
phase 13 (pipeline) and before phase 14 (load test, which now targets **test**).

## Decisions to make first [you]

- [x] **[you]** Prod's temporary domain before the cutover: `prod.usereflow.app`, replaced by `usereflow.app` + `www` in phase 15. Decided 2026-11-08.
- [x] **[you]** Branch per environment. Proposed: **test** deploys from `dev`-style integration (today `feature/selfhost-poc`), **prod** from `main`, matching the flow in CLAUDE.md. Prod deploys need a manual approval in GitHub. Decided 2026-11-08: the test branch is temporary; after the PoC is merged, test deploys from `dev`.
- [x] **[you]** Postgres layout: **one Postgres container per environment** (own volume, own password). Decided 2026-11-08.

## Make the compose multi-environment [agent]

- [x] **[agent]** `deploy/selfhost/compose.yaml`: parametrize everything that is currently hard-wired to one environment:
  - the volume name `reflow_pgdata` → `${PGDATA_VOLUME}` (still `external: true`)
  - the host DB port `127.0.0.1:5432:5432` → `127.0.0.1:${DB_HOST_PORT:-5432}:5432` (test 5432, prod 5433; localhost only, so the tunnel still works)
  - the Postgres tuning flags (`shared_buffers` etc.) → env vars with the current values as defaults, so test can run smaller than prod
- [x] **[agent]** Add `mem_limit` per service (env-overridable defaults, e.g. db 512m, api 384m, web 64m) so one environment can't starve the other or Dokploy. Verify the values against the measured RAM in the session log before choosing.
- [x] **[agent]** `deploy/selfhost/.env.example`: add `PGDATA_VOLUME`, `DB_HOST_PORT`, the tuning vars, and a table in `deploy/selfhost/README.md` (create it if phase 13 hasn't) of the env values for **test** and **prod**.
- [x] **[agent]** Make `APP_VERSION` / `VITE_APP_VERSION` carry the environment (e.g. `test-…` / `prod-…`) so `/api/health` and the version badge say which one you're looking at.
- [x] **[agent]** Phase 13's workflows (`selfhost-deploy.yml`, rollback): add an input `environment: test|prod` choosing the Dokploy compose ID (deviation: test keeps the existing `SELFHOST_COMPOSE_ID`, prod adds `SELFHOST_COMPOSE_ID_PROD`) and health-check URL. The `prod` job uses a GitHub *environment* with required reviewers.
- [ ] **[agent]** Commit, don't push yet (the compose changes must not redeploy test before its env vars exist).

## Rename self → test [you]

- [ ] **[you]** Cloudflare DNS: add an A record `test` → `98.71.18.196` (DNS only). Keep `self` for now.
- [ ] **[you]** Dokploy → `reflow` compose → *Environment*: add `PGDATA_VOLUME=reflow_pgdata`, `DB_HOST_PORT=5432`, and rename the compose service to `reflow-test` (display name only; the project name used by `docker exec` stays unless noted below).
- [ ] **[you]** Dokploy → Domains: change `self.usereflow.app` → `test.usereflow.app` (Let's Encrypt issues the cert on the first request).
- [ ] **[agent]** Push. **[you]** Deploy, then check `https://test.usereflow.app/api/health` and sign in with a phase-12 account. The data is still there because the volume is the same. (Cookies are per host, so you sign in once again.)
- [ ] **[you]** Cloudflare: delete the `self` A record. Update the Environment facts table in `00-overview.md` (Self-hosted URL, compose project names).

## Create prod [you]

- [ ] **[you]** VM: `docker volume create reflow_prod_pgdata`. A new volume means a new empty database. Test's data is not copied.
- [ ] **[you]** Cloudflare DNS: A record `prod` → `98.71.18.196` (DNS only).
- [ ] **[you]** Dokploy: new Compose service `reflow-prod`, same repo, branch `main` (or as decided above), compose path `deploy/selfhost/compose.yaml`. Environment: `BUILD_MODE=selfhosted`, **a different** `POSTGRES_PASSWORD` (save it in `/opt/reflow/.env.prod`, chmod 600), `PGDATA_VOLUME=reflow_prod_pgdata`, `DB_HOST_PORT=5433`, `APP_VERSION`/`VITE_APP_VERSION=prod-1`, `SESSION_TTL_DAYS=30`, `AUTH_RATE_LIMIT_PER_MIN=10`. **Auto Deploy off.**
- [ ] **[you]** Domain `prod.usereflow.app` → service `web`, port 80, HTTPS on.
- [ ] **[you]** Deploy. `curl.exe -s https://prod.usereflow.app/api/health` returns `{"ok":true,"version":"prod-1"}`.
- [ ] **[you]** Note both stacks' RAM from `docker stats --no-stream` and `free -m` in the session log (this is the real number for the idle question below).

## Isolation checks [you]

- [ ] **[you]** Sign up on `prod.usereflow.app` with a new email, add a task. Sign in to `test.usereflow.app` with the same email: it must **not** exist there, and test's tasks must not appear on prod.
- [ ] **[you]** `docker exec` into each `db` container: `select email from users;` shows only that environment's users.
- [ ] **[you]** Reboot the VM once with both stacks up. Both come back without help, and `free -m` shows no sustained swap use.
- [ ] **[you]** Dokploy → both stacks → *Environment* are separate; the test stack's `POSTGRES_PASSWORD` can't open the prod DB (`psql` with the wrong password fails).

## Backups per environment [agent + you]

- [ ] **[agent]** Extend the phase-09 nightly `pg_dump` cron so it dumps **both** `db` containers into `/opt/reflow/backups/<env>/` with the same retention. Write the script into `deploy/selfhost/` so it's in git.
- [ ] **[you]** Run it once by hand and check that both folders contain non-empty `.dump` files. The off-VM copy and a **tested restore** stay prerequisites of phase 15.

## Optional: let test sleep [you, decide after measuring]

Only worth doing if it frees meaningful memory. Decide from the RAM numbers
noted above: if the idle test stack uses < ~300 MB, skip this and keep it
always on.

- [ ] **[you]** Decision recorded in the session log: *always on / stop when idle*.
- [ ] **[agent]** (If stopping) Two small `workflow_dispatch` workflows, `test-sleep` and `test-wake`, calling Dokploy's compose stop / start API for the test compose, using the same token and the health gate from phase 13. Confirm the exact endpoints in `https://docs.dokploy.com/openapi.json`.
- [ ] **[you]** Wake it by running `test-wake` before testing (about 15–30 s to healthy). A request to a stopped stack makes Traefik return 404/502 until then.
- [ ] Not planned: automatic wake-on-first-request. It needs an extra always-on component that starts the stack on a request (e.g. a Traefik plugin such as Sablier). It's unverified with Dokploy compose mode, so treat it as a separate experiment.

## Verify the whole phase [you]

- [ ] **[you]** The pipeline from phase 13 deploys to `test` by default and to `prod` only after the approval click.
- [ ] **[you]** Phase 12's smoke list passes on `test.usereflow.app` (auth, duel, reorder, history, theme, SSE, isolation).
- [ ] **[you]** Session log line, update the Environment facts table and the architecture diagram's domains in `00-overview.md`, then move this file to `archive/`.
