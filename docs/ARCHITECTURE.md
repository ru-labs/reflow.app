# Architecture

How reflow actually works today: data model, module boundaries, and the recurring patterns that
show up across the codebase. See `PRODUCT.md` for *why* the app exists and `branding.md` for the
visual/motion system — this doc is the "how the pieces fit together" reference those two don't
cover. Sourced from current `src/` and `supabase/migrations/*.sql`, not from historical plan files
(those are cited only for rationale, never for current fact).

## 1. Data model

One table drives the whole app, defined across five hand-applied migrations
(`supabase/migrations/0001_tasks.sql`, `0002_task_fields.sql`, `0004_profiles.sql`,
`0005_input_limits.sql`, `0006_task_history.sql`, run in filename order — `0003` was a repair migration for a
since-resolved schema drift and no longer exists, see below). Confirmed live against both
Supabase projects (`reflow` prod/dev-schema-split and `reflow dev`) via the Supabase MCP tools,
not just read off the migration files — schema, constraints, RLS policies, and indexes all match
exactly on both, no drift found:

```
tasks
  id               uuid, pk
  user_id          uuid, references auth.users(id), RLS-scoped (auth.uid() = user_id)
  title            text, not null (constrained: 1-200 chars, non-blank, 0005)
  note             text, nullable — column exists, unused by any current UI
  status           text — 'active' | 'done' | 'dropped'
  rank             double precision — see §5, rank-gap insertion
  created_at       timestamptz, default now()
  completed_at     timestamptz, nullable — "closed at": set on status → 'done' or 'dropped'
                   (pre-0006 dropped rows backfilled with created_at — approximate)
  last_triaged_on  date — see §6, drives the "is this a leftover" check
  tags             text[], default '{}' (constrained: ≤10 tags, 0005; validation.ts mirrors client-side)
  due_time         time, nullable — added in 0002, not read/written anywhere in src/; dead column
  hours_spent      numeric(5,2), nullable — manually entered decimal hours, 0 < h ≤ 24 (0006)
```

`profiles` (added 0004) holds one row per user: `theme_preference` ('system' | 'light' | 'dark'),
same RLS-per-user pattern. Backs `useTheme`/`src/lib/theme.ts`.

**Preprod schema note:** the `reflow dev` Supabase project also holds a `preprod.tasks` and
`preprod.profiles` (same shape as `public.*`, same constraints, verified live), used by the
QUALITY environment per the `devops-workflow` skill. `preprod.tasks`'s base shape is captured in
`supabase/migrations/preprod_schema_init.sql`/`preprod_schema_grants.sql`, but `preprod.profiles`
and preprod's `0005`-equivalent input-limit constraints were applied by hand with no corresponding
file in this repo — confirmed live via direct schema inspection, not documented anywhere in
`supabase/migrations/`. Worth a follow-up migration file if this environment is touched again (see
`docs/BACKLOG.md`).

`src/lib/tasks.ts`'s `Task` interface is the client-side mirror of this table, intentionally missing
`due_time` (dead column, see above) but otherwise 1:1.

## 2. Module map

`src/lib/*.ts` is framework-free — plain functions, no React, no direct Supabase imports except where
noted. This is deliberate: anything here is unit-testable in isolation, and each has a co-located
`*.test.ts`. `src/hooks/*.ts` is where side effects (Supabase calls, `useState`/`useEffect`) live —
the rule is mechanical: if it touches I/O or React state, it's a hook; if it's pure input→output, it's
in `lib`.

**Pure (tested), no I/O:**
- `ranking.ts` — rank-gap math (§5)
- `compare.ts` — binary-search comparator driving the duel (§5)
- `triage.ts` — leftover keep/drop date logic (§6)
- `tags.ts` — tag normalize/add/remove/suggest
- `swipe.ts` — swipe-commit decision + fling physics (§5)
- `realtimeMerge.ts` — reconciles one incoming realtime row into local state (§4)
- `transitions.ts` — shared framer-motion variants/springs (screen and step transitions)
- `pwa.ts` — install-prompt eligibility logic (standalone/iOS/dismissed checks)
- `validation.ts` — title/email/password validation, mirrored server-side by migration 0005
- `textScale.ts` — maps text length to a font-size/width tier (duel headline, card title)
- `history.ts` — history date ranges (presets, Monday-start weeks, inclusive custom range), group-by-local-day with hours totals, hours-input parsing (§8)

