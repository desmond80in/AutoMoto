-- Customers, vehicles, owners (SPEC-BACKEND 8.4) and admin (8.5).

create or replace function app.customer_json(p_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'customer', jsonb_build_object('id', c.id, 'name', c.name, 'phone', c.phone, 'email', c.email::text,
                                   'created_at', c.created_at),
    'vehicles', coalesce((
      select jsonb_agg(jsonb_build_object('id', v.id, 'owner_id', o.id, 'plate', v.plate, 'year', v.year, 'make', v.make,
                                          'model', v.model, 'role', o.role, 'since', o.from_at, 'verified', o.verified,
                                          'last_odometer_km', app.last_odometer(v.id)) order by o.from_at desc)
      from public.vehicle_owners o join public.vehicles v on v.id = o.vehicle_id
      where o.customer_id = c.id and o.to_at is null), '[]'::jsonb),
    'previous_vehicles', coalesce((
      select jsonb_agg(jsonb_build_object('id', v.id, 'plate', v.plate, 'year', v.year, 'make', v.make, 'model', v.model,
                                          'role', o.role, 'from_at', o.from_at, 'to_at', o.to_at,
                                          'ended_reason', o.ended_reason) order by o.to_at desc)
      from public.vehicle_owners o join public.vehicles v on v.id = o.vehicle_id
      where o.customer_id = c.id and o.to_at is not null), '[]'::jsonb),
    'visits', coalesce((select jsonb_agg(app.job_summary(w.id) order by w.created_at desc)
                        from public.work_orders w where w.customer_id = c.id), '[]'::jsonb),
    'visit_count', (select count(*) from public.work_orders w where w.customer_id = c.id and w.status <> 'cancelled'),
    'lifetime_total', coalesce((select sum(t.total) from public.work_orders w cross join lateral app.totals(w.id) t
                                where w.customer_id = c.id and w.status <> 'cancelled'), 0))
  from public.customers c where c.id = p_id
$$;

create or replace function app.vehicle_json(p_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'vehicle', jsonb_build_object('id', v.id, 'plate', v.plate, 'province', v.province, 'year', v.year, 'make', v.make,
                                  'model', v.model, 'engine', v.engine, 'vin', v.vin, 'created_at', v.created_at),
    'current_owners', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'customer_id', c.id, 'name', c.name, 'phone', c.phone,
                                          'role', o.role, 'since', o.from_at, 'verified', o.verified, 'source', o.source)
                       order by o.role, o.from_at)
      from public.vehicle_owners o join public.customers c on c.id = o.customer_id
      where o.vehicle_id = v.id and o.to_at is null), '[]'::jsonb),
    'previous_owners', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'customer_id', c.id, 'name', c.name, 'phone', c.phone,
                                          'role', o.role, 'from_at', o.from_at, 'to_at', o.to_at,
                                          'ended_reason', o.ended_reason) order by o.to_at desc)
      from public.vehicle_owners o join public.customers c on c.id = o.customer_id
      where o.vehicle_id = v.id and o.to_at is not null), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(app.job_summary(w.id) || jsonb_build_object(
               'customer_was_owner_then', exists (
                 select 1 from public.vehicle_owners o
                 where o.vehicle_id = w.vehicle_id and o.customer_id = w.customer_id
                   and o.from_at <= w.created_at and (o.to_at is null or o.to_at > w.created_at)),
               'customer_is_current_owner', exists (
                 select 1 from public.vehicle_owners o
                 where o.vehicle_id = w.vehicle_id and o.customer_id = w.customer_id and o.to_at is null))
             order by w.created_at desc)
      from public.work_orders w where w.vehicle_id = v.id), '[]'::jsonb),
    'last_odometer_km', app.last_odometer(v.id))
  from public.vehicles v where v.id = p_id
$$;

-- ---------------------------------------------------------------------------

