-- Team Progress Tracker
-- Designed to live inside a Supabase project that already hosts other apps (e.g. game night):
-- every object is prefixed tpt_, and secrets live in the non-exposed `private` schema.
-- Safe to re-run.
--
-- Access model (no passwords for students):
--   * Every device signs in anonymously (Auth -> Sign In / Providers -> Anonymous must be ON).
--   * A device joins a team by entering that team's join code (tpt_join_team).
--   * Admin = a device that entered the admin passcode once (tpt_claim_admin).
--     Admin can create, archive, export and delete teams.
--   * Archived teams are read-only for students.
--
-- After running this file, set the admin passcode once in the SQL editor:
--   select private.tpt_set_admin_passcode('pick-something-good');

create schema if not exists private;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Private (never exposed through the API)
-- ---------------------------------------------------------------------------
create table if not exists private.tpt_config (
  key text primary key,
  value text not null
);

create table if not exists private.tpt_admins (
  user_id uuid primary key,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Public tables
-- ---------------------------------------------------------------------------
create table if not exists public.tpt_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  course text not null default '',
  objective text not null default '',
  starts_on date,
  ends_on date,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now()
);

create table if not exists private.tpt_join_codes (
  team_id uuid primary key references public.tpt_teams (id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{4,12}$')
);

create table if not exists private.tpt_devices (
  user_id uuid not null,
  team_id uuid not null references public.tpt_teams (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (user_id, team_id)
);

create table if not exists public.tpt_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.tpt_teams (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  role text not null default '',
  color text not null default '#CFB991',
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists tpt_members_team_idx on public.tpt_members (team_id);

-- Deliverables, presentations, meetings: the schedule.
create table if not exists public.tpt_events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.tpt_teams (id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 120),
  kind text not null default 'deliverable' check (kind in ('deliverable', 'presentation', 'meeting', 'other')),
  due_at timestamptz not null,
  location text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists tpt_events_team_idx on public.tpt_events (team_id);

create table if not exists public.tpt_tasks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.tpt_teams (id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 200),
  notes text not null default '',
  link text not null default '',
  owner_id uuid references public.tpt_members (id) on delete set null,
  event_id uuid references public.tpt_events (id) on delete set null,
  due_on date,
  status text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  created_by uuid references public.tpt_members (id) on delete set null,
  done_at timestamptz,
  confirmed_by uuid references public.tpt_members (id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- No team lead: anyone can confirm, but never their own task.
  constraint tpt_tasks_no_self_confirm check (confirmed_by is null or owner_id is null or confirmed_by <> owner_id),
  constraint tpt_tasks_confirm_needs_done check (confirmed_by is null or status = 'done')
);
create index if not exists tpt_tasks_team_idx on public.tpt_tasks (team_id);

create table if not exists public.tpt_activity (
  id bigint generated always as identity primary key,
  team_id uuid not null references public.tpt_teams (id) on delete cascade,
  member_id uuid references public.tpt_members (id) on delete set null,
  verb text not null check (length(verb) between 1 and 40),
  subject text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists tpt_activity_team_idx on public.tpt_activity (team_id, created_at desc);

create table if not exists public.tpt_lessons (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.tpt_teams (id) on delete cascade,
  member_id uuid references public.tpt_members (id) on delete set null,
  kind text not null check (kind in ('went_well', 'improve', 'try')),
  body text not null check (length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists tpt_lessons_team_idx on public.tpt_lessons (team_id);

create or replace function private.tpt_touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists tpt_tasks_touch on public.tpt_tasks;
create trigger tpt_tasks_touch before update on public.tpt_tasks
for each row execute function private.tpt_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Access helpers
-- ---------------------------------------------------------------------------
create or replace function public.tpt_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.tpt_admins where user_id = auth.uid());
$$;

create or replace function public.tpt_can_read(p_team uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.tpt_is_admin()
      or exists (select 1 from private.tpt_devices where user_id = auth.uid() and team_id = p_team);
$$;

create or replace function public.tpt_can_write(p_team uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.tpt_is_admin()
      or exists (
        select 1
        from private.tpt_devices d
        join public.tpt_teams t on t.id = d.team_id
        where d.user_id = auth.uid() and d.team_id = p_team and t.status = 'active'
      );
$$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
create or replace function private.tpt_set_admin_passcode(p_passcode text) returns void
language sql security definer set search_path = '' as $$
  insert into private.tpt_config (key, value)
  values ('admin_passcode_hash', extensions.crypt(p_passcode, extensions.gen_salt('bf')))
  on conflict (key) do update set value = excluded.value;
$$;
revoke execute on function private.tpt_set_admin_passcode(text) from public, anon, authenticated;

create or replace function public.tpt_claim_admin(p_passcode text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_hash text;
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  select value into v_hash from private.tpt_config where key = 'admin_passcode_hash';
  if v_hash is null then raise exception 'NO_PASSCODE_SET'; end if;
  if extensions.crypt(p_passcode, v_hash) <> v_hash then
    perform pg_sleep(1); -- slow down guessing
    return false;
  end if;
  insert into private.tpt_admins (user_id) values (auth.uid()) on conflict do nothing;
  return true;
end $$;

create or replace function public.tpt_join_team(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_team uuid;
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  select team_id into v_team from private.tpt_join_codes where code = upper(trim(p_code));
  if v_team is null then
    perform pg_sleep(1);
    return null;
  end if;
  insert into private.tpt_devices (user_id, team_id) values (auth.uid(), v_team) on conflict do nothing;
  return v_team;
end $$;

create or replace function public.tpt_leave_team(p_team uuid) returns void
language sql security definer set search_path = '' as $$
  delete from private.tpt_devices where user_id = auth.uid() and team_id = p_team;
$$;

-- Team members can see their own code (to share with a late teammate); admin sees all.
create or replace function public.tpt_join_code(p_team uuid) returns text
language sql stable security definer set search_path = '' as $$
  select code from private.tpt_join_codes where team_id = p_team and public.tpt_can_read(p_team);
$$;

create or replace function public.tpt_set_join_code(p_team uuid, p_code text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_code text := upper(trim(p_code));
begin
  if not public.tpt_is_admin() then raise exception 'NOT_ADMIN'; end if;
  if v_code !~ '^[A-Z0-9]{4,12}$' then raise exception 'BAD_CODE'; end if;
  if exists (select 1 from private.tpt_join_codes where code = v_code and team_id <> p_team) then
    raise exception 'CODE_TAKEN';
  end if;
  insert into private.tpt_join_codes (team_id, code) values (p_team, v_code)
  on conflict (team_id) do update set code = excluded.code;
end $$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.tpt_teams enable row level security;
alter table public.tpt_members enable row level security;
alter table public.tpt_events enable row level security;
alter table public.tpt_tasks enable row level security;
alter table public.tpt_activity enable row level security;
alter table public.tpt_lessons enable row level security;

grant select, insert, update, delete on
  public.tpt_teams, public.tpt_members, public.tpt_events, public.tpt_tasks, public.tpt_activity, public.tpt_lessons
  to authenticated;

drop policy if exists tpt_teams_select on public.tpt_teams;
create policy tpt_teams_select on public.tpt_teams for select to authenticated using (public.tpt_can_read(id));
drop policy if exists tpt_teams_insert on public.tpt_teams;
create policy tpt_teams_insert on public.tpt_teams for insert to authenticated with check (public.tpt_is_admin());
drop policy if exists tpt_teams_update on public.tpt_teams;
create policy tpt_teams_update on public.tpt_teams for update to authenticated
  using (public.tpt_can_write(id))
  with check (public.tpt_is_admin() or status = 'active'); -- only admin archives
drop policy if exists tpt_teams_delete on public.tpt_teams;
create policy tpt_teams_delete on public.tpt_teams for delete to authenticated using (public.tpt_is_admin());

do $$
declare
  t text;
begin
  foreach t in array array['tpt_members', 'tpt_events', 'tpt_tasks', 'tpt_lessons'] loop
    execute format('drop policy if exists %1$s_select on public.%1$s', t);
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (public.tpt_can_read(team_id))', t);
    execute format('drop policy if exists %1$s_write on public.%1$s', t);
    execute format('create policy %1$s_write on public.%1$s for all to authenticated using (public.tpt_can_write(team_id)) with check (public.tpt_can_write(team_id))', t);
  end loop;
end $$;

-- The activity log is append-only (admin can clean it up by deleting the team).
drop policy if exists tpt_activity_select on public.tpt_activity;
create policy tpt_activity_select on public.tpt_activity for select to authenticated using (public.tpt_can_read(team_id));
drop policy if exists tpt_activity_insert on public.tpt_activity;
create policy tpt_activity_insert on public.tpt_activity for insert to authenticated with check (public.tpt_can_write(team_id));

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['tpt_teams', 'tpt_members', 'tpt_events', 'tpt_tasks', 'tpt_activity', 'tpt_lessons'] loop
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