**I/O / environment-dependent:**
- `tasks.ts` — all Supabase CRUD for the `tasks` table (incl. the history queries: `listClosedTasks`, `updateTaskHours`, `lastActiveRank`, `reopenTask`)
- `supabase.ts` — client init (`createClient`, schema selected via `VITE_SUPABASE_SCHEMA`)
- `theme.ts` — reads/writes `profiles.theme_preference`
- `devMock.ts` — `VITE_DEV_MODE` bypass: mock session + in-memory task list mirroring `tasks.ts`'s API shape, so hooks can call either without branching on shape (only on which one to call)

`src/hooks/*.ts`: `useAuth` (session state, sign-in/up/out, OAuth), `useTasks` (§3, the task list and
every mutation), `useMorningFlow` (§6), `useCompareInsertion` (§5), `useLongPressDrag` (reorder-drag
gesture state), `useInstallPrompt`, `useRolloverPrompt`, `useReducedMotion`, `useAppUpdate`, `useTheme`,
`useToast`, `useHistory` (§8, closed tasks for a range + hours/reopen mutations), `useHashRoute` (§8).

## 3. The optimistic-mutation pattern

`useTasks.ts` repeats one shape across `completeTask`, `editTask`, `dropTask`, `keepLeftover`, and
(with a variant source) `commitReorder`:

1. Snapshot current `tasks` state.
2. Apply the change to local state immediately (optimistic — the UI never waits on the network).
3. Await the actual write (`DEV_MODE ? mockTasksApi.x(...) : realApi.x(...)`).
4. On failure: roll back to the snapshot, surface a `describeFailure(...)` message (network vs.
   server error, worded differently) via `error` state.

This shape is deliberately duplicated five times rather than extracted — flagged as a named,
still-open follow-up in `docs/plans/swipe-card-refinement/refinement-check-2026-08-21.md` §2.3 ("deepen `useTasks` around one
optimistic-mutation primitive"). `commitReorder`'s rollback source (a ref snapshot, not the plain
`previous` local var the other four use) is the specific wrinkle that review noted as not fitting the
primitive cleanly — worth resolving if/when that extraction happens, not assumed away.

`useHistory.ts`'s `setHours` and `reopen` follow the same four steps against their own `tasks` state,
reusing `useTasks`'s exported `describeFailure` for the wording.

## 4. Realtime sync

`useTasks` opens one Supabase Realtime channel per user (`tasks-changes-${userId}`, skipped entirely
in `DEV_MODE`), listening for any `postgres_changes` event on `tasks` filtered to that user. Each
incoming row goes through `realtimeMerge.ts`'s `upsertActiveTask`: removes any existing row with that
id, then re-inserts it in rank order if `status === 'active'` (drops it from local state otherwise —
covers done/dropped arriving from another tab/device). DELETE events are ignored outright; the app
never hard-deletes rows.

**The drag-interference guard:** `useTasks` holds `preReorderTasks` (a ref, not state — deliberately
outside the render cycle). `reorderTasks()` (called on every drag-frame during a manual reorder) sets
it once, to the pre-drag snapshot. The realtime callback checks `if (preReorderTasks.current) return`
and skips the incoming row entirely while a drag is in flight — without this, a server-echoed rank
update from an earlier action could race the in-progress visual reorder and clobber it mid-gesture.
`commitReorder` clears the ref back to `null` once the reordered ranks are persisted, re-arming
realtime.

## 5. Ranking & the compare-duel mechanic

**Rank-gap insertion** (`ranking.ts`): every task has a `rank: number`, sort key ascending. Inserting
between two neighbors computes the midpoint (`rankBetween`); inserting at an end uses neighbor ± 1.
`renumber(count)` produces flat integer ranks `0..count-1`, used to defragment after a full manual
drag-reorder (`commitReorder`) so ranks don't compress toward floating-point precision limits over
many insertions.

**Compare-insertion** (`compare.ts`): when a new task is added and ≥2 tasks already exist, instead of
appending it at the bottom the app runs a binary search — `startCompare(length)` seeds
`{low, high, candidateIndex}` over the existing list; `narrow(state, newTaskWon)` halves the range each
step. `newTaskWon: true` means the new task is more urgent than the current candidate. Terminates with
`{done: true, insertIndex}`. With 0 or 1 existing tasks the mechanic is skipped outright (an explicit
`PRODUCT.md` edge case) and the task is placed directly.

**Wiring to UI:** `useCompareInsertion.ts` owns the search state and exposes `begin`/`decide`/`candidate`/
`progress`; `CompareDuel.tsx` renders the current candidate as a swipeable card plus a ghost stack of
upcoming comparisons, with the new task shown as a chip that visually "overtakes" or "falls behind" the
card as the user drags (`chipY`/`chipAbove`/`chipBelow` transforms in `CompareDuel.tsx`, tracking drag
position live even mid-gesture). Right = new task outranks the candidate; left = it ranks below.

