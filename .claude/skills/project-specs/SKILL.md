---
name: project-specs
description: Prints the current project's technical stack in a fixed, compact format (frontend, backend, database, cloud, devops, local run tooling, other). Use when the user asks "list" / "what's the stack" / "project specs" / wants a quick tech-stack summary.
---

# Project Specs

One action: **list**. Output the block below verbatim (fill in values, keep the
labels/order/format identical on every call). No extra commentary, no
explanations, no surrounding prose — just the block.

```
Frontend:   Vite + React 19 + TypeScript (SPA)
Backend:    Node 24 + Fastify 5 (server/), bcrypt auth, SSE realtime via LISTEN/NOTIFY
Database:   PostgreSQL 17 (Docker volume on the VM)
Cloud:      Azure VM, Dokploy, Traefik + Caddy
DevOps:     GitHub Actions -> Dokploy API -> health gate
Local run:  Node v24.18.0, npm 11.16.0, git 2.48.1
Other:      framer-motion (animation), oxlint (lint), vitest (tests)
```

Values come from this repo's own config, not memorized — regenerate them each
call instead of assuming they're static:

- **Frontend / Other deps**: `package.json` (`dependencies`/`devDependencies`).
- **Backend / Database**: root `CLAUDE.md` stack section + `server/package.json`.
- **Cloud / DevOps**: `.github/workflows/*.yml` and `deploy/selfhost/`.
- **Local run**: actual installed versions on this machine — run `node --version`,
  `npm --version`, `git --version` (and any other CLI referenced by the workflow,
  e.g. `vercel --version`) rather than guessing.

If a category doesn't apply to this project, print it as `none` rather than
omitting the line — the label set stays constant across calls.