create or replace function public.search_all(p_query text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_shop uuid := app.shop_id();
  q text := btrim(coalesce(p_query, ''));
  v_like text;
  v_digits text := regexp_replace(coalesce(p_query, ''), '[^0-9]', '', 'g');
  v_plate text := app.norm_plate(p_query);
begin
  perform app.require_records_reader();
  if length(q) < 2 then
    return jsonb_build_object('customers', '[]'::jsonb, 'vehicles', '[]'::jsonb, 'jobs', '[]'::jsonb);
  end if;
  v_like := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return jsonb_build_object(
    'customers', coalesce((
      select jsonb_agg(x.j order by x.name) from (
        select c.name, jsonb_build_object('id', c.id, 'name', c.name, 'phone', c.phone,
          'vehicle_count', (select count(*) from public.vehicle_owners o where o.customer_id = c.id and o.to_at is null)) as j
        from public.customers c
        where c.shop_id = v_shop
          and (c.name ilike v_like or c.email::text ilike v_like
               or (length(v_digits) >= 3 and c.phone like '%' || v_digits || '%'))
        order by c.name limit 12) x), '[]'::jsonb),
    'vehicles', coalesce((
      select jsonb_agg(x.j order by x.plate) from (
        select v.plate, jsonb_build_object('id', v.id, 'plate', v.plate, 'year', v.year, 'make', v.make, 'model', v.model,
          'current_owners', coalesce((select jsonb_agg(c.name order by o.from_at) from public.vehicle_owners o
                                      join public.customers c on c.id = o.customer_id
                                      where o.vehicle_id = v.id and o.to_at is null), '[]'::jsonb)) as j
        from public.vehicles v
        where v.shop_id = v_shop
          and ((length(v_plate) >= 2 and (v.plate like '%' || v_plate || '%' or v.vin like '%' || v_plate || '%'))
               or (v.make || ' ' || v.model) ilike v_like)
        order by v.plate limit 12) x), '[]'::jsonb),
    'jobs', coalesce((
      select jsonb_agg(app.job_summary(x.id) order by x.created_at desc) from (
        select w.id, w.created_at from public.work_orders w join public.vehicles v on v.id = w.vehicle_id
        where w.shop_id = v_shop
          and (w.order_no ilike v_like
               or (length(v_plate) >= 2 and v.plate like '%' || v_plate || '%')
               or exists (select 1 from public.work_order_concerns x where x.work_order_id = w.id and x.text ilike v_like))
        order by w.created_at desc limit 12) x), '[]'::jsonb));
end $$;

create or replace function public.get_customer(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.require_records_reader();
  perform app.require_customer(p_id);
  return app.customer_json(p_id);
end $$;

create or replace function public.get_vehicle(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.require_records_reader();
  perform app.require_vehicle(p_id);
  return app.vehicle_json(p_id);
end $$;

create or replace function public.update_customer(p_session uuid, p_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s public.device_sessions := app.require_session(p_session, 'frontdesk', 'admin');
  c public.customers := app.require_customer(p_id);
  v_name text := case when p ? 'name' then regexp_replace(btrim(coalesce(p->>'name', '')), '\s+', ' ', 'g') else c.name end;
  v_phone text := case when p ? 'phone' then app.clean_phone(p->>'phone') else c.phone end;
  v_email text := case when p ? 'email' then nullif(lower(btrim(coalesce(p->>'email', ''))), '') else c.email::text end;
begin
  if v_name = '' then
    perform app.raise('VALIDATION', 'name');
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    perform app.raise('VALIDATION', 'email');
  end if;
  if exists (select 1 from public.customers where shop_id = s.shop_id and id <> c.id
             and phone = v_phone and lower(name) = lower(v_name)) then
    perform app.raise('PHONE_TAKEN');
  end if;
  update public.customers set name = left(v_name, 120), phone = v_phone, email = v_email where id = c.id;
  return app.customer_json(c.id);
end $$;

create or replace function public.update_vehicle(p_session uuid, p_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s public.device_sessions := app.require_session(p_session, 'frontdesk', 'admin');
  v public.vehicles := app.require_vehicle(p_id);
  n jsonb;
begin
  n := app.clean_vehicle(jsonb_build_object(
    'plate', coalesce(p->>'plate', v.plate), 'year', case when p ? 'year' then p->>'year' else v.year::text end,
    'make', coalesce(p->>'make', v.make), 'model', coalesce(p->>'model', v.model),
    'engine', case when p ? 'engine' then p->>'engine' else v.engine end,
    'vin', case when p ? 'vin' then p->>'vin' else v.vin end));
  if exists (select 1 from public.vehicles where shop_id = s.shop_id and plate = n->>'plate' and id <> v.id) then
    perform app.raise('PLATE_TAKEN', n->>'plate');
  end if;
  update public.vehicles set plate = n->>'plate', year = (n->>'year')::int, make = n->>'make', model = n->>'model',
                             engine = n->>'engine', vin = n->>'vin'
  where id = v.id;
  return app.vehicle_json(v.id);
end $$;

create or replace function public.owner_add(p_session uuid, p_vehicle_id uuid, p_phone text, p_name text, p_mode text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s public.device_sessions := app.require_session(p_session, 'frontdesk', 'admin');
  v public.vehicles := app.require_vehicle(p_vehicle_id);
  v_customer uuid;
begin
  v_customer := app.find_or_create_customer(s.shop_id, p_phone, p_name);
  perform app.link_owner(s.shop_id, s.staff_id, v.id, v_customer, p_mode, 'staff');
  return app.vehicle_json(v.id);
end $$;

create or replace function app.require_owner_row(p_id uuid) returns public.vehicle_owners
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  o public.vehicle_owners;
begin
  select * into o from public.vehicle_owners where id = p_id and shop_id = app.shop_id();
  if not found then
    perform app.raise('NOT_FOUND', 'owner');
  end if;
  return o;
end $$;

create or replace function public.owner_end(p_session uuid, p_owner_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s public.device_sessions := app.require_session(p_session, 'frontdesk', 'admin');
  o public.vehicle_owners := app.require_owner_row(p_owner_id);
begin
  if o.to_at is not null then
    perform app.raise('NOT_CURRENT_OWNER');
  end if;
  update public.vehicle_owners set to_at = now(), ended_reason = 'Removed by staff' where id = o.id;
  return app.vehicle_json(o.vehicle_id);
end $$;

create or replace function public.owner_verify(p_session uuid, p_owner_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s public.device_sessions := app.require_session(p_session, 'frontdesk', 'admin');
  o public.vehicle_owners := app.require_owner_row(p_owner_id);
begin
  if o.to_at is not null then
    perform app.raise('NOT_CURRENT_OWNER');
  end if;
  update public.vehicle_owners set verified = true where id = o.id;
  return app.vehicle_json(o.vehicle_id);
end $$;

create or replace function public.list_customers() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.require_records_reader();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name, 'phone', c.phone, 'email', c.email::text,
      'plates', coalesce((select jsonb_agg(v.plate order by o.from_at) from public.vehicle_owners o
                          join public.vehicles v on v.id = o.vehicle_id
                          where o.customer_id = c.id and o.to_at is null), '[]'::jsonb),
      'visit_count', (select count(*) from public.work_orders w where w.customer_id = c.id and w.status <> 'cancelled'),
      'last_visit_at', (select max(w.created_at) from public.work_orders w where w.customer_id = c.id))
      order by c.name)
    from public.customers c where c.shop_id = app.shop_id()), '[]'::jsonb);
end $$;

create or replace function public.list_vehicles() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.require_records_reader();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', v.id, 'plate', v.plate, 'year', v.year, 'make', v.make, 'model', v.model,
      'current_owners', coalesce((select jsonb_agg(c.name order by o.from_at) from public.vehicle_owners o
                                  join public.customers c on c.id = o.customer_id
                                  where o.vehicle_id = v.id and o.to_at is null), '[]'::jsonb),
      'owners_on_record', (select count(distinct o.customer_id) from public.vehicle_owners o where o.vehicle_id = v.id),
      'visit_count', (select count(*) from public.work_orders w where w.vehicle_id = v.id and w.status <> 'cancelled'),
      'last_visit_at', (select max(w.created_at) from public.work_orders w where w.vehicle_id = v.id),
      'last_odometer_km', app.last_odometer(v.id))
      order by v.plate)
    from public.vehicles v where v.shop_id = app.shop_id()), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------

create or replace function public.list_staff() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.me();
  if not app.has_any_role('admin') then
    perform app.raise('ROLE_NOT_ALLOWED');
  end if;
  return coalesce((select jsonb_agg(app.staff_json(s) order by s.name) from public.staff s
                   where s.shop_id = app.shop_id()), '[]'::jsonb);
end $$;

create or replace function public.staff_upsert(p_session uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s public.device_sessions := app.require_session(p_session, 'admin');
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_name text := regexp_replace(btrim(coalesce(p->>'name', '')), '\s+', ' ', 'g');
  v_email text := lower(btrim(coalesce(p->>'email', '')));
  v_roles public.app_role[];
  v_qs public.app_role[];
  v_active boolean := coalesce((p->>'active')::boolean, true);
  v_pin text := nullif(btrim(coalesce(p->>'pin', '')), '');
  r public.staff;
begin
  if v_name = '' then
    perform app.raise('VALIDATION', 'name');
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    perform app.raise('VALIDATION', 'email');
  end if;
  begin
    select coalesce(array_agg(distinct x::public.app_role), '{}') into v_roles
    from jsonb_array_elements_text(coalesce(p->'roles', '[]'::jsonb)) x;
    select coalesce(array_agg(distinct x::public.app_role), '{}') into v_qs
    from jsonb_array_elements_text(coalesce(p->'quick_switch', '[]'::jsonb)) x;
  exception when others then
    perform app.raise('VALIDATION', 'roles');
  end;
  if cardinality(v_roles) = 0 then
    perform app.raise('VALIDATION', 'roles');
  end if;
  if not (v_qs <@ v_roles) then
    perform app.raise('VALIDATION', 'quick_switch');
  end if;
  if v_pin is not null and v_pin !~ '^[0-9]{4,6}$' then
    perform app.raise('VALIDATION', 'pin');
  end if;
  if exists (select 1 from public.staff where shop_id = s.shop_id and lower(email::text) = v_email
             and id is distinct from v_id) then
    perform app.raise('EMAIL_TAKEN');
  end if;

  if v_id is null then
    if v_pin is null then
      perform app.raise('VALIDATION', 'pin');
    end if;
    insert into public.staff (shop_id, email, name, roles, quick_switch, active, pin_hash)
    values (s.shop_id, v_email, left(v_name, 120), v_roles, v_qs, v_active,
            extensions.crypt(v_pin, extensions.gen_salt('bf', 10)))
    returning * into r;
  else
    if not exists (select 1 from public.staff where id = v_id and shop_id = s.shop_id) then
      perform app.raise('NOT_FOUND', 'staff');
    end if;
    if v_id = s.staff_id and not v_active then
      perform app.raise('SELF_DEACTIVATE');
    end if;
    update public.staff set
      email = v_email, name = left(v_name, 120), roles = v_roles, quick_switch = v_qs, active = v_active,
      pin_hash = case when v_pin is not null then extensions.crypt(v_pin, extensions.gen_salt('bf', 10)) else pin_hash end
    where id = v_id
    returning * into r;
    if not exists (select 1 from public.staff where shop_id = s.shop_id and active and 'admin' = any (roles)) then
      perform app.raise('LAST_ADMIN');
    end if;
  end if;
  return app.staff_json(r);
end $$;

create or replace function public.update_shop(p_session uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s public.device_sessions := app.require_session(p_session, 'admin');
  sh public.shops;
  v_name text;
  v_hst numeric;
  v_rate numeric;
begin
  select * into sh from public.shops where id = s.shop_id;
  v_name := case when p ? 'name' then btrim(coalesce(p->>'name', '')) else sh.name end;
  begin
    v_hst := case when p ? 'hst_rate' then (p->>'hst_rate')::numeric else sh.hst_rate end;
  exception when others then
    perform app.raise('VALIDATION', 'hst_rate');
  end;
  begin
    v_rate := case when p ? 'labour_rate' then (p->>'labour_rate')::numeric else sh.labour_rate end;
  exception when others then
    perform app.raise('VALIDATION', 'labour_rate');
  end;
  if v_name = '' then
    perform app.raise('VALIDATION', 'name');
  end if;
  if v_hst is null or v_hst < 0 or v_hst > 0.2 then
    perform app.raise('VALIDATION', 'hst_rate');
  end if;
  if v_rate is null or v_rate < 0 or v_rate > 1000 then
    perform app.raise('VALIDATION', 'labour_rate');
  end if;
  update public.shops set name = left(v_name, 120), hst_rate = round(v_hst, 4), labour_rate = round(v_rate, 2)
  where id = sh.id;
  return app.shop_json(sh.id);
end $$;
