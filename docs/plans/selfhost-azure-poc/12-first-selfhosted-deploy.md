# Phase 12 — First self-hosted deploy → 🎯 working demo

Outcome: `https://self.usereflow.app` runs the self-hosted build (phase 11)
plus the API (phase 10) against the VM's own Postgres. Supabase isn't
involved anywhere. It's deployed by the Dokploy Compose service from phase 09,
with the trigger still manual or on push. The tested, gated pipeline is phase 13.

## Repo changes [agent]

- [ ] **[agent]** `deploy/selfhost/compose.yaml`: add the `api` service:

  ```yaml
    api:
      build: ../../server
      restart: unless-stopped
      environment:
        DATABASE_URL: postgres://reflow:${POSTGRES_PASSWORD}@db:5432/reflow
        COOKIE_SECURE: "true"
        RUN_MIGRATIONS: "true"
        SESSION_TTL_DAYS: ${SESSION_TTL_DAYS}
        AUTH_RATE_LIMIT_PER_MIN: ${AUTH_RATE_LIMIT_PER_MIN}
        APP_VERSION: ${APP_VERSION}
      depends_on:
        db: { condition: service_healthy }
      expose: ["3000"]                 # internal only, never "ports:"
  ```
  Use explicit `environment:` entries rather than `env_file: .env`, so the API never sees the build-only `VITE_*` values.
- [ ] **[agent]** `deploy/selfhost/Caddyfile`: add `handle /api/*` → `reverse_proxy api:3000 { flush_interval -1 }` **before** the static `handle`. Flushing keeps SSE unbuffered. Traefik in front doesn't buffer streamed responses by default.
- [ ] **[agent]** `deploy/selfhost/.env.example`: add `SESSION_TTL_DAYS`, `AUTH_RATE_LIMIT_PER_MIN`, `APP_VERSION`. Comment that `VITE_SUPABASE_*` is only needed while `BUILD_MODE` isn't `selfhosted`.
- [ ] **[agent]** Commit, but **don't push yet** (auto-deploy would build with the old env). Push after the next section.

## Switch the environment [you]

- [ ] **[you]** Dokploy → `reflow` compose → *Environment*: set `BUILD_MODE=selfhosted`, `VITE_APP_VERSION=poc-1`, `APP_VERSION=poc-1`, `SESSION_TTL_DAYS=30`, `AUTH_RATE_LIMIT_PER_MIN=10`. Delete the three `VITE_SUPABASE_*` lines (the self-hosted build must not need them, per phase 11 requirement 2). Keep `POSTGRES_PASSWORD`. Save.
- [ ] **[agent]** Push `feature/selfhost-poc`. (If Auto Deploy is off, **[you]** click *Deploy*.)

## Deploy + check [you]

- [ ] **[you]** The deployment log in Dokploy finishes green. Building the API image on top of the web image takes longer than phase 09: note the time.
- [ ] **[you]** Dokploy → *Logs* → service `api`: migrations applied, listening on 3000, no errors.
- [ ] **[you]** `curl -s https://self.usereflow.app/api/health` → `{"ok":true,"version":"poc-1"}`
- [ ] **[you]** Browser: DevTools → *Application* → *Storage* → **Clear site data** on `self.usereflow.app`. This removes the Supabase build's service worker and cache from phase 09.

## Demo smoke test (tick each one)

- [ ] **[you]** The landing page loads with no Google/GitHub buttons. Sign up with a new email → you land on Today immediately.
- [ ] **[you]** Add 3 tasks. The third goes through the compare duel.
- [ ] **[you]** Drag-reorder. Reload → the order persists.
- [ ] **[you]** Complete one task, drop another. History shows both under today. Enter hours on the done one. Reload → the hours persist.
- [ ] **[you]** Toggle the theme. Reload → it persists.
- [ ] **[you]** Phone (or a second browser) signed in as the same user: complete a task on the laptop → it updates on the phone without a reload. (This is the SSE path through Traefik → Caddy → api. If it only updates after a reload, check buffering first.)
- [ ] **[you]** Sign out → sign back in → the data is there. A wrong password shows the normal error.
- [ ] **[you]** A second account can't see the first account's tasks.
- [ ] **[you]** Data really is on the VM: `docker exec $(docker ps -qf label=com.docker.compose.project=<project> -f label=com.docker.compose.service=db) psql -U reflow -d reflow -c 'select email, created_at from users;'`
- [ ] **[you]** `sudo reboot` → after ~1–2 min the site works again with nothing restarted by hand.
- [ ] **[you]** 🎯 **Milestone 2: working self-hosted demo.** Session log line, then move this file to `archive/`.
