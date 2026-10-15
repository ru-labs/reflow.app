# Phase 10 — First self-hosted deploy (manual) → 🎯 working demo

Outcome: `https://self.usereflow.app` runs the self-hosted build against the
VM's own Postgres. Supabase isn't involved anywhere. Deliberately manual, so
every moving part is understood before it's automated in phase 11.

## Canonical deploy files in the repo

- [ ] **[agent]** Create `deploy/selfhost/compose.yaml`: `db` exactly as in phase 05, `caddy` as in phase 06 but mounting `./releases:/srv/releases:ro` instead of `./www` (layout explained below), plus:

  ```yaml
    api:
      image: ${API_IMAGE:-reflow-api:local}
      build: ./src/server              # used for the manual build on the VM
      restart: unless-stopped
      env_file: .env
      environment:
        DATABASE_URL: postgres://reflow:${POSTGRES_PASSWORD}@db:5432/reflow
        COOKIE_SECURE: "true"
        RUN_MIGRATIONS: "true"
      depends_on:
        db: { condition: service_healthy }
      expose: ["3000"]                 # internal only, never "ports:"
  ```
- [ ] **[agent]** Create `deploy/selfhost/Caddyfile`: the phase-07 version with `root * /srv/releases/current`, plus `handle /api/*` → `reverse_proxy api:3000 { flush_interval -1 }` placed **before** the static `handle` (flush so SSE isn't buffered).
- [ ] **[agent]** Create `deploy/selfhost/.env.example` listing `POSTGRES_PASSWORD`, `SESSION_TTL_DAYS`, `AUTH_RATE_LIMIT_PER_MIN`, `APP_VERSION`, with no values.
- [ ] **[agent]** Commit and push `feature/selfhost-poc`.

## Get the code onto the VM (read-only deploy key)

- [ ] **[you]** On the VM: `ssh-keygen -t ed25519 -C "vm-reflow-poc deploy" -f ~/.ssh/github_reflow -N ""`, then `cat ~/.ssh/github_reflow.pub`.
- [ ] **[you]** GitHub → repo → *Settings → Deploy keys → Add deploy key* → paste it. **Leave "Allow write access" unticked.**
- [ ] **[you]** On the VM, add to `~/.ssh/config`: `Host github.com` / `IdentityFile ~/.ssh/github_reflow` / `IdentitiesOnly yes`.
- [ ] **[you]** `git clone git@github.com:<owner>/<repo>.git /opt/reflow/src && cd /opt/reflow/src && git checkout feature/selfhost-poc`

## Switch /opt/reflow to the repo's compose + Caddyfile

- [ ] **[you]** Back up the hand-written versions: `cd /opt/reflow && cp compose.yaml compose.yaml.phase07 && cp Caddyfile Caddyfile.phase07`
- [ ] **[you]** `cp src/deploy/selfhost/compose.yaml src/deploy/selfhost/Caddyfile /opt/reflow/`
- [ ] **[you]** In the Caddyfile, put your email back into the global block if the repo copy has a placeholder.
- [ ] **[you]** Add to `/opt/reflow/.env` (keep `POSTGRES_PASSWORD`): `SESSION_TTL_DAYS=30`, `AUTH_RATE_LIMIT_PER_MIN=10`, `APP_VERSION=poc-manual-1`.
- ⚠️ Always run compose **from `/opt/reflow`**. The project name comes from the directory, and the existing volumes (`reflow_pgdata`, `reflow_caddy_data`) are only reused if it stays `reflow`.

## Static files: release folders + `current` symlink

- [ ] **[you]** Laptop, repo root, on `feature/selfhost-poc`: `npm ci; npm run build:selfhosted`
- [ ] **[you]** VM: `mkdir -p /opt/reflow/releases/manual-1`
- [ ] **[you]** Laptop: `scp -r dist/* reflow-vm:/opt/reflow/releases/manual-1/`
- [ ] **[you]** VM: `cd /opt/reflow/releases && ln -sfn manual-1 current`. A **relative** link, so it resolves inside the container too. Rollback later = point `current` at the previous folder.

## Start it

- [ ] **[you]** `cd /opt/reflow && docker compose build api` (a few minutes on 1 vCPU)
- [ ] **[you]** `docker compose up -d` → `docker compose ps`: `db` healthy, `api` running, `caddy` running.
- [ ] **[you]** `docker compose logs api --tail 50`: migrations applied, listening on 3000, no errors.
- [ ] **[you]** `curl -s https://self.usereflow.app/api/health` → `{"ok":true,...}`
- [ ] **[you]** Browser: DevTools → *Application* → *Storage* → **Clear site data** on `self.usereflow.app`. This removes the old Supabase build's service worker and cache from phase 07.

## Demo smoke test (tick each one)

- [ ] **[you]** The landing page loads with no Google/GitHub buttons. Sign up with a new email → you land on Today immediately.
- [ ] **[you]** Add 3 tasks. The third goes through the compare duel.
- [ ] **[you]** Drag-reorder. Reload → the order persists.
- [ ] **[you]** Complete one task, drop another. History shows both under today. Enter hours on the done one. Reload → the hours persist.
- [ ] **[you]** Toggle the theme. Reload → it persists.
- [ ] **[you]** Phone (or a second browser) signed in as the same user: complete a task on the laptop → it updates on the phone without a reload.
- [ ] **[you]** Sign out → sign back in → the data is there. A wrong password shows the normal error.
- [ ] **[you]** A second account can't see the first account's tasks.
- [ ] **[you]** Data really is on the VM: `docker compose exec db psql -U reflow -d reflow -c 'select email, created_at from users;'`
- [ ] **[you]** `sudo reboot` → after ~1 min the site works again with nothing restarted by hand.
- [ ] **[you]** 🎯 **Milestone 2: working self-hosted demo.** Session log line, then move this file to `archive/`.
