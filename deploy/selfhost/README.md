# Self-hosted deploy (PoC)

Plan: `docs/plans/selfhost-azure-poc/`. Sites: `https://test.usereflow.app` (test), `https://prod.usereflow.app` (prod, until the cutover).

## What runs where

- Two Dokploy **Compose** services on the Azure VM (`reflow-test`, `reflow-prod`), each running `compose.yaml`: `db` (Postgres 17), `api` (Fastify), `web` (Caddy serving the SPA and proxying `/api`). Dokploy's Traefik terminates TLS.
- Env vars live in the Dokploy UI (compose → *Environment*), never in git. `.env.example` lists them.
- Test builds from `feature/selfhost-poc` (`dev` after the PoC merge), prod from `main`. Auto Deploy is **off**; only the workflow deploys.

| Env var | test | prod |
|---|---|---|
| `PGDATA_VOLUME` | `reflow_pgdata` | `reflow_prod_pgdata` |
| `DB_HOST_PORT` | `5432` | `5433` |
| `POSTGRES_PASSWORD` | own | a different one |
| `APP_VERSION`, `VITE_APP_VERSION` | `test-<n>` | `prod-<n>` |
| `BUILD_MODE` | `selfhosted` | `selfhosted` |

## Deploy

GitHub → *Actions* → **Selfhost deploy** → *Run workflow*, pick `test` (from `feature/selfhost-poc`) or `prod` (from `main`; needs a reviewer's approval). A push to `feature/selfhost-poc` deploys test.
It runs the app and server tests, calls Dokploy's `compose.deploy`, waits for the
deployment to finish, then checks `/api/health`. If tests fail, nothing is deployed.

Secrets: `SELFHOST_DOKPLOY_URL`, `SELFHOST_DOKPLOY_TOKEN`, `SELFHOST_COMPOSE_ID` (test), `SELFHOST_COMPOSE_ID_PROD`. GitHub environments: `selfhost-poc` (test), `selfhost-prod` (required reviewers).

## Roll back

Dokploy builds from git, so a rollback is a new build of an older state:

1. `git revert <bad sha>` on the environment's branch, push.
2. Run **Selfhost deploy** again for that environment.

Data is on the environment's volume and survives deploys. API migrations only
move forward, so a revert that needs an older schema needs a hand-written down migration.

## Reach the database

- From the VM: `docker exec $(docker ps -qf label=com.docker.compose.service=db) psql -U reflow -d reflow`
- From the laptop: `ssh -N -L 15432:localhost:5432 reflow-vm`, then connect to `localhost:15432` (prod: `-L 15433:localhost:5433`).
