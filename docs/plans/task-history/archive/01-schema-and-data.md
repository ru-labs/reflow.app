# Phase 1 — Schema and data layer

Add the one new column and the Supabase calls the history screen needs.
There's no UI in this phase.

## Deliverables

- [x] `supabase/migrations/0006_task_history.sql` (safe to re-run, same
      `do $$ ... if not exists` guard style as `0005_input_limits.sql`):
  - `alter table public.tasks add column if not exists hours_spent numeric(5,2);`
    (nullable)
  - constraint `tasks_hours_spent_range`:
    `check (hours_spent is null or (hours_spent > 0 and hours_spent <= 24))`
  - `create index if not exists tasks_user_status_completed_idx on public.tasks (user_id, status, completed_at);`
  - one-time backfill for pre-existing dropped rows (safe to re-run, since
    it only touches rows still missing a date):
    `update public.tasks set completed_at = created_at where status = 'dropped' and completed_at is null;`
- [x] Matching preprod SQL (new `preprod_task_history.sql` targeting
      `preprod.tasks`), so QUALITY doesn't drift like it did before (see
      ARCHITECTURE §1 preprod note).
- [x] The user applies both files in the Supabase SQL Editor (dev + preprod
      schemas, then prod on release). Record that in the release notes/PR.
- [x] `src/lib/validation.ts`: `HOURS_MAX = 24`.
- [x] `src/lib/tasks.ts`:
  - `Task` gains `hours_spent: number | null`. `normalizeTask` defaults a
    missing value to `null`. Note that PostgREST returns `numeric` as a
    number or string depending on the client, so coerce it with `Number()`
    when it isn't null.
  - `updateTaskStatus`: also set `completed_at` when `status === 'dropped'`.
    Update the ARCHITECTURE data-model line to say "closed at".
  - `listClosedTasks(from: Date, to: Date): Promise<Task[]>`: status
    in (`done`, `dropped`), `completed_at >= from and < to`, ordered by
    `completed_at` desc.
  - `updateTaskHours(taskId, hours: number | null): Promise<void>`.
  - `lastActiveRank(): Promise<number | null>`: one-row query, active,
    order by rank desc, limit 1.
  - `reopenTask(taskId, rank): Promise<void>`: `status='active'`,
    `completed_at=null`, `last_triaged_on=<today>` (so `triage.ts` doesn't
    flag it as a leftover), and `rank`.
- [x] `src/lib/devMock.ts`: `hours_spent: null` on existing seeds, plus
      about 8 closed seed rows (mostly done, 2 dropped, a couple with hours)
      spread over the last ~10 days. Mirror `listClosed`, `updateHours`,
      `lastActiveRank` and `reopen` on `mockTasksApi`. Make
      `updateStatus` stamp `completed_at` on dropped too.
- [x] Existing tests still pass (`npm run test`). `npm run build` is clean.
