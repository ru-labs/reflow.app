# Phase 09 — Current app + Postgres under Dokploy, deployed from git

Outcome: what ran by hand in `/opt/reflow` (Postgres from phase 05 and the
Supabase-DEV build from phases 06–07) now runs as **one Dokploy Compose
service**, built **on the VM from the git branch**. A push to
`feature/selfhost-poc` redeploys it automatically. `self.usereflow.app` is
back online (Milestone 1 again, now under Dokploy), and the existing DB
volume is reused, so `reflow_dev`/`reflow_test` survive.

This phase also **measures how expensive an on-VM build is** (time, peak
RAM). Phase 13 uses those numbers to decide whether builds stay on the VM.

## Target layout

```
browser ──HTTPS──► Traefik (Dokploy, :80/:443, Let's Encrypt)
                     └── self.usereflow.app → web (Caddy, :80, static SPA, no TLS)
                                               (phase 12 adds: /api/* → api:3000)
                     db (postgres:17, 127.0.0.1:5432 only, volume reflow_pgdata)
```

Caddy stays, but only as an **internal** static server and (from phase 12)
the `/api` router. TLS and the public ports belong to Traefik. Path routing
lives in a repo file instead of Dokploy's UI, so the setup still works without
Dokploy.

## Repo files [agent]

- [x] **[agent]** Create the branch `feature/selfhost-poc` from `dev`. (This used to be the first step of the API phase. Phase 10 now just continues on it.)
- [x] **[agent]** `deploy/selfhost/web.Dockerfile`, multi-stage:
  1. `node:24-alpine`: copy `package.json`, `package-lock.json` **and `patches/`** (the `postinstall: patch-package` needs them), `npm ci`, copy the rest, then `npx tsc -b && npx vite build --mode ${BUILD_MODE}`. Declare `ARG BUILD_MODE=production` and `ARG`s for `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_SCHEMA`, `VITE_APP_VERSION`, `VITE_APP_COMMIT`. Vite reads `VITE_*` from the process env, and build args are in the env during `RUN`.
  2. `caddy:2-alpine`: `COPY deploy/selfhost/Caddyfile /etc/caddy/Caddyfile` and `COPY --from=build /app/dist /srv/www`. Bake the Caddyfile in rather than bind-mounting it: Dokploy re-clones the repo on every deploy, and its docs warn that repo bind mounts can end up empty.
