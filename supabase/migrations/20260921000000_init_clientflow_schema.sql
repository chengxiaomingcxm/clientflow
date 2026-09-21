-- =============================================================================
-- ClientFlow V1.0 - Phase 0 initial schema
-- =============================================================================
-- Creates the tenant data model (profiles, clients, projects, tasks) together
-- with the ownership guarantees required by the product:
--
--   User -> Client -> Project -> Task
--
-- Tenant isolation rules enforced *in the database* (never only in the UI):
--
--   1. Every tenant-owned table carries `user_id` (owner = auth.users.id).
--   2. Composite unique keys `(id, user_id)` plus composite foreign keys
--      `(parent_id, user_id) -> parent (id, user_id)` make it impossible to
--      attach a row to a parent owned by a different user.
--   3. Row Level Security is enabled on every table and only "own row"
--      policies exist. There are no anonymous policies: the anon role can
--      read nothing.
--
-- This migration intentionally contains no authentication flow, no signup
-- trigger and no business logic; those belong to Phase 1+.
--
-- Requires: PostgreSQL >= 13 (gen_random_uuid) and the Supabase `auth` schema
-- (`auth.users`, `auth.uid()`).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Shared helper: maintain updated_at
-- -----------------------------------------------------------------------------
-- One generic trigger function is used by every table instead of duplicating
-- timestamp logic per table.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Trigger function that stamps updated_at with the current transaction timestamp.';


-- -----------------------------------------------------------------------------
-- Enumerated domains
-- -----------------------------------------------------------------------------
-- Enums are used instead of free-form text so that invalid status/priority
-- values are rejected by the database, not just by application validation.
create type public.project_status as enum (
  'planning',
  'in_progress',
  'on_hold',
  'completed',
  'cancelled'
);

create type public.task_status as enum (
  'todo',
  'in_progress',
  'done'
);

create type public.task_priority as enum (
  'low',
  'medium',
  'high'
);


-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
-- One row per authenticated user. `user_id` is the primary key and references
-- auth.users, so a profile cannot exist for a non-existent user and cannot be
-- reassigned to another user. It is the ownership column for this table.
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_email_check check (
    char_length(email) between 3 and 320 and position('@' in email) > 1
  ),
  constraint profiles_full_name_check check (
    full_name is null or char_length(btrim(full_name)) between 1 and 120
  )
);

comment on table public.profiles is
  'Application profile of an authenticated user. Owned by user_id = auth.users.id.';
comment on column public.profiles.user_id is
  'Tenant owner. Equals auth.users.id; primary key, so a profile is always owned by exactly one user.';


-- -----------------------------------------------------------------------------
-- clients
-- -----------------------------------------------------------------------------
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  email text,
  phone text,
  company text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Composite key required as the target of projects' composite foreign key.
  -- `id` alone is already unique; the pair guarantees tenant consistency.
  constraint clients_id_user_id_key unique (id, user_id),
  constraint clients_name_check check (char_length(btrim(name)) between 1 and 200),
  constraint clients_email_check check (
    email is null or (char_length(email) between 3 and 320 and position('@' in email) > 1)
  ),
  constraint clients_phone_check check (phone is null or char_length(phone) <= 40),
  constraint clients_company_check check (company is null or char_length(company) <= 200)
);

comment on table public.clients is
  'Client owned by a single user (tenant). Deleting the owner deletes their clients.';
comment on column public.clients.user_id is
  'Tenant owner. Row is visible only to this user (see RLS policies below).';



-- -----------------------------------------------------------------------------
-- projects
-- -----------------------------------------------------------------------------
-- Tenant consistency: a project may only reference a client that belongs to
-- the same user. This is enforced by the composite foreign key below rather
-- than by application code alone.
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  client_id uuid not null,
  name text not null,
  description text,
  status public.project_status not null default 'planning',
  -- Project value in the application's single currency (V1.0 has no
  -- multi-currency, invoicing or tax logic). numeric avoids float rounding.
  value numeric(12, 2) not null default 0,
  start_date date,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_id_user_id_key unique (id, user_id),
  constraint projects_client_tenant_fkey foreign key (client_id, user_id)
    references public.clients (id, user_id)
    on update no action
    on delete no action,
  constraint projects_name_check check (char_length(btrim(name)) between 1 and 200),
  constraint projects_value_check check (value >= 0),
  constraint projects_dates_check check (
    due_date is null or start_date is null or due_date >= start_date
  )
);

comment on table public.projects is
  'Project owned by a user and belonging to one of that user''s clients.';
comment on constraint projects_client_tenant_fkey on public.projects is
  'Guarantees (client_id, user_id) identifies a client owned by the same user.';
comment on column public.projects.value is
  'Agreed project value used for completed-revenue and pipeline metrics.';


-- -----------------------------------------------------------------------------
-- tasks
-- -----------------------------------------------------------------------------
-- Tenant consistency: a task may only reference a project of the same user.
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null,
  title text not null,
  description text,
  status public.task_status not null default 'todo',
  priority public.task_priority not null default 'medium',
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_project_tenant_fkey foreign key (project_id, user_id)
    references public.projects (id, user_id)
    on update no action
    on delete no action,
  constraint tasks_title_check check (char_length(btrim(title)) between 1 and 200)
);

comment on table public.tasks is
  'Task owned by a user and belonging to one of that user''s projects.';
