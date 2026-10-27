# CLAUDE.md

reflow — an interrupt-resilient personal day-planner: one ranked task list per day that
survives unplanned work. Product purpose, users and tone: `PRODUCT.md`. Visual identity
(colors, type, icons, motion): `branding.md`. **Both are binding — treat as decided, don't
re-derive or override.**

## Read before you start

Don't re-explore the repo from scratch; read the doc that matches the task first.

| Task touches… | Read first |
|---|---|
| data model, module boundaries, optimistic updates, realtime, ranking/duel, morning flow | `docs/ARCHITECTURE.md` |
| first-time setup, Supabase project, migrations | `README.md` |
| branches, merging, deploys, CI, Octopus | `.claude/skills/devops-workflow/SKILL.md` |
| a feature that has a plan | `docs/plans/<plan>/` (see "Plans") |
| open ideas / known polish items | `docs/BACKLOG.md` |

## Stack and where things live

Vite + React 19 + TypeScript SPA → hosted Supabase (Postgres + Auth + Realtime). **No custom
backend today.** Plain CSS in `src/styles/`, animation via `framer-motion` (patched, see
`patches/`), hand-written icons in `src/components/icons/` (no icon library).

| Area | Path |
|---|---|
| Routing / auth gate | `src/App.tsx`, `src/main.tsx` |
| Screens | `src/pages/` (Landing, Auth, Today, History) |
| UI pieces | `src/components/` |
| Supabase calls + React state | `src/hooks/` |
| Pure logic + co-located `*.test.ts` | `src/lib/` |
| DB schema | `supabase/migrations/` (hand-applied SQL) |
| CI/CD | `.github/workflows/release.yml` |
| Diagrams (generated SVG) | `scripts/diagrams/` → `docs/diagrams/` via `npm run diagrams` |
| Docs and plans | `docs/` |

Don't hard-code file lists here — `ls src/lib src/hooks src/components` is the source of truth.

**In progress:** `docs/plans/selfhost-azure-poc/` explores self-hosting (Node API + Postgres +
Dokploy on an Azure VM) from branch `feature/selfhost-poc`. It is a PoC and does not change
the architecture above unless that plan says a phase landed.

## Code rules

- **Logic placement:** business logic is plain functions in `src/lib/` with a co-located
  `*.test.ts`. Anything needing Supabase or React state goes in `src/hooks/`. Don't put
  logic in components.
- **Follow existing patterns** — mutations are optimistic with rollback (see ARCHITECTURE.md);
  match that rather than inventing a new shape.
- **Input limits** live in `src/lib/validation.ts` and are mirrored by DB constraints
  (`0005_input_limits.sql`). Change both together.
- **UI changes** follow `branding.md` (palette, type, 24px/1.75px-stroke icons, motion
  timing) and respect `useReducedMotion`.
- Match surrounding style, naming and comment density. No new dependency without asking.

## Workflow: plan → approve → execute → hand off

1. **Plan first.** For any feature, write a plan as a trackable `.md` with a `- [ ]` task
   list (see "Plans") and **stop for approval**. Don't implement before it's approved.
2. **Execute** the approved plan, ticking boxes as you go.
3. **Hand off for manual testing.** When done, say so and give short, concrete steps for
   testing it by hand (what to click, what to expect, edge cases worth trying, e.g. with
   `VITE_DEV_MODE=true npm run dev`). The user tests and reports bugs.

**Do not self-test in the browser** (Playwright MCP, screenshots, browser automation) or
write e2e tests unless the user explicitly asks — it burns tokens the user would rather
spend themselves. Cheap checks are fine: `npm run build` (catches type errors) and
`npm run test` for the unit tests next to the logic you touched.

If you added/removed files in `src/lib|hooks|components`, or implemented a backlog item,
update docs via the `docs-maintenance` skill.

## Database changes

There is no migration runner. Add the next numbered file in `supabase/migrations/` (safe to
re-run), add the matching `preprod_*` variant (QUALITY uses a separate `preprod` schema in the
same Supabase project), and **tell the user to apply it in the Supabase SQL Editor** — the
app breaks with an opaque HTTP 400 on insert if the DB lags the code.

## Run locally

First-time setup is in `README.md`. Once set up:

```bash
npm run dev            # http://localhost:5173  (add -- --host to test on a phone)
npm run build | preview | test | lint | diagrams
```

`.env.local` (gitignored, copy from `.env.example`): `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY` required; `VITE_SUPABASE_SCHEMA` optional (default `public`);
`VITE_DEV_MODE=true` bypasses auth with a mock session. Never commit credentials.

## Hosting and deploy

Three environments — DEV, QUALITY (preprod), PROD — each its own Vercel project, all
backed by hosted Supabase (DEV and QUALITY share a project, split by Postgres schema).
Flow: `feature/*` → `dev` → PR → `main`. A push to `main` runs `release.yml`, which builds
and creates one Octopus release that is promoted dev → preprod → prod inside Octopus.

Hard rules (details in the `devops-workflow` skill):
- Never push to `main` and never merge `dev` → `main` — human only. You may open the PR.
- Merging `feature/*` → `dev` needs explicit user confirmation.
- Never force-push; never delete branches without confirmation.

## Plans

Plans live in `docs/plans/<plan-name>/` as `00-overview.md` (roadmap) plus numbered phase
files, each with a `- [ ]` deliverables checklist. A phase is done when every box is checked;
then move it to `docs/plans/<plan-name>/archive/`. The current phase is the lowest-numbered
file left in the plan folder. List `docs/plans/` for what's active — don't trust a static
list. Each phase gets its own feature branch.

## Working style

- State assumptions; if the request has several plausible readings, say so and ask rather
  than silently picking one.
- Smallest change that solves the problem. No speculative features, abstractions or
  error handling for impossible cases.
- Surgical diffs: every changed line traces to the request. Mention unrelated dead code or
  bugs you notice; don't fix them unasked. Remove only orphans your own change created.
- Turn tasks into checkable goals (failing test → make it pass) and verify before
  reporting done. Report failures and skipped steps honestly.
