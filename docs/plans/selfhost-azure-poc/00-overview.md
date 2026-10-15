# Self-hosting on Azure VM — Overview (PoC → possible prod migration)

## Context (read this first in every new session)

reflow today is a Vite/React SPA hosted on **Vercel**, talking straight from the
browser to **Supabase** (Postgres + Auth + Realtime). There is no backend of our own.

Goal of this plan: prove that reflow can run fully self-hosted on one small
Azure VM (**Standard_B1ms**: 1 vCPU burstable, 2 GiB RAM, Ubuntu 24.04), with
Postgres in Docker, served at **`https://self.usereflow.app`**, without
touching the current production setup. Once the PoC works and survives a
load test (10 / 100 / 1000 concurrent users), production may be moved over
(the last phase, only an outline for now).

**Who does what:** steps tagged **[you]** are done by hand (Azure portal, VM
shell, DNS, GitHub settings). Steps tagged **[agent]** are code changes made
by a coding agent in this repo. Every checkbox is one action.

## Target architecture

```
browser ──HTTPS──► Caddy (container, :80/:443, auto Let's Encrypt)
                     ├── /            → static SPA files (built with VITE_BACKEND=selfhosted)
                     └── /api/*       → api (container, Node + Fastify, :3000)
                                          └── db (container, postgres:17, 127.0.0.1:5432 only)
```

All three containers run from one `compose.yaml` in `/opt/reflow` on the VM.
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
| D7 | **Caddy** as reverse proxy + static server | Automatic HTTPS in 3 lines. The `.app` TLD is HSTS-preloaded, so HTTPS is mandatory. |
| D8 | PoC scope: **no Google/GitHub OAuth, no email confirmation, no password reset** on self-hosted | Keeps the PoC small. All three are prerequisites for the prod cutover (phase 13). |
| D9 | Self-hosted deploy is a **separate GitHub Actions workflow**. `release.yml`/Octopus stay untouched | Can't break the current DEV/QUALITY/PROD pipeline. |
| D10 | Load test with **k6** (API-level workflow + static asset fetch), run from outside the VM | k6 handles 1000 VUs on a laptop. A browser-level test at 1000 users isn't feasible. Running it on the VM would skew results. |

## Assumptions (correct these if wrong)

- You have an Azure subscription where you can create VMs, and a GitHub account that owns this repo.
- DNS for `usereflow.app` is editable by you (Vercel or the registrar; phase 07 finds out which).
- The coding agent has no Docker locally. It develops the API against the VM's
  Postgres through an SSH tunnel (a separate `reflow_dev` database).
- The PoC database starts empty. No production data is copied before phase 13.

## Environment facts (fill in as you go. NO secrets here, ever)

| Fact | Value |
|---|---|
| Azure region | |
| Resource group | `rg-reflow-poc` |
| VM name | `vm-reflow-poc` |
| VM admin user | `reflow` |
| VM public IP (static) | |
| Azure DNS label | `reflow-poc.<region>.cloudapp.azure.com` |
| SSH key (laptop) | `~/.ssh/reflow_poc` |
| DNS provider for usereflow.app | |
| Self-hosted URL | `https://self.usereflow.app` |
| Where secrets live | VM: `/opt/reflow/.env` (chmod 600). CI: GitHub Actions secrets `SELFHOST_*` |

## Phases

| File | Phase | Owner | Status |
|---|---|---|---|
| `01-create-vm.md` | Create the VM in Azure portal | you | ☐ |
| `02-azure-config.md` | Auto-shutdown off, static IP, NSG, budget, alerts | you | ☐ |
| `03-remote-ssh.md` | SSH config + VS Code Remote-SSH | you | ☐ |
| `04-os-baseline.md` | Updates, swap, firewall, fail2ban, Docker | you | ☐ |
| `05-postgres.md` | Postgres 17 in Docker, backups, tunnel | you | ☐ |
| `06-host-current-app.md` | Serve the **current** (Supabase) build via Caddy on the VM IP | you | ☐ |
| `07-subdomain-https.md` | `self.usereflow.app` + automatic HTTPS | you | ☐ |
| `08-backend-api.md` | `server/`: Fastify API, schema, auth, SSE, tests | agent | ☐ |
| `09-frontend-data-layer.md` | Build-time switch `VITE_BACKEND`, self-hosted adapter | agent | ☐ |
| `10-first-selfhosted-deploy.md` | Manual deploy → **🎯 working self-hosted demo** | you + agent | ☐ |
| `11-deploy-pipeline.md` | GitHub Actions → VM deployment | agent + you | ☐ |
| `12-load-test.md` | k6: 10 / 100 / 1000 users, monitoring, report | agent + you | ☐ |
| `13-prod-cutover-outline.md` | Go/no-go criteria + cutover runbook (outline) | later | ☐ |

Phases 01–07 need no code. Phases 08–09 can start in parallel once phase 05
is done (the agent needs the DB tunnel).

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