comment on constraint tasks_project_tenant_fkey on public.tasks is
  'Guarantees (project_id, user_id) identifies a project owned by the same user.';


-- -----------------------------------------------------------------------------
-- Referential actions (documented decision)
-- -----------------------------------------------------------------------------
-- * `... references auth.users (id) on delete cascade` on every table: deleting
--   an account removes all of its tenant data (no orphaned rows survive).
-- * The composite parent foreign keys use the default NO ACTION: a client with
--   projects (or a project with tasks) cannot be silently deleted, so Phase 2+
--   has to make that decision explicit in the UI. NO ACTION is checked at the
--   end of the statement, which keeps cascading account deletion working.


-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------
-- Every list/search query in V1.0 is filtered by the owning user first, so all
-- indexes are prefixed with user_id. Indexes on the child side of the composite
-- foreign keys keep parent updates/deletes cheap.
create index clients_user_id_created_at_idx
  on public.clients (user_id, created_at desc);
create index clients_user_id_name_idx
  on public.clients (user_id, name);

create index projects_client_tenant_idx
  on public.projects (client_id, user_id);
create index projects_user_id_status_idx
  on public.projects (user_id, status);
create index projects_user_id_due_date_idx
  on public.projects (user_id, due_date)
  where due_date is not null;

create index tasks_project_tenant_idx
  on public.tasks (project_id, user_id);
create index tasks_user_id_status_idx
  on public.tasks (user_id, status);
create index tasks_user_id_due_date_idx
  on public.tasks (user_id, due_date)
  where due_date is not null;


-- -----------------------------------------------------------------------------
-- updated_at triggers
-- -----------------------------------------------------------------------------
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();


-- =============================================================================
-- Row Level Security
-- =============================================================================
-- Model: owner-only. `auth.uid()` comes from the verified JWT that Supabase
-- injects into the request; it cannot be spoofed by the client.
--
-- USING        -> which existing rows the statement may see/touch
--                 (SELECT, and the "old row" of UPDATE/DELETE).
-- WITH CHECK   -> which new/changed rows the statement is allowed to write
--                 (INSERT, and the "new row" of UPDATE).
--
-- WITH CHECK is what stops a client from inserting a row owned by somebody
-- else, or from re-parenting/transferring an existing row to another user.
-- DELETE has no WITH CHECK because it creates no new row.
--
-- All policies are restricted `to authenticated`: the anon role has no policy
-- at all, which means it reads and writes nothing (default deny).
--
-- RLS is intentionally NOT forced on table owners: the `postgres` role (used by
-- migrations and Supabase tooling) and `service_role` (server-side admin, never
-- exposed to the browser) keep their maintenance access. Application traffic
-- always goes through `anon`/`authenticated`, which are subject to RLS.
-- =============================================================================

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;

-- profiles: a user can only ever read and write their own profile row.
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (user_id = auth.uid());

create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "profiles_delete_own" on public.profiles
  for delete to authenticated
  using (user_id = auth.uid());

-- clients
create policy "clients_select_own" on public.clients
  for select to authenticated
  using (user_id = auth.uid());

create policy "clients_insert_own" on public.clients
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "clients_update_own" on public.clients
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "clients_delete_own" on public.clients
  for delete to authenticated
  using (user_id = auth.uid());

-- projects
-- USING re-checks ownership of the parent client so an existing row cannot be
-- moved onto another user's client; WITH CHECK keeps user_id pinned to the
-- caller. Together with the composite foreign key this makes cross-tenant
-- references impossible even if application checks are bypassed.
create policy "projects_select_own" on public.projects
  for select to authenticated
  using (user_id = auth.uid());

create policy "projects_insert_own" on public.projects
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.clients c
      where c.id = client_id and c.user_id = auth.uid()
    )
  );

create policy "projects_update_own" on public.projects
  for update to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.clients c
      where c.id = client_id and c.user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.clients c
      where c.id = client_id and c.user_id = auth.uid()
    )
  );

create policy "projects_delete_own" on public.projects
  for delete to authenticated
  using (user_id = auth.uid());

-- tasks (same shape as projects, parented by projects)
create policy "tasks_select_own" on public.tasks
  for select to authenticated
  using (user_id = auth.uid());

create policy "tasks_insert_own" on public.tasks
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.projects p
      where p.id = project_id and p.user_id = auth.uid()
    )
  );

create policy "tasks_update_own" on public.tasks
  for update to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.projects p
      where p.id = project_id and p.user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.projects p
      where p.id = project_id and p.user_id = auth.uid()
    )
  );

create policy "tasks_delete_own" on public.tasks
  for delete to authenticated
  using (user_id = auth.uid());


-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
-- RLS decides *which rows* a role may touch; GRANTs decide whether the role may
-- use the table at all. Both are required, and both are set explicitly so that
-- behaviour does not depend on project-level default privileges.
revoke all on table public.profiles from anon;
revoke all on table public.clients from anon;
revoke all on table public.projects from anon;
revoke all on table public.tasks from anon;

grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.clients to authenticated;
grant select, insert, update, delete on table public.projects to authenticated;
grant select, insert, update, delete on table public.tasks to authenticated;

-- service_role bypasses RLS by design and is only ever used server-side.
grant all on table public.profiles to service_role;
grant all on table public.clients to service_role;
grant all on table public.projects to service_role;
grant all on table public.tasks to service_role;
