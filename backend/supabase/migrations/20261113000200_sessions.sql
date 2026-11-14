-- Identity, device sessions and PINs (SPEC-BACKEND 7.3, 7.4, 8.1).

create or replace function app.shop_json(p_shop uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', id, 'name', name, 'timezone', timezone,
                            'hst_rate', hst_rate, 'labour_rate', labour_rate)
  from public.shops where id = p_shop
$$;

create or replace function app.staff_json(s public.staff) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object('id', s.id, 'name', s.name, 'email', s.email::text, 'roles', to_jsonb(s.roles),
                            'quick_switch', to_jsonb(s.quick_switch), 'is_owner', s.is_owner, 'active', s.active,
                            'has_pin', s.pin_hash is not null, 'created_at', s.created_at)
$$;

create or replace function app.session_json(s public.device_sessions) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object('id', s.id, 'role', s.role, 'expires_at', s.expires_at, 'ended_at', s.ended_at)
$$;

-- Return an error response from PostgREST without rolling back the transaction
-- (used where the attempt itself must be recorded, e.g. PIN failures).
create or replace function app.error_response(code text, detail text default null) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
begin
  perform set_config('response.status', '400', true);
  return jsonb_build_object('code', 'P0001', 'message', code, 'details', detail, 'hint', null);
end $$;

-- ---------------------------------------------------------------------------

create or replace function public.me() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  st public.staff := app.me();
begin
  return jsonb_build_object('staff', app.staff_json(st) - 'active' - 'created_at', 'shop', app.shop_json(st.shop_id));
end $$;

create or replace function public.start_session(p_role public.app_role, p_device_label text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  st public.staff := app.me();
  s public.device_sessions;
begin
  if p_role is null or not (p_role = any (st.roles)) then
    perform app.raise('ROLE_NOT_ALLOWED');
  end if;
  insert into public.device_sessions (shop_id, staff_id, role, device_label, expires_at)
  values (st.shop_id, st.id, p_role, nullif(left(btrim(coalesce(p_device_label, '')), 80), ''),
          app.next_midnight((select timezone from public.shops where id = st.shop_id)))
  returning * into s;
  return app.session_json(s) - 'ended_at';
end $$;

create or replace function public.get_session(p_session uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  s public.device_sessions;
begin
  perform app.me();
  select * into s from public.device_sessions where id = p_session and staff_id = app.staff_id();
  if not found then
    perform app.raise('SESSION_INVALID');
  end if;
  if s.ended_at is not null or s.expires_at <= now() then
    perform app.raise('SESSION_EXPIRED');
  end if;
  return app.session_json(s);
end $$;

create or replace function public.switch_role(p_session uuid, p_role public.app_role) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  st public.staff := app.me();
  cur public.device_sessions := app.require_session(p_session, 'kiosk', 'frontdesk', 'workshop', 'display', 'admin');
  s public.device_sessions;
begin
  if p_role is null or not (p_role = any (st.roles)) then
    perform app.raise('ROLE_NOT_ALLOWED');
  end if;
  if not (cur.role = any (st.quick_switch)) or not (p_role = any (st.quick_switch)) then
    perform app.raise('QUICK_SWITCH_NOT_ALLOWED');
  end if;
  update public.device_sessions set ended_at = now() where id = cur.id;
  insert into public.device_sessions (shop_id, staff_id, role, device_label, expires_at)
  values (cur.shop_id, cur.staff_id, p_role, cur.device_label, cur.expires_at)
  returning * into s;
  return app.session_json(s) - 'ended_at';
end $$;

create or replace function public.end_session(p_session uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.device_sessions where id = p_session and staff_id = app.staff_id()) then
    perform app.raise('SESSION_INVALID');
  end if;
  update public.device_sessions set ended_at = coalesce(ended_at, now()) where id = p_session;
end $$;

create or replace function public.set_my_pin(p_pin text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  st public.staff := app.me();
begin
  if p_pin is null or p_pin !~ '^[0-9]{4,6}$' then
    perform app.raise('VALIDATION', 'pin');
  end if;
  update public.staff set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 10)) where id = st.id;
end $$;

-- Unlock a kiosk/display. Matches the caller's PIN or any active admin's PIN in the shop.
-- PIN_INVALID is returned as an error response (not raised) so the failed attempt is kept.
create or replace function public.verify_pin(p_session uuid, p_pin text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  st public.staff := app.me();
  v_fails timestamptz[];
  v_match uuid;
begin
  perform app.require_session(p_session, 'kiosk', 'display');

  select array_agg(at order by id desc) into v_fails from (
    select id, at from public.pin_attempts
    where staff_id = st.id and not success and at > now() - interval '5 minutes'
      and id > coalesce((select max(id) from public.pin_attempts where staff_id = st.id and success), 0)
    order by id desc limit 5
  ) f;
  if cardinality(v_fails) >= 5 then
    perform app.raise('PIN_LOCKED',
      greatest(1, ceil(extract(epoch from (v_fails[5] + interval '5 minutes' - now()))))::int::text);
  end if;

  if st.pin_hash is null and not exists (
    select 1 from public.staff where shop_id = st.shop_id and active and 'admin' = any (roles) and pin_hash is not null
  ) then
    perform app.raise('PIN_NOT_SET');
  end if;

  select id into v_match from public.staff
  where shop_id = st.shop_id and active and pin_hash is not null
    and (id = st.id or 'admin' = any (roles))
    and pin_hash = extensions.crypt(coalesce(p_pin, ''), pin_hash)
  order by (id = st.id) desc
  limit 1;

  insert into public.pin_attempts (staff_id, success) values (st.id, v_match is not null);
  if v_match is null then
    return app.error_response('PIN_INVALID');
  end if;
  return jsonb_build_object('ok', true, 'staff_id', v_match);
end $$;
