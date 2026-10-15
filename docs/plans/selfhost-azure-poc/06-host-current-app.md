# Phase 06 — Host the *current* app on the VM (still backed by Supabase DEV)

Why first with the unchanged app: it proves the VM, Caddy, static hosting and
(in phase 07) DNS + HTTPS work, **before** any code changes. Later, only the
files behind Caddy get swapped.

Choice: the SPA is plain static files, so it's served by the **Caddy
container** from a bind-mounted folder. It doesn't need an image of its own.
Only the API (phase 08) gets a Docker image.

## Build locally (laptop, repo root)

- [ ] **[you]** Create `.env.poc.local` (gitignored via `.env*`) with the **DEV** Supabase values. Take them from your existing `.env.local` or the DEV Vercel project: `VITE_SUPABASE_URL=…`, `VITE_SUPABASE_ANON_KEY=…`, `VITE_SUPABASE_SCHEMA=dev`.
- [ ] **[you]** Build with that mode: `npx tsc -b; npx vite build --mode poc` → a `dist/` folder.
- [ ] **[you]** On the VM: `mkdir -p /opt/reflow/www`
- [ ] **[you]** Copy the build up (PowerShell, repo root): `scp -r dist/* reflow-vm:/opt/reflow/www/`. Or drag the `dist` contents into `/opt/reflow/www` in the VS Code Remote explorer.
- [ ] **[you]** On the VM: `ls /opt/reflow/www` shows `index.html`, `assets/`, `sw.js`, `manifest.webmanifest`.

## Caddy

- [ ] **[you]** Create `/opt/reflow/Caddyfile` (temporary: plain HTTP on the IP):

  ```
  :80 {
      root * /srv/www
      encode zstd gzip

      @nocache path /index.html /sw.js /registerSW.js /manifest.webmanifest
      header @nocache Cache-Control "no-cache"
      @assets path /assets/*
      header @assets Cache-Control "public, max-age=31536000, immutable"

      try_files {path} /index.html
      file_server
  }
  ```
  Why the headers: hashed `/assets/*` can be cached forever. `index.html`
  and the service worker must never be stale, or users get stuck on an old version.
- [ ] **[you]** Add the service to `/opt/reflow/compose.yaml` under `services:` (same indentation as `db:`):

  ```yaml
    caddy:
      image: caddy:2-alpine
      restart: unless-stopped
      ports:
        - "80:80"
        - "443:443"
        - "443:443/udp"
      volumes:
        - ./Caddyfile:/etc/caddy/Caddyfile:ro
        - ./www:/srv/www:ro
        - caddy_data:/data           # holds TLS certificates, never delete
        - caddy_config:/config
  ```
  …and under the top-level `volumes:` add `caddy_data:` and `caddy_config:`.
- [ ] **[you]** `docker compose up -d caddy && docker compose logs caddy --tail 30`. No errors.

## Verify

- [ ] **[you]** Browser: `http://<PUBLIC_IP>` shows the reflow landing page.
- [ ] **[you]** Sign in with a **DEV** account (email + password) → Today screen loads tasks from Supabase DEV. Add a task, then check it shows on dev.usereflow.app (or wherever DEV lives). Skip Google/GitHub for now: their redirect URL isn't allowed yet.
- [ ] **[you]** Expected quirk: the service worker / "install app" doesn't work on plain http. That's fixed by HTTPS in phase 07.
- [ ] **[you]** Session log line, then move this file to `archive/`.
