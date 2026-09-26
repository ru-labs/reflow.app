# Phase 2 — Pure logic and hook

The framework-free date and grouping logic (unit-tested), and the React
hook that wires it to the phase 01 data layer.

## Deliverables

- [x] `src/lib/history.ts`:
  - `type HistoryPreset = 'today' | 'yesterday' | 'thisWeek' | 'lastWeek'`
  - `presetRange(preset, now: Date): { from: Date; to: Date }`. Local
    time, `to` exclusive, weeks start Monday.
  - `customRange(fromIso: string, toIso: string): { from: Date; to: Date }`.
    Both days inclusive (so `to` = the day after `toIso` at 00:00). Swaps
    the dates if they're given in reverse.
  - `groupByDay(tasks: Task[]): { day: string; done: Task[]; dropped: Task[]; totalHours: number }[]`.
    The day is the local `YYYY-MM-DD` of `completed_at`, newest first.
    `totalHours` sums `done` only.
  - `parseHours(raw: string): { ok: true; value: number | null } | { ok: false; error: string }`.
    Trims, accepts `,` as the decimal separator, blank → `null`, rejects
    NaN, ≤ 0 and > `HOURS_MAX`, and rounds to 2 decimals.
- [x] `src/lib/history.test.ts` covers:
  - presets on a Monday, a Sunday, and at 00:00 and 23:59 edges
  - `customRange` inclusive end and swapped inputs
  - `groupByDay` split, ordering and totals (null hours ignored)
  - `parseHours`: `1.5`, `1,5`, `' 2 '`, `''`, `0`, `-1`, `24`, `24.01`, `abc`
- [x] `src/hooks/useHistory.ts`:
  - State: `range` (default preset `today`), `tasks`, `loading` and `error`.
    Refetches when `range` changes and ignores stale responses. Uses the
    `DEV_MODE ? mockTasksApi.x : x` switch like `useTasks`.
  - `setHours(id, hours)`: optimistic update, rolls back and sets `error`
    on failure (same shape as `useTasks`'s `completeTask`/`dropTask`, whose
    `describeFailure` is now exported and reused, so errors surface through
    an `error`/`dismissError` pair, not a toast).
  - `reopen(id)`: optimistically removes the row, calls
    `rankBetween(await lastActiveRank(), null)` then `reopenTask`, and on
    error rolls back and sets `error`.
  - Returns `groupByDay(tasks)` so the page does no grouping itself.
- [x] `npm run test` and `npm run lint` are clean.
