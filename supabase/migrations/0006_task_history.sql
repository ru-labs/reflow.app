-- Task history screen: an optional, manually entered hours-spent value per
-- task, and an index for "closed tasks in a date range" queries.
--
-- completed_at now means "closed at": the client stamps it on both 'done'
-- and 'dropped'. Dropped rows from before that change have no date, so they
-- are backfilled with created_at — an approximation (they show under the day
-- they were created, not the day they were dropped).
--
-- Safe to re-run: column/index/constraint are only added if missing, and the
-- backfill only touches dropped rows still missing a date.

alter table public.tasks add column if not exists hours_spent numeric(5,2);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tasks_hours_spent_range' and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint tasks_hours_spent_range check (hours_spent is null or (hours_spent > 0 and hours_spent <= 24));
  end if;
end $$;

create index if not exists tasks_user_status_completed_idx on public.tasks (user_id, status, completed_at);

update public.tasks set completed_at = created_at where status = 'dropped' and completed_at is null;
