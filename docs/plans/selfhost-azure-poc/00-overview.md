# Self-hosting on Azure VM — Overview (PoC → possible prod migration)

## Context (read this first in every new session)

reflow today is a Vite/React SPA hosted on **Vercel**, talking straight from the
browser to **Supabase** (Postgres + Auth + Realtime). There is no backend of our own.

Goal of this plan: prove that reflow can run fully self-hosted on one small
Azure VM (**Standard_B2ls_v2**: 2 vCPU burstable, 4 GiB RAM, Ubuntu 24.04;
created as B1ms, resized 2026-10-16), with Postgres in Docker, managed by
**Dokploy** and deployed from git, served at **`https://self.usereflow.app`**, without
touching the current production setup. Once the PoC works and survives a
load test (10 / 100 / 1000 concurrent users), production may be moved over
(the last phase, only an outline for now).

**Who does what:** steps tagged **[you]** are done by hand (Azure portal, VM
shell, DNS, GitHub settings). Steps tagged **[agent]** are code changes made
by a coding agent in this repo. Every checkbox is one action.

## Target architecture

```
browser ──HTTPS──► Traefik (Dokploy, :80/:443, auto Let's Encrypt)
                     ├── dokploy.usereflow.app → Dokploy panel (2FA)
                     └── self.usereflow.app    → web (Caddy, :80, internal)
                                                   ├── /       → static SPA (built with VITE_BACKEND=selfhosted)
                                                   └── /api/*  → api (Node + Fastify, :3000)
                                                                  └── db (postgres:17, 127.0.0.1:5432 only)
```

`web`, `api` and `db` are one Dokploy **Compose** service built from
`deploy/selfhost/compose.yaml` on branch `feature/selfhost-poc`.
One origin (`self.usereflow.app`) serves both the SPA and the API, so there's
no CORS and auth can use an httpOnly session cookie.

## Key decisions (with reasons)

| # | Decision | Why |
|---|---|---|
| D1 | **Write a small custom API** (`server/`), not self-hosted Supabase | Self-hosted Supabase is ~10 containers and needs ≥4 GB RAM. It won't fit a B1ms. Our surface is tiny (tasks, profile, auth, one change feed). |
| D2 | **Swap the frontend data layer at build time** with `VITE_BACKEND=supabase\|selfhosted` (default `supabase`) | Production keeps building exactly as today. The self-hosted bundle must not contain supabase-js or need the `VITE_SUPABASE_*` vars. |
| D3 | Supabase coupling is **narrow**, so we use one interface with two implementations, not a fork | Coupling = `src/lib/tasks.ts` (12 fns), `src/lib/theme.ts` (2), `useAuth.ts` (6 auth calls), one realtime channel in `useTasks.ts`, and the `Session` type in 4 files. |
| D4 | Realtime = **Server-Sent Events** fed by Postgres `LISTEN/NOTIFY` | One-way server→client is all the app uses. SSE is plain HTTP and easy to proxy, with built-in reconnect. |
| D5 | Auth = email + password, **bcrypt (cost 10)**, opaque session token in an httpOnly cookie, stored hashed in a `sessions` table | bcrypt matches Supabase's `auth.users.encrypted_password`, so existing users can keep their passwords after a migration. Sessions can be revoked. |
| D6 | **User IDs and table/column names identical** to Supabase | A later data migration is a plain copy with no ID remapping. |
| D7 | **Caddy** as reverse proxy + static server | Automatic HTTPS in 3 lines. The `.app` TLD is HSTS-preloaded, so HTTPS is mandatory. *Revised by D12/D13: TLS and public ports moved to Dokploy's Traefik; Caddy is now internal only.* |
| D8 | PoC scope: **no Google/GitHub OAuth, no email confirmation, no password reset** on self-hosted | Keeps the PoC small. All three are prerequisites for the prod cutover (phase 15). |
| D9 | Self-hosted deploy is a **separate GitHub Actions workflow** (since D12: it calls the Dokploy API). `release.yml`/Octopus stay untouched | Can't break the current DEV/QUALITY/PROD pipeline. |
| D11 | **Google/GitHub OAuth moved to after the deploy pipeline (now phase 13)**, before the load test (now phase 14). Decided 2026-10-15, when those were phases 11/12. Phase 07's optional OAuth step is skipped for now. | Keeps the phases up to the pipeline focused on the self-hosted path. Decision by the user. |
| D10 | Load test with **k6** (API-level workflow + static asset fetch), run from outside the VM | k6 handles 1000 VUs on a laptop. A browser-level test at 1000 users isn't feasible. Running it on the VM would skew results. |
| D12 | **Dokploy** manages the containers and deploys from git (phases 08–09). Decided 2026-10-16. Phases 08–13 renumbered to 10–15 | A UI for containers, logs, env vars and domains, plus push-to-deploy, instead of hand-written compose/SSH/rsync deploys. It fits now that the VM has 4 GiB (Dokploy idles at ~350–600 MB). Decision by the user. |
| D13 | Dokploy's **Traefik** owns 80/443 + TLS. **Caddy stays inside** the `web` image as static server + `/api` router | Path routing and cache headers stay in a repo file (`deploy/selfhost/Caddyfile`), so the stack still runs without Dokploy. Only one Dokploy domain is needed. |
| D14 | The repo's `deploy/selfhost/compose.yaml` is the single source of truth. Dokploy runs it in *Docker Compose* mode (not Stack). Postgres reuses the phase-05 volume `reflow_pgdata` (external) | Compose mode allows `build:` and `127.0.0.1` port binding (needed for the laptop DB tunnel). Reusing the volume keeps `reflow_dev`/`reflow_test` with no copy. |
| D15 | Builds start **on the VM** (Dokploy builds from git). Phase 13 decides between keeping that or building images in GitHub Actions → GHCR, based on build time/RAM measured in phases 09 and 12 | Simplest first step. On-VM builds spend CPU credits, and Dokploy's separate build-server feature needs a second machine. |

