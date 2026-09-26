-- Preprod equivalent of 0006_task_history.sql. Run this once, by hand, in the
-- SQL Editor of the dev/preprod Supabase project, after
-- preprod_profiles_and_input_limits.sql. Safe to re-run.

alter table preprod.tasks add column if not exists hours_spent numeric(5,2);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tasks_hours_spent_range' and conrelid = 'preprod.tasks'::regclass
  ) then
    alter table preprod.tasks
      add constraint tasks_hours_spent_range check (hours_spent is null or (hours_spent > 0 and hours_spent <= 24));
  end if;
end $$;

create index if not exists tasks_user_status_completed_idx on preprod.tasks (user_id, status, completed_at);

update preprod.tasks set completed_at = created_at where status = 'dropped' and completed_at is null;
