-- =============================================================================
-- ClientFlow V1.0 - Phase 1 profile lifecycle
-- =============================================================================
-- Creates the application profile row for every new auth user.
--
-- Why a trigger instead of application code:
--   The browser (and even a compromised Server Action) must never be the only
--   mechanism that establishes profile ownership. `auth.users` is the source of
--   truth for identity, so the profile is created in the same transaction that
--   creates the user, by the database itself.
--
-- Security properties:
--   * SECURITY DEFINER   - runs with the privileges of its owner (the migration
--                          role). This is required because at sign-up time there
--                          is no user session and therefore no RLS identity.
--                          Row Level Security is not forced on the owner, so the
--                          INSERT is permitted.
--   * SET search_path='' - every relation is schema-qualified below, so an
--                          object planted earlier in the search path cannot
--                          hijack the function.
--   * EXECUTE revoked    - the function only ever fires as a trigger and must
--                          not be callable as an RPC by anon/authenticated.
--   * It writes only `new.id`'s own row, so it cannot create or modify another
--     tenant's data.
--
-- Scope: V1.0 supports email + password sign-up only. Identities without an
-- email address are out of scope because `public.profiles.email` is NOT NULL and
-- constrained to an address-shaped value (see the Phase 0 migration).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- handle_new_user()
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, email, full_name)
  values (
    new.id,
    new.email,
    -- Sign-up metadata is attacker-controllable, so it is normalised here:
    -- trimmed, empty becomes NULL, and it is truncated to the 120 characters the
    -- profiles_full_name_check constraint allows. Without the truncation a
    -- hand-crafted sign-up request could fail its own insert and so block
    -- account creation.
    nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 120), '')
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Creates the public.profiles row for a new auth.users row. SECURITY DEFINER with an empty search_path; invoked only by the on_auth_user_created trigger.';

-- Trigger functions must not be reachable as RPC endpoints. PostgreSQL grants
-- EXECUTE to PUBLIC by default, so PUBLIC is revoked explicitly.
revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon;
revoke all on function public.handle_new_user() from authenticated;


-- -----------------------------------------------------------------------------
-- Trigger
-- -----------------------------------------------------------------------------
-- AFTER INSERT so that a failing profile insert rolls the user creation back
-- instead of leaving an account without a profile.
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- -----------------------------------------------------------------------------
-- Backfill
-- -----------------------------------------------------------------------------
-- Accounts created before this migration have no profile. `on conflict do
-- nothing` keeps the statement idempotent, and the `email is not null` filter
-- matches the trigger's V1.0 scope (email + password accounts only).
insert into public.profiles (user_id, email)
select id, email
from auth.users
where email is not null
on conflict (user_id) do nothing;
