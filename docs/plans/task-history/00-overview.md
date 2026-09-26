# Task History — Overview

Goal: a separate **history** screen where the user can see what they
finished (and dropped) over a chosen date range, so filling in a
task-based timesheet days later doesn't depend on memory. Each finished
task can carry an optional, manually entered **hours spent** value that the
user reads back when booking time.

Data is already there: rows are never hard-deleted, and `status='done'` rows
carry `completed_at` (`src/lib/tasks.ts` `updateTaskStatus`). So history
works retroactively for everything already completed.

## Decisions (agreed with the user, 2026-09-23)

- **Separate screen**, opened from Today (desktop rail button + mobile
  header icon), with a back button. Routed as **`#/history`**. The app has no
  router and no `vercel.json` SPA rewrite, so a `/history` path would 404
  on a hard reload in Vercel. A hash route needs neither a dependency nor
  a config change.
- **Per row:** title, day opened (`created_at`), day and time finished
  (`completed_at`), tags, optional decimal hours.
- **Hours are entered only on the history screen.** The Today completion
  flow (swipe/tap to done) is unchanged, with no extra prompt.
- **Hours format:** decimal (`0.5`, `1.25`, `3`), with `1,5` also accepted.
  Range 0 < h ≤ 24, blank means none.
- **Date range:** preset chips (today / yesterday / this week / last week)
  plus a custom from/to (native date inputs). Weeks start Monday. Results
  are grouped by local day, newest first, with each day's hours total.
- **Extras in scope:** reopen a closed task (it goes back to the bottom of
  Today's list), and show dropped tasks too, muted and without an hours
  input.
- **Out of scope for now:** tag filter, CSV/clipboard export, timer-based
  time tracking. Note these in `docs/BACKLOG.md` as follow-ups.

## Dropped-task dates

`completed_at` is only set on `done` today, so dropped tasks have no
timestamp. From phase 01 on, dropping also stamps `completed_at`, and the
column now means "closed at". **Existing dropped rows are backfilled
with `completed_at = created_at`** (agreed with the user). That date is an
approximation: an old dropped task shows under the day it was *created*,
not the day it was actually dropped.

## Phases

- `01-schema-and-data.md`: migration 0006 (`hours_spent`, constraint,
  index), `tasks.ts` + `devMock.ts` API additions.
- `02-logic-and-hook.md`: pure `src/lib/history.ts` (+ tests) and the
  `useHistory` hook.
- `03-ui-and-routing.md`: hash route in `App.tsx`, `History` page,
  `HistoryRow`, entry points on Today, styling, browser verification.

## Definition of done (per phase)

Every checkbox in the phase file is checked, and `npm run test`,
`npm run lint` and `npm run build` are clean. Move the phase file to `archive/`
when done. When all three are archived, run the `docs-maintenance` skill
and archive this overview.