## Assumptions (correct these if wrong)

- You have an Azure subscription where you can create VMs, and a GitHub account that owns this repo.
- DNS for `usereflow.app` is editable by you (Vercel or the registrar; phase 07 finds out which).
- The coding agent has no Docker locally. It develops the API against the VM's
  Postgres through an SSH tunnel (a separate `reflow_dev` database).
- The PoC database starts empty. No production data is copied before phase 15.

## Environment facts (fill in as you go. NO secrets here, ever)

| Fact | Value |
|---|---|
| Azure region | `northeurope` |
| Resource group | `rg-reflow-poc` |
| VM name | `reflowapp-vm` (hostname; plan had `vm-reflow-poc`) |
| VM admin user | `reflowadmin` (plan had `reflow`) |
| VM public IP (static) | `98.71.18.196` |
| Azure DNS label | `reflow-poc.<region>.cloudapp.azure.com` |
| SSH key (laptop) | `~/.ssh/reflow_poc` |
| DNS provider for usereflow.app | Cloudflare (NS: `iris`/`lennox.ns.cloudflare.com`), `self` and `dokploy` A records DNS-only |
| Self-hosted URL | `https://self.usereflow.app` |
| VM size | `Standard_B2ls_v2` (2 vCPU, 4 GiB, 30% CPU baseline), resized from B1ms on 2026-10-16 |
| VM private IP | `172.16.0.4` (`eth0`, `172.16.0.0/24`). Swarm advertise address |
| Docker overlay subnets | `ingress` `10.0.0.0/24`, `dokploy-network` `10.0.1.0/24`. No overlap with the VM subnet |
| Dokploy panel | `https://dokploy.usereflow.app` (phase 08), version: `v0.30.8` |
| Dokploy compose project | ___ (phase 09; used in `docker exec` commands as `<project>`) |
| Repo (for Dokploy GitHub App) | `ru-labs/reflow.app` (public) |
| Where secrets live | Dokploy → `reflow` compose → *Environment* (app env). VM: `/opt/reflow/.env` (chmod 600) as the offline record of `POSTGRES_PASSWORD`. CI: GitHub Actions secrets `SELFHOST_*` |

