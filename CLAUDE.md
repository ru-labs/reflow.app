# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

## 5. Implementation Phases

**Plan files live in `docs/plans/<plan-name>/`. Completed phases move to `docs/plans/<plan-name>/archive/`.**

### Naming convention

Phase files are numbered: `00-overview.md`, `01-<phase-name>.md`, `02-<phase-name>.md`, …

- `00-overview.md` — always the index/roadmap for that plan; archive it once all phases are done.
- Each subsequent file is one self-contained phase with a deliverables checklist of `- [ ]` checkboxes.

### What "done" means

A phase is done when **every checkbox in the file is checked** (`- [x]`). At that point, move the file:

```
docs/plans/<plan-name>/<phase-file>.md  →  docs/plans/<plan-name>/archive/<phase-file>.md
```

Active phases (not yet archived) are whatever files remain directly in the plan folder. To know which phase you're on, list that folder — the lowest-numbered file is the current phase. List `docs/plans/` itself for the current set of active plan folders rather than relying on a static list here — it changes every time a plan finishes.

---

# Project: reflow

An interrupt-resilient personal day-planner. One ranked task list per day that
survives being interrupted by unplanned work — see `PRODUCT.md` for full product
purpose, users, and the binding brand system (colors, type, tone, motion — do not
re-derive or override, treat it as decided).

## Stack

Vite + React 19 + TypeScript SPA, talking directly to a hosted Supabase project
(Postgres + Auth + Realtime) — no custom backend server. Styling is plain CSS
(`src/styles/`), animation is `framer-motion`. No Docker, no local database.

## Project structure

```
src/
  App.tsx            top-level routing/auth gate
  main.tsx           entry point
  pages/             Landing, Auth, Today, History — route-level screens
  components/        UI pieces (TaskList, TaskRow, MorningFlow, CompareDuel,
                      BrainDump, LeftoverCard, TagInput, AddTaskFab,
                      TaskModal, InstallPrompt, VersionBadge, BorderGlow,
                      AppLoading, EmptyState, TaskListSkeleton, Toast,
                      UpdateBanner, HistoryRow)
  components/icons/  hand-written stroke icons (24px grid, 1.75px stroke — see
                      branding.md for the icon system, don't pull in an icon lib)
  hooks/             useAuth, useTasks, useMorningFlow, useCompareInsertion,
                      useLongPressDrag, useInstallPrompt, useRolloverPrompt,
                      useReducedMotion, useAppUpdate, useTheme, useToast,
                      useHistory, useHashRoute
  lib/               framework-free logic + its co-located *.test.ts:
                      tasks.ts (Supabase CRUD), ranking.ts (rank-gap math),
                      compare.ts (binary-search comparator), triage.ts
                      (leftover keep/drop), tags.ts, swipe.ts,
                      realtimeMerge.ts, transitions.ts, pwa.ts, supabase.ts
                      (client init), devMock.ts (VITE_DEV_MODE bypass),
                      validation.ts (input limits), textScale.ts
                      (length-to-font-size tiers), theme.ts (profile
                      theme_preference), history.ts (history date ranges,
                      day grouping, hours parsing)
supabase/migrations/  hand-applied SQL, run in filename order via the Supabase
                      SQL Editor — there is no migration runner/CLI wired up
```

Business logic lives in `src/lib/*.ts` as plain functions, independent of React —
that's what the `*.test.ts` files next to them exercise directly. Anything that
needs a Supabase call or React state lives in `src/hooks/*.ts` instead.

## Local setup (from zero)

`README.md` is the canonical human-facing setup doc; this section is a terser mirror for quick
reference — if the two ever disagree, `README.md` wins.

1. `npm install` — also runs `postinstall: patch-package`, applying `patches/framer-motion+13.0.0.patch`
2. Create a Supabase project (free tier) at supabase.com. From **Project Settings → API**, note the **Project URL** and the **publishable ("anon") key**.
3. In the Supabase dashboard: **Authentication → Providers** — confirm Email is enabled, and leave "Confirm email" **on** (sign-up sends a confirmation link; Google/GitHub sign-in are also available, see `docs/plans/auth-oauth-and-email-confirm/archive/` for how this project's were set up).
4. **SQL Editor** — run every file in `supabase/migrations/` in filename order, starting with `0001_tasks.sql`. Skipping a later migration leaves the DB disagreeing with the app (shows up as an opaque HTTP 400 on insert). Files are written to be safe to re-run. There is no migration CLI/runner — this is hand-applied SQL, run manually each time the schema changes.
5. Copy `.env.example` → `.env.local` and fill in `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (see table below). `.env.local` is gitignored — never commit real credentials.
6. `npm run dev` — opens at `http://localhost:5173`.

To test on a second device (e.g. a phone) on the same network: `npm run dev -- --host`, then open the printed "Network" URL there, signed into the same account.

## Commands

```bash
npm run dev       # vite dev server, http://localhost:5173
npm run dev -- --host   # expose on LAN for testing on a phone
npm run build     # tsc -b && vite build
npm run preview   # preview the production build
npm run test      # vitest run
npm run lint      # oxlint
```

## Environment variables (`.env.local`, gitignored)

| Var | Purpose |
|---|---|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | required; from Supabase Project Settings → API |
| `VITE_SUPABASE_SCHEMA` | optional, default `public`; DEV/QUALITY share one Supabase project split by Postgres schema (`dev`/`preprod`) — see `devops-workflow` skill |
| `VITE_DEV_MODE=true` | optional; bypasses real Supabase auth with a mock session + seeded tasks (`src/lib/devMock.ts`) — no Supabase project needed at all, useful for UI checks/browser automation |

## Environments & deployment

Three environments (DEV/QUALITY/PROD), each its own Vercel project, promoted by
**Octopus Deploy** from one build produced on `main`. Full branching model,
who-can-merge-what rules, and CI/CD pipeline design live in the **`devops-workflow`
skill** (`.claude/skills/devops-workflow/SKILL.md`) — invoke it rather than
re-deriving this from scratch when merging, deploying, or touching
`.github/workflows/*`. The pipeline is built and in use; the rollout history and
the open items left behind are in `docs/plans/devops-setup/archive/00-overview.md`
(archived — see `docs/BACKLOG.md` for the still-open ones).

## Other docs in this repo

- `README.md` — human setup instructions (Supabase project creation, migrations, env vars). Read this, not CLAUDE.md, for "how do I get this running from zero."
- `PRODUCT.md` — product purpose, target user, positioning, and the **binding** brand system reference (colors/type/tone/motion decided elsewhere in `branding.md`). Schema-managed by the `impeccable` skill — don't hand-edit its structure.
- `branding.md` — full pinned visual identity system (logo, palette, type, iconography, motion timing). Binding, not inspiration.
- `docs/idea.md` — original problem-framing draft PRODUCT.md was built from; historical record.
- `docs/ARCHITECTURE.md` — living "how this app works" reference: data model, module map, and cross-cutting patterns (optimistic mutations, realtime sync, ranking/duel, morning flow), derived from current code.
- `docs/BACKLOG.md` — open ideas and unresolved polish items not yet turned into a phase plan.
- `.claude/skills/docs-maintenance/SKILL.md` — keeps `docs/ARCHITECTURE.md`, `docs/BACKLOG.md`,
  and this file's project-structure tree in sync with the code; invoked automatically when a
  task finishes rather than needing to be asked for each time.
