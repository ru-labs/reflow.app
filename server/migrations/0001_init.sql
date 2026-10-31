-- End state of the Supabase migrations 0001 + 0002 + 0004 + 0005 + 0006, with
-- our own users/sessions in place of auth.users. Column names mirror Supabase
-- so a later data migration is a straight copy. No RLS: the API scopes every
-- query by user_id.

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  encrypted_password text,
  email_confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index users_email_lower_idx on users (lower(email));

create table sessions (
  token_hash text primary key,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index sessions_user_idx on sessions (user_id);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  note text,
  status text not null default 'active' check (status in ('active', 'done', 'dropped')),
  rank double precision not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  last_triaged_on date not null default current_date,
  tags text[] not null default '{}',
  due_time time,
  hours_spent numeric(5,2),
  constraint tasks_title_length check (char_length(title) <= 200),
  constraint tasks_title_not_blank check (char_length(trim(title)) > 0),
  constraint tasks_tags_count check (array_length(tags, 1) is null or array_length(tags, 1) <= 10),
  constraint tasks_hours_spent_range check (hours_spent is null or (hours_spent > 0 and hours_spent <= 24))
);

create index tasks_user_status_rank_idx on tasks (user_id, status, rank);
create index tasks_user_status_completed_idx on tasks (user_id, status, completed_at);

create table profiles (
  user_id uuid primary key references users(id) on delete cascade,
  theme_preference text not null default 'system' check (theme_preference in ('system', 'light', 'dark'))
);

-- Ids only: NOTIFY payloads are capped at 8000 bytes and `note` is unbounded.
create function notify_task_change() returns trigger language plpgsql as $$
begin
  perform pg_notify('task_changes', json_build_object('id', new.id, 'user_id', new.user_id)::text);
  return new;
end $$;

create trigger tasks_notify
  after insert or update on tasks
  for each row execute function notify_task_change();