## Phases

| File | Phase | Owner | Status |
|---|---|---|---|
| `01-create-vm.md` | Create the VM in Azure portal | you | ☑ |
| `02-azure-config.md` | Auto-shutdown off, static IP, NSG, budget, alerts | you | ☑ |
| `03-remote-ssh.md` | SSH config + VS Code Remote-SSH | you | ☑ |
| `04-os-baseline.md` | Updates, swap, firewall, fail2ban, Docker | you | ☑ |
| `05-postgres.md` | Postgres 17 in Docker, backups, tunnel | you | ☐ (one item open: `server/.env`, needs phase 10) |
| `06-host-current-app.md` | Serve the **current** (Supabase) build via Caddy on the VM IP | you | ☑ |
| `07-subdomain-https.md` | `self.usereflow.app` + automatic HTTPS | you | ☑ |
| `08-dokploy-install.md` | Retire Caddy, install Dokploy, panel on `dokploy.usereflow.app` + 2FA | you | ☐ |
| `09-dokploy-current-app.md` | Current app + Postgres as a Dokploy Compose service, git push-to-deploy, build cost measured | agent + you | ☐ |
| `10-backend-api.md` | `server/`: Fastify API, schema, auth, SSE, tests | agent | ☐ |
| `11-frontend-data-layer.md` | Build-time switch `VITE_BACKEND`, self-hosted adapter | agent | ☐ |
| `12-first-selfhosted-deploy.md` | Add `api` to the compose, switch env → **🎯 working self-hosted demo** | you + agent | ☐ |
| `13-deploy-pipeline.md` | GitHub Actions (tests) → Dokploy API deploy, health gate, rollback | agent + you | ☐ |
| `14-load-test.md` | k6: 10 / 100 / 1000 users, monitoring, report | agent + you | ☐ |
| `15-prod-cutover-outline.md` | Go/no-go criteria + cutover runbook (outline) | later | ☐ |

Phases 01–09 need little or no app code (09 adds deploy files only). Phases
10–11 can start in parallel once phase 09 is done (the agent needs the DB
tunnel, which works the same before and after Dokploy).

## How to resume in a new AI session

1. Read this file, then list `docs/plans/selfhost-azure-poc/`. The lowest-numbered file there is the current phase.
2. Open that phase file and continue from the first unchecked `- [ ]`.
3. Check the **Environment facts** table and the **Session log** below for decisions and values already settled.
4. When every box in a phase is checked, move the file to `archive/` and flip its status above to ☑.
5. Append one line to the session log at the end of every session.

## Session log

