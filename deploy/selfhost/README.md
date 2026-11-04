# Self-hosted deploy (PoC)

Plan: `docs/plans/selfhost-azure-poc/`. Site: `https://self.usereflow.app`.

## What runs where

- One Dokploy **Compose** service (`reflow`) on the Azure VM runs `compose.yaml`: `db` (Postgres 17), `api` (Fastify), `web` (Caddy serving the SPA and proxying `/api`). Dokploy's Traefik terminates TLS.
- Env vars live in the Dokploy UI (compose → *Environment*), never in git. `.env.example` lists them.
- Dokploy builds from the head of `feature/selfhost-poc`. Auto Deploy is **off**; only the workflow deploys.

## Deploy

GitHub → *Actions* → **Selfhost deploy** → *Run workflow* on `feature/selfhost-poc`.
It runs the app and server tests, calls Dokploy's `compose.deploy`, waits for the
deployment to finish, then checks `/api/health`. If tests fail, nothing is deployed.

Secrets: `SELFHOST_DOKPLOY_URL`, `SELFHOST_DOKPLOY_TOKEN`, `SELFHOST_COMPOSE_ID`.

## Roll back

Dokploy builds from git, so a rollback is a new build of an older state:

1. `git revert <bad sha>` on `feature/selfhost-poc`, push.
2. Run **Selfhost deploy** again.

Data is on the `reflow_pgdata` volume and survives deploys. API migrations only
move forward, so a revert that needs an older schema needs a hand-written down migration.

## Reach the database

- From the VM: `docker exec $(docker ps -qf label=com.docker.compose.service=db) psql -U reflow -d reflow`
- From the laptop: `ssh -N -L 15432:localhost:5432 reflow-vm`, then connect to `localhost:15432`.
