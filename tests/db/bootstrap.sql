-- =============================================================================
-- Test-only stand-in for the Supabase-managed environment
-- =============================================================================
-- The ClientFlow migration targets Supabase, which provides the `anon`,
-- `authenticated` and `service_role` roles, the `auth` schema, `auth.users` and
-- `auth.uid()`. This file recreates just enough of that environment so the
-- migration and its Row Level Security policies can be exercised against a
-- plain PostgreSQL instance (local development and CI).
--
-- It is a test fixture: it is never applied to a real Supabase project, and it
-- deliberately contains no production data or credentials.
-- =============================================================================

-- Supabase-managed roles. `authenticated` is what application requests run as;
-- `anon` must have no access at all; `service_role` bypasses RLS by design.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;

  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;

  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

grant usage on schema public to anon, authenticated, service_role;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique
);

-- Same definition Supabase installs. PostgREST sets `request.jwt.claims` from
-- the verified JWT of the request, which is what makes `auth.uid()` trustworthy
-- inside the RLS policies.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
