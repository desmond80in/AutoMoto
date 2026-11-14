-- pgTAP helpers. Test files include this inside their transaction:
--   \set helpers_included 1
--   \ir _helpers.sql
-- Run on its own (pg_prove runs every .sql file), it checks that the helpers load.
\if :{?helpers_included}
\else
begin;
select plan(1);
\endif

create schema if not exists tests;
grant usage on schema tests to authenticated, anon;

-- Act as a seeded staff member: role authenticated + JWT claims like the Cognito pre-token Lambda adds.
create or replace function tests.as_staff(p_email text) returns uuid
language plpgsql as $$
declare
  s public.staff;
begin
  perform set_config('role', 'postgres', true);
  select * into s from public.staff where lower(email::text) = lower(p_email);
  if not found then
    raise exception 'tests.as_staff: no staff %', p_email;
  end if;
  perform set_config('request.jwt.claims', json_build_object(
    'sub', s.id, 'role', 'authenticated', 'staff_id', s.id, 'shop_id', s.shop_id,
    'app_roles', array_to_string(s.roles, ' '), 'staff_email', s.email::text)::text, true);
  perform set_config('role', 'authenticated', true);
  return s.id;
end $$;

-- Back to the superuser with no claims.
create or replace function tests.reset() returns void
language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

-- Start a device session for the current test user and return its id.
create or replace function tests.session(p_role public.app_role) returns uuid
language plpgsql as $$
begin
  return (public.start_session(p_role, 'test device')->>'id')::uuid;
end $$;

-- The error message (code) raised by a statement, or null.
create or replace function tests.err(p_sql text) returns text
language plpgsql as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlerrm;
end $$;

grant execute on all functions in schema tests to authenticated, anon;

\if :{?helpers_included}
\else
select has_function('tests', 'as_staff', array['text'], 'helpers load');
select * from finish();
rollback;
\endif