- [x] **[agent]** `deploy/selfhost/Caddyfile`: one site `:80` (plain HTTP inside the network; Traefik terminates TLS) with the phase-06 block unchanged: `root * /srv/www`, `encode zstd gzip`, the `no-cache` headers for `index.html`/`sw.js`/`registerSW.js`/`manifest.webmanifest`, the `immutable` header for `/assets/*`, `try_files {path} /index.html`, `file_server`. No global `email` block (Caddy doesn't issue certs any more).
- [x] **[agent]** `deploy/selfhost/compose.yaml` (Dokploy runs it in *Docker Compose* mode, not *Stack*, because Stack can't `build:`):
  - `db`: identical to phase 05 (image `postgres:17-alpine`, same `command:` tuning, healthcheck, `ports: "127.0.0.1:5432:5432"` for the laptop tunnel). The volume `pgdata` is declared `external: true, name: reflow_pgdata`. That's the volume phase 05 created, so no data copy is needed.
  - `web`: `build: { context: ../.., dockerfile: deploy/selfhost/web.Dockerfile, args: {BUILD_MODE, VITE_*} }` with each arg taken from `${…}` (Dokploy writes its Environment tab into a `.env` next to the compose file, and compose interpolates from it). `restart: unless-stopped`, `expose: ["80"]`, **no `ports:`** (Traefik reaches it over the network).
  - No `container_name` and no `dokploy-network`: *Isolated Deployment* (set below) creates the network and attaches Traefik.
- [x] **[agent]** Root `.dockerignore`: `node_modules`, `dist`, `.env*`, `.git`, `.vercel`, `.playwright-mcp`, `docs`. Don't exclude `patches/`.
- [x] **[agent]** `deploy/selfhost/.env.example`: `POSTGRES_PASSWORD`, `BUILD_MODE`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_SCHEMA`, `VITE_APP_VERSION`, all with no values. Add `!deploy/selfhost/.env.example` to `.gitignore` (it ignores `.env*` at any depth).
- [x] **[agent]** Root `npm run test && npm run lint && npm run build` is still green (nothing in `src/` changed). The agent has no local Docker, so the image build itself is verified by the first Dokploy deploy below.
- [x] **[agent]** Commit and push `feature/selfhost-poc`.

## Connect GitHub [you]

The repo (`ru-labs/reflow.app`) is public, so cloning needs no credentials.
The GitHub App is what makes push-to-deploy work with no webhook setup.

- [x] **[you]** Dokploy → *Settings → Git → GitHub* → **Create GitHub App**. GitHub opens. Install it on the `ru-labs` org, **only on `reflow.app`**. (You need to be an org owner. If you can't install it, fall back to the *Git* provider with the HTTPS clone URL, plus the manual webhook in "Auto-deploy" below.)
- [x] **[you]** Back in Dokploy, the GitHub provider shows as connected.

## Create the Compose service [you]

- [x] **[you]** Dokploy → *Projects* → **Create Project** `reflow-poc` → *Create Service* → **Compose** → name `reflow`.
- [x] **[you]** *General*: provider **GitHub**, repo `reflow.app`, branch `feature/selfhost-poc`, compose path `./deploy/selfhost/compose.yaml`, compose type **Docker Compose**. Save.
- [x] **[you]** *Advanced → Utilities*: turn on **Isolated Deployment**.
- [x] **[you]** *Environment* tab (values are never committed):
  - `POSTGRES_PASSWORD` = **the exact value from `/opt/reflow/.env`**. Postgres only reads it when it initialises an empty volume. With a different value the volume keeps the old password, and the API's connection fails later in a confusing way.
  - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_SCHEMA=public`: the DEV values from your laptop's `.env.poc.local` (the same build as phase 06).
  - `BUILD_MODE=production`, `VITE_APP_VERSION=dokploy-1`
- [x] **[you]** *Domains* tab → Add domain: host `self.usereflow.app`, service **`web`**, container port **80**, path `/`, HTTPS **on**, certificate **Let's Encrypt**.

## Hand over the DB volume, then deploy [you]

- [x] **[you]** Stop the old hand-made project so two Postgres processes never open the same volume: `cd /opt/reflow && docker compose down`. **No `-v`**, so the volumes stay. Confirm `docker volume ls | grep reflow_pgdata` still lists it.
- [x] **[you]** In a second `ssh reflow-vm` terminal, start a crude meter for the build: `while true; do date +%T; free -m | awk 'NR==2{print "used MB:",$3}'; sleep 5; done | tee ~/dokploy-build-1.log`
- [x] **[you]** Dokploy → **Deploy**. Watch the deployment log until it finishes. Then stop the meter (Ctrl+C).
- [x] **[you]** Session log: build duration (from the deployment log), peak "used MB", and whether swap was used (`free -m`). These numbers drive the phase-13 decision.

## Run notes (what differed from the plan)

- Repo is now `ru-labs/reflow.app` (public); the local `origin` still pointed at the old personal URL (GitHub redirects).
- A GitHub App created under a personal account can't be installed on an org. Recreated it with Organization `ru-labs` in Dokploy's create form, then installed on `reflow.app` only.
- Dokploy v0.30.8 marks *Isolated Deployment* as deprecated (Networks section is the replacement). Kept it on; revisit if the site doesn't survive the final reboot. Compose project name: `reflowpoc-reflow-edbr4g`.
- `.env.poc.local` was on the other PC; used the Supabase values from `.env.local` instead.
- Build on the VM: idle ~1600 MB used, peak 2075 MB (+~475 MB), swap untouched. Build duration: ~30 s cold (base images pulled; `npm ci` 10 s, `tsc` + `vite build` 9 s, the rest is image pull and export; the log has no total line).
- First Let's Encrypt request failed with `TLS handshake timeout` while the build was running (20:08:53), so Traefik kept its default cert. `docker restart dokploy-traefik` fixed it.
- Cron backup now uses the compose-project label (`reflowpoc-reflow-edbr4g`). The nightly dump is of the `reflow` DB only (~1.3 KB, empty); `reflow_dev` / `reflow_test` are not in it. Revisit when the API stores real data.
- Reboot check passed: db healthy, web + Dokploy + Traefik up with no manual start; `https://self.usereflow.app` 200, `http` redirects to `https`, panel 200, DB port still 127.0.0.1 only, tunnel on 15432 works.

## Verify [you]

- [x] **[you]** Find the compose project name Dokploy generated: `docker ps --format '{{.Names}}\t{{.Label "com.docker.compose.project"}}'`. Note it in Environment facts as *Dokploy compose project*. It's used below and in phases 12–14.
- [x] **[you]** Volume reuse worked: `docker exec $(docker ps -qf label=com.docker.compose.project=<project> -f label=com.docker.compose.service=db) psql -U reflow -l` lists `reflow`, `reflow_dev` and `reflow_test`.
- [x] **[you]** *Laptop:* the DB tunnel on `localhost:15432` still connects to `reflow_dev` (the agent needs it in phase 10).
- [x] **[you]** `https://self.usereflow.app`: valid padlock (now issued for Traefik), and `http://` redirects to `https://`.
- [x] **[you]** Sign in with a DEV account → Today loads. Add a task → it shows on DEV. (Service worker: the app is the same build as before, so no "Clear site data" is needed. If the page looks stale, do it anyway.)

## Auto-deploy from git [you + agent]

- [x] **[you]** Compose service → *General* → **Auto Deploy** on.
- [x] **[agent]** Push a harmless commit to `feature/selfhost-poc` (e.g. a comment in `deploy/selfhost/Caddyfile`).
- [x] **[you]** Within a minute a new deployment shows in Dokploy, and it finishes green. If nothing happens: GitHub → org settings → *GitHub Apps* → the Dokploy app → *Advanced* → recent deliveries. (Dokploy 0.27.1 had a known bug that acknowledged webhooks without deploying: issue #3787. Check the installed version is newer.)
- [x] **[you]** Know what this means for phases 10–11: **every agent push to this branch now triggers a VM build.** That's harmless, because the default build still produces the Supabase app (D2) and the compose has no `api` yet, but each push spends a few CPU credits. If that gets annoying, turn Auto Deploy off and use the **Deploy** button.

## Clean up the hand-made setup [you]

- [x] **[you]** Nightly backup now has to find the container by label. `crontab -e`, replace the phase-05 line with:

  ```
  0 3 * * * docker exec $(docker ps -qf label=com.docker.compose.project=<project> -f label=com.docker.compose.service=db) pg_dump -U reflow -Fc reflow > /opt/reflow/backups/reflow-$(date +\%F).dump && find /opt/reflow/backups -name '*.dump' -mtime +7 -delete
  ```
  Run the command once by hand → a new non-empty `.dump` in `/opt/reflow/backups`.
- [x] **[you]** `mv /opt/reflow/compose.yaml /opt/reflow/compose.yaml.retired` and `mv /opt/reflow/Caddyfile /opt/reflow/Caddyfile.retired`. Keep `/opt/reflow/.env` (chmod 600) as the offline record of `POSTGRES_PASSWORD`. Delete `/opt/reflow/www` (the build now lives in the `web` image).
- [x] **[you]** Remove the old Caddy volumes: `docker volume rm reflow_caddy_data reflow_caddy_config`. Only Traefik's certificates matter now.
- [x] **[you]** `sudo reboot` → after ~1–2 min the site, the panel, and the DB tunnel all work with nothing restarted by hand.
- [x] **[you]** 🎯 **Milestone 1b:** the current app is deployed from git by Dokploy. Session log line, then move this file to `archive/`.
