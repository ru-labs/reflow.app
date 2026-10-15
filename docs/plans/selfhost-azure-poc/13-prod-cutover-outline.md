# Phase 13 — Production cutover (OUTLINE — detail this before starting)

Only start this after phase 12 gives a clear "yes". When you get here, have the
agent expand each section into single-action checkboxes like phases 01–12,
probably splitting it into several phase files (`13-…`, `14-…`).

## Go / no-go prerequisites (feature + ops parity)

- [ ] Google + GitHub OAuth in `server/` (authorization-code flow; register new OAuth apps with `https://usereflow.app` callbacks). Existing OAuth-only users have **no password** in `auth.users`, so without this they're locked out.
- [ ] Email confirmation + password reset via a transactional mail provider (e.g. Resend, Brevo, Postmark). That needs SPF/DKIM DNS records on `usereflow.app`.
- [ ] Off-VM backups: nightly `pg_dump` copied to Azure Blob Storage (azcopy + a SAS token), with a **tested restore**.
- [ ] Uptime monitoring on `/api/health` (e.g. UptimeRobot / Better Stack) alerting your phone.
- [ ] VM size decided from phase 12 (a B-series credit bank isn't a 24/7 guarantee).
- [ ] Deployment brought in line with DEV/QUALITY/PROD: probably an Octopus Linux Tentacle (polling) on the VM, plus a QUALITY equivalent (a second DB/schema or a second VM). Revisit the `devops-workflow` skill.
- [ ] Rate limiting back on, `COOKIE_SECURE=true`, and the security headers reviewed in Caddy.

## Data migration rehearsal (on the PoC VM, repeatable)

- [ ] Export from Supabase prod (connection string: Supabase → *Connect*): `auth.users` (`id, email, encrypted_password, email_confirmed_at, created_at`), `public.tasks`, `public.profiles`.
- [ ] A load script that inserts them into a fresh self-hosted DB, preserving `id`s (D6).
- [ ] Checks: row counts match per table; a real user can sign in with their existing password (bcrypt compatibility, D5); a random sample of tasks is identical.
- [ ] Time the whole run. That's your planned downtime.

## Cutover runbook (sketch)

1. T-24h: lower the TTL of the `usereflow.app` apex/`www` records to 300 s.
2. Announce a short maintenance window.
3. Freeze writes: put a maintenance page on Vercel, or pause the Supabase project.
4. Final export → import → run the checks.
5. Add `usereflow.app` (and `www`) to the Caddyfile. Point the DNS A record(s) at the VM. Remove the domain from the Vercel project.
6. Smoke test on the real domain (the phase 10 list).
7. Everyone signs in again once (the session format differs). Installed PWAs keep working (same origin).

**Rollback:** point DNS back to Vercel and unfreeze Supabase. Anything written
to the VM after the cutover is lost unless it's copied back, so decide go/no-go
within the first hour.

## Afterwards

- [ ] Keep the Supabase project paused (not deleted) for 30 days.
- [ ] Run `docs-maintenance`. CLAUDE.md's stack section and ARCHITECTURE.md change fundamentally at this point.