| Date | Phase | What happened / decisions made |
|---|---|---|
| 2026-09-26 | — | Plan written. |
| 2026-10-15 | 01–03 | VM exists and is reachable via `ssh reflow-vm` (alias uses user `reflowadmin`). |
| 2026-10-15 | 04 | Done and verified after reboot: apt upgraded, 2G swap, ufw (22/80/443), fail2ban, Docker 29.9.1 + Compose v5.6.0 (user in `docker` group). Archived. |
| 2026-10-15 | 06 | Done. Build with `--mode poc` (`.env.poc.local`, `VITE_SUPABASE_SCHEMA=public`; DEV has no `dev` schema, the plan's `dev` was wrong). Files in `/opt/reflow/www` (53 files, copied via tar over SSH; a drag-and-drop first copied a nested `dist/` folder, fixed). Caddy (`caddy:2-alpine`) serves `http://98.71.18.196`. Sign-in with DEV account works after unpausing the DEV Supabase project (it had been paused). Task add verified against DEV. Caddy warns about HTTPS, expected until phase 07. Archived. |
| 2026-10-15 | 07 | Done. Milestone 1 reached: DEV sign-in and Today screen work on `https://self.usereflow.app`; service worker active. OAuth deferred (D11). Archived. |
| 2026-10-15 | 07 (details) | `self` A record in Cloudflare (DNS only) → 98.71.18.196; no CAA records. Caddy has email `richard.uzik2@gmail.com` and site `self.usereflow.app`; Let's Encrypt cert issued (valid to 2027-01-13). HTTP → HTTPS 308 works. Service worker registered on https. Decided: Google/GitHub OAuth moved to after phase 11 (D11). Open: confirm DEV sign-in on https and Today screen. |
| 2026-10-15 | 05 (almost done) | `/opt/reflow` (owner `reflowadmin`), `.env` (chmod 600), `compose.yaml`, `reflow-db-1` healthy on 127.0.0.1:5432. PG 17.11 verified. `pg_stat_statements` on. `reflow_dev` + `reflow_test` created. Laptop: port 5432 closed from internet (`TcpTestSucceeded: False`); SSH tunnel `localhost:15432` works; connected via VS Code PostgreSQL extension (SSL must be Disabled, tunnel encrypts). `reflow_dev` empty. Nightly `pg_dump` cron at 03:00 UTC, manual dump OK. Reboot check passed. Open: write `server/.env` for the agent once phase 08 creates `server/` (its `.env` must be gitignored). |
| 2026-10-16 | 08 (in progress) | Dokploy `v0.30.8` installed (`ADVERTISE_ADDR=172.16.0.4`). Caddy retired, `compose.yaml` caddy block commented out. Panel on `https://dokploy.usereflow.app` with Let's Encrypt and 2FA (TOTP, Microsoft Authenticator). No passkey (it would bind to localhost). Daily Docker cleanup on. Missing `dokploy` A record was created in Cloudflare (DNS-only). Company laptop DNS resolves that name to `13.49.92.31`; cellular and home Wi-Fi work. Still open: step 21 (monitoring check), 22 (RAM baseline), reboot check, DB tunnel check, session log. Phase file stays in place until then. |
| 2026-10-17 | 08 (resumed) | Dokploy server monitoring decided off (extra container; phase 14 covers monitoring). Still open in 08: Verify section (RAM baseline, reboot check, DB tunnel check, session log). |
| 2026-10-27 | 08 | Done and verified. Second PC added with its own SSH key (`reflow_azure`, added via portal *Reset password → Add SSH public key*); `ssh reflow-vm` works from both PCs. RAM baseline: Dokploy ≈ 989 MiB (panel 898, Traefik 54, its Postgres 37), `reflow-db-1` 44 MiB, 2159 MB available, swap unused. Reboot check passed: panel back at `https://dokploy.usereflow.app`, `reflow-db-1` healthy on 127.0.0.1:5432. DB tunnel `localhost:15432` reachable. Archived. |
| 2026-10-27 | 09 | Done. **Milestone 1b:** `https://self.usereflow.app` runs from git under Dokploy (Compose service `reflow`, project `reflowpoc-reflow-edbr4g`, branch `feature/selfhost-poc`, Auto Deploy on). `reflow_pgdata` reused: `reflow`, `reflow_dev`, `reflow_test` intact. On-VM build ≈ 30 s cold, peak 2075 MB (+~475 MB over idle 1600), swap untouched: builds can stay on the VM. First LE cert request timed out during the build; `docker restart dokploy-traefik` fixed it. Isolated Deployment is deprecated in v0.30.8 but survived the reboot. Backup cron moved to label lookup, old compose/Caddy retired. Archived. |
| 2026-10-16 | 08–09 (new) | VM resized to **Standard_B2ls_v2** (2 vCPU, 4 GiB). Decided to manage the VM with **Dokploy** (D12–D15). Added `08-dokploy-install.md` + `09-dokploy-current-app.md`; old 08–13 renumbered to 10–15; phases 12 (first deploy) and 13 (pipeline) rewritten for Dokploy (no SSH/rsync deploys, no port-22 decision); 14/15 adjusted. Repo is public (`ru-labs/reflow.app`), so cloning needs no deploy key. |