Swipe mechanics are split into two pure functions in `swipe.ts`, deliberately separated per the
architecture-deepening review in `docs/plans/swipe-card-refinement/refinement-check-2026-08-21.md` §2.1: `decideSwipeDirection`
answers only "does this drag-release cross the commit threshold, and which way" (used for drag-release
only); `planDuelFling` is unconditional and answers "given a direction, what's the fling distance/
duration/haptic" — used identically whether the commit came from a drag release or a button press
(`LeftoverCard.tsx`'s swipe reuses the same `planDuelFling`, having previously duplicated this formula
before that review's fix).

## 6. Morning flow

A three-step state machine (`useMorningFlow.ts`: `idle → leftover → braindump → merge → idle`),
triggered once per day (see `useRolloverPrompt`) or manually:

1. **Leftover triage** — `triage.ts`'s `isLeftover(task, today)` flags any active task whose
   `last_triaged_on` predates today. `useMorningFlow.start()` collects these into a queue;
   `resolveLeftover(keep)` pops one at a time, calling `useTasks`'s `keepLeftover` (bumps
   `last_triaged_on` to today) or `dropTask` (status → `'dropped'`) per decision. Skipped entirely if
   there are no leftovers.
2. **Brain dump** — free-form quick-add of new tasks for the day (`BrainDump.tsx`, reuses the plain
   `addTask` path — appended at the end, not run through the compare mechanic).
3. **Merge** — the leftover-kept tasks and freshly brain-dumped tasks now share the list; this step is
   presentation only (no further mutation), then `finishMerge()` returns to `idle`.

## 7. Auth & dev mode

Real auth is Supabase Auth (`useAuth.ts`): email/password plus Google/GitHub OAuth. Initial session
state deliberately does **not** use `supabase.auth.getSession()` — that reads straight from
`localStorage` and can resolve before the client has validated/refreshed the token server-side, which
was observed racing a PostgREST request into a spurious RLS rejection right after sign-in. Instead
`loading` stays true until the `INITIAL_SESSION` event fires from `onAuthStateChange`, with a 10s
timeout as a fallback error path.

`VITE_DEV_MODE=true` (`devMock.ts`) bypasses all of this: a hardcoded mock `Session`, a static
in-memory seeded task list (`mockTasksApi`, shaped to match `tasks.ts`'s real API so hooks don't branch
on shape), and OAuth buttons that just set the mock session directly. Exists so UI work and browser
automation don't require a real Supabase project — every hook checks `DEV_MODE` and calls
`mockTasksApi.x` instead of the real Supabase call.

## 8. History screen & hash routing

`History.tsx` lists closed tasks (`done` + `dropped`) for a date range so past work can be read back
when filling in a task-based timesheet. `completed_at` is the "closed at" timestamp for both statuses
(§1); rows are grouped by the *local* day they were closed (`history.ts`'s `localDayKey`, not
`toISOString`, which would bucket by UTC day). Each settled row has an optional decimal
`hours_spent` input (saved on blur/Enter, validated by `parseHours`, mirrored by the 0006 constraint);
let-go rows are shown muted without one. "Reopen" puts a task back at the bottom of today's list
(`rankBetween(lastActiveRank(), null)`) with `last_triaged_on = today` so it isn't re-triaged as a
leftover; Today refetches on mount, and other open tabs pick it up via realtime (§4).

Routing is a single hash route: `App.tsx`'s `screen` is `'history'` when signed in and
`useHashRoute()` reads `#/history`, otherwise the existing loading/today/auth/landing logic. A hash
route (not `/history`) because there is no router and no `vercel.json` SPA rewrite — a path route
would 404 on reload. Entry points: `history` in Today's desktop rail and the `Clock` icon in the
mobile header.

## 9. Known follow-ups

Pointers only — see the linked source for full detail, don't duplicate it here:

- **`useTasks` optimistic-mutation primitive** — five near-identical snapshot/apply/rollback blocks
  (§3) could collapse into one primitive; `commitReorder`'s ref-based rollback source is the design
  wrinkle to resolve first. `docs/plans/swipe-card-refinement/refinement-check-2026-08-21.md` §2.3.
- **`Today.tsx`'s duplicated failed-row handlers** — `handleComplete`/`handleDrop` repeat the same
  flash-timeout pattern; a third row action would copy it again. `docs/plans/swipe-card-refinement/refinement-check-2026-08-21.md`
  §2.2.
