-- Kiosk RPCs (SPEC-BACKEND 8.2). Kiosk results are masked: never full names, full phones,
-- emails or service history.

create or replace function app.last_odometer(p_vehicle uuid) returns int
language sql stable security definer set search_path = public, pg_temp as $$
  select max(odometer_km) from public.work_orders where vehicle_id = p_vehicle and status <> 'cancelled'
$$;

create or replace function app.kiosk_vehicle_json(v public.vehicles) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', v.id, 'plate', v.plate, 'year', v.year, 'make', v.make, 'model', v.model,
    'last_visit_at', (select max(created_at) from public.work_orders where vehicle_id = v.id and status <> 'cancelled'),
    'last_odometer_km', app.last_odometer(v.id))
$$;

create or replace function app.kiosk_customer_match(p_customer uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'match', 'customer',
    'customer', jsonb_build_object('id', c.id, 'first_name', app.first_name(c.name), 'phone_last4', right(c.phone, 4)),
    'vehicles', coalesce((
      select jsonb_agg(app.kiosk_vehicle_json(v) || jsonb_build_object('role', o.role) order by o.from_at desc)
      from public.vehicle_owners o join public.vehicles v on v.id = o.vehicle_id
      where o.customer_id = c.id and o.to_at is null), '[]'::jsonb))
  from public.customers c where c.id = p_customer
$$;

-- Validate and normalise a vehicle object from the kiosk or staff.
create or replace function app.clean_vehicle(p jsonb) returns jsonb
language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_plate text := app.norm_plate(p->>'plate');
  v_vin text := nullif(app.norm_plate(p->>'vin'), '');
  v_year int;
  v_make text := btrim(coalesce(p->>'make', ''));
  v_model text := btrim(coalesce(p->>'model', ''));
begin
  if length(v_plate) not between 2 and 8 then
    perform app.raise('VALIDATION', 'plate');
  end if;
  if nullif(btrim(coalesce(p->>'year', '')), '') is not null then
    begin
      v_year := (p->>'year')::int;
    exception when others then
      perform app.raise('VALIDATION', 'year');
    end;
    if v_year < 1970 or v_year > extract(year from now())::int + 1 then
      perform app.raise('VALIDATION', 'year');
    end if;
  end if;
  if v_make = '' then
    perform app.raise('VALIDATION', 'make');
  end if;
  if v_model = '' then
    perform app.raise('VALIDATION', 'model');
  end if;
  if v_vin is not null and length(v_vin) <> 17 then
    perform app.raise('VALIDATION', 'vin');
  end if;
  return jsonb_build_object('plate', v_plate, 'year', v_year, 'make', left(v_make, 60), 'model', left(v_model, 60),
                            'engine', nullif(left(btrim(coalesce(p->>'engine', '')), 60), ''), 'vin', v_vin);
end $$;

create or replace function app.clean_phone(p text) returns text
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  d text := app.norm_phone(p);
begin
  if length(d) <> 10 then
    perform app.raise('VALIDATION', 'phone');
  end if;
  return d;
end $$;

-- Find a customer by phone (+ same name, case-insensitive) or create one.
create or replace function app.find_or_create_customer(p_shop uuid, p_phone text, p_name text, p_email text default null)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_phone text := app.clean_phone(p_phone);
  v_name text := left(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'), 120);
  v_id uuid;
begin
  if v_name = '' then
    -- No name: only an unambiguous phone match will do.
    select id into v_id from public.customers where shop_id = p_shop and phone = v_phone;
    if v_id is null or (select count(*) from public.customers where shop_id = p_shop and phone = v_phone) > 1 then
      perform app.raise('VALIDATION', 'name');
    end if;
    return v_id;
  end if;
  select id into v_id from public.customers
  where shop_id = p_shop and phone = v_phone and lower(name) = lower(v_name)
  order by created_at limit 1;
  if v_id is null then
    insert into public.customers (shop_id, name, phone, email)
    values (p_shop, v_name, v_phone, nullif(lower(btrim(coalesce(p_email, ''))), ''))
    returning id into v_id;
  end if;
  return v_id;
end $$;

-- Shared vehicle rules for kiosk_register / kiosk_add_vehicle.
create or replace function app.kiosk_attach_vehicle(p_shop uuid, p_staff uuid, p_customer uuid, p_vehicle jsonb)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v jsonb := app.clean_vehicle(p_vehicle);
  v_id uuid;
begin
  select id into v_id from public.vehicles where shop_id = p_shop and plate = v->>'plate';
  if v_id is null then
    insert into public.vehicles (shop_id, plate, year, make, model, engine, vin)
    values (p_shop, v->>'plate', (v->>'year')::int, v->>'make', v->>'model', v->>'engine', v->>'vin')
    returning id into v_id;
    insert into public.vehicle_owners (shop_id, vehicle_id, customer_id, role, verified, source, created_by)
    values (p_shop, v_id, p_customer, 'owner', true, 'kiosk', p_staff);
    return jsonb_build_object('vehicle_id', v_id, 'next', 'visit');
  end if;
  if exists (select 1 from public.vehicle_owners where vehicle_id = v_id and customer_id = p_customer and to_at is null) then
    return jsonb_build_object('vehicle_id', v_id, 'next', 'visit');
  end if;
  if not exists (select 1 from public.vehicle_owners where vehicle_id = v_id and to_at is null) then
    insert into public.vehicle_owners (shop_id, vehicle_id, customer_id, role, verified, source, created_by)
    values (p_shop, v_id, p_customer, 'owner', true, 'kiosk', p_staff);
    return jsonb_build_object('vehicle_id', v_id, 'next', 'visit');
  end if;
  return jsonb_build_object('vehicle_id', v_id, 'next', 'link_owner');
end $$;

create or replace function app.require_customer(p_id uuid) returns public.customers
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  c public.customers;
begin
  select * into c from public.customers where id = p_id and shop_id = app.shop_id();
  if not found then
    perform app.raise('NOT_FOUND', 'customer');
  end if;
  return c;
end $$;

create or replace function app.require_vehicle(p_id uuid) returns public.vehicles
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v public.vehicles;
begin
  select * into v from public.vehicles where id = p_id and shop_id = app.shop_id();
  if not found then
    perform app.raise('NOT_FOUND', 'vehicle');
  end if;
  return v;
end $$;

-- ---------------------------------------------------------------------------

create or replace function public.kiosk_lookup(p_session uuid, p_query text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  s public.device_sessions := app.require_session(p_session, 'kiosk');
  v_digits text := regexp_replace(coalesce(p_query, ''), '[^0-9]', '', 'g');
  v_phone text := app.norm_phone(p_query);
  v_plate text := app.norm_plate(p_query);
  v_ids uuid[];
  v public.vehicles;
begin
  if length(v_digits) >= 7 then
    select array_agg(id order by created_at) into v_ids from public.customers
    where shop_id = s.shop_id
      and (phone = v_phone or (length(v_phone) < 10 and phone like '%' || v_phone));
    if cardinality(v_ids) = 1 then
      return app.kiosk_customer_match(v_ids[1]);
    elsif cardinality(v_ids) > 1 then
      return jsonb_build_object('match', 'customers', 'customers', (
        select jsonb_agg(jsonb_build_object('id', id, 'masked_name', app.mask_name(name), 'phone_last4', right(phone, 4))
                         order by created_at)
        from public.customers where id = any (v_ids)));
    end if;
  end if;

  if length(v_plate) >= 2 then
    select * into v from public.vehicles where shop_id = s.shop_id and plate = v_plate;
    if found then
      return jsonb_build_object('match', 'vehicle',
        'vehicle', app.kiosk_vehicle_json(v) - 'last_visit_at',
        'owners', coalesce((
          select jsonb_agg(jsonb_build_object('customer_id', c.id, 'masked_name', app.mask_name(c.name),
                                              'phone_last4', right(c.phone, 4), 'role', o.role) order by o.from_at)
          from public.vehicle_owners o join public.customers c on c.id = o.customer_id
          where o.vehicle_id = v.id and o.to_at is null), '[]'::jsonb));
    end if;
  end if;
  return jsonb_build_object('match', 'none');
end $$;

create or replace function public.kiosk_customer_vehicles(p_session uuid, p_customer_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.require_session(p_session, 'kiosk');
  perform app.require_customer(p_customer_id);
  return app.kiosk_customer_match(p_customer_id);
end $$;

create or replace function public.kiosk_register(p_session uuid, p_customer jsonb, p_vehicle jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s public.device_sessions := app.require_session(p_session, 'kiosk');
  v_name text := btrim(coalesce(p_customer->>'name', ''));
  v_phone text := app.clean_phone(p_customer->>'phone');
  v_email text := nullif(lower(btrim(coalesce(p_customer->>'email', ''))), '');
  v_existing boolean;
  v_customer uuid;
  r jsonb;
begin
  if v_name = '' then
    perform app.raise('VALIDATION', 'name');
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    perform app.raise('VALIDATION', 'email');
  end if;
  perform app.clean_vehicle(p_vehicle);
  v_existing := exists (select 1 from public.customers
                        where shop_id = s.shop_id and phone = v_phone and lower(name) = lower(v_name));
  v_customer := app.find_or_create_customer(s.shop_id, v_phone, v_name, v_email);
  r := app.kiosk_attach_vehicle(s.shop_id, s.staff_id, v_customer, p_vehicle);
  return jsonb_build_object('customer_id', v_customer, 'vehicle_id', r->'vehicle_id', 'next', r->'next',
                            'existing_customer', v_existing, 'first_name', app.first_name(v_name));
end $$;

create or replace function public.kiosk_add_vehicle(p_session uuid, p_customer_id uuid, p_vehicle jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s public.device_sessions := app.require_session(p_session, 'kiosk');
begin
  perform app.require_customer(p_customer_id);
  return app.kiosk_attach_vehicle(s.shop_id, s.staff_id, p_customer_id, p_vehicle);
end $$;

-- Add an ownership: 'transfer' ends all other current ownerships, 'co_owner' adds alongside.
create or replace function app.link_owner(p_shop uuid, p_staff uuid, p_vehicle uuid, p_customer uuid, p_mode text,
                                          p_source public.record_source) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_others boolean;
  v_id uuid;
begin
  if p_mode is null or p_mode not in ('transfer', 'co_owner') then
    perform app.raise('VALIDATION', 'mode');
  end if;
  v_others := exists (select 1 from public.vehicle_owners
                      where vehicle_id = p_vehicle and to_at is null and customer_id <> p_customer);
  if p_mode = 'transfer' then
    update public.vehicle_owners set to_at = now(), ended_reason = 'Sold / transferred'
    where vehicle_id = p_vehicle and to_at is null and customer_id <> p_customer;
  end if;
  select id into v_id from public.vehicle_owners where vehicle_id = p_vehicle and customer_id = p_customer and to_at is null;
  if v_id is not null then
    if p_mode = 'transfer' then
      update public.vehicle_owners set role = 'owner' where id = v_id;
    end if;
    return v_id;
  end if;
  insert into public.vehicle_owners (shop_id, vehicle_id, customer_id, role, verified, source, created_by)
  values (p_shop, p_vehicle, p_customer,
          case when p_mode = 'co_owner' and v_others then 'co_owner' else 'owner' end::public.owner_role,
          p_source = 'staff' or not v_others, p_source, p_staff)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.kiosk_link_owner(p_session uuid, p_vehicle_id uuid, p_customer jsonb, p_mode text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s public.device_sessions := app.require_session(p_session, 'kiosk');
  c public.customers;
  v_customer uuid;
begin
  perform app.require_vehicle(p_vehicle_id);
  if nullif(p_customer->>'customer_id', '') is not null then
    c := app.require_customer((p_customer->>'customer_id')::uuid);
    v_customer := c.id;
  else
    v_customer := app.find_or_create_customer(s.shop_id, p_customer->>'phone', p_customer->>'name');
  end if;
  perform app.link_owner(s.shop_id, s.staff_id, p_vehicle_id, v_customer, p_mode, 'kiosk');
  return jsonb_build_object('customer_id', v_customer,
                            'first_name', app.first_name((select name from public.customers where id = v_customer)));
end $$;

-- Keep only the documented intake keys (6.3).
create or replace function app.clean_intake(p jsonb) returns jsonb
language sql immutable set search_path = public, pg_temp as $$
  select case when p is null or jsonb_typeof(p) <> 'object' then null else jsonb_build_object(
    'transcript', left(coalesce(p->>'transcript', ''), 4000),
    'summary', left(coalesce(p->>'summary', ''), 1000),
    'when_it_happens', left(coalesce(p->>'when_it_happens', ''), 500),
    'warning_lights', coalesce((select jsonb_agg(left(x, 120)) from (
        select jsonb_array_elements_text(case when jsonb_typeof(p->'warning_lights') = 'array' then p->'warning_lights' else '[]' end) x
        limit 6) w), '[]'::jsonb),
    'urgency', case when p->>'urgency' in ('routine', 'soon', 'unsafe') then p->>'urgency' else 'routine' end,
    'safety_note', left(coalesce(p->>'safety_note', ''), 500),
    'questions', coalesce((select jsonb_agg(left(x, 300)) from (
        select jsonb_array_elements_text(case when jsonb_typeof(p->'questions') = 'array' then p->'questions' else '[]' end) x
        limit 2) q), '[]'::jsonb)
  ) end
$$;

create or replace function app.clean_reasons(p jsonb) returns public.visit_reason[]
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  r public.visit_reason[];
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) = 0 then
    return '{mechanical}';
  end if;
  begin
    select array_agg(distinct x::public.visit_reason) into r from jsonb_array_elements_text(p) x;
  exception when others then
    perform app.raise('VALIDATION', 'reasons');
  end;
  return r;
end $$;

create or replace function app.clean_odometer(p jsonb) returns int
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v numeric;
begin
  if p is null or jsonb_typeof(p) = 'null' or btrim(p #>> '{}') = '' then
    return null;
  end if;
  begin
    v := (p #>> '{}')::numeric;
  exception when others then
    perform app.raise('VALIDATION', 'odometer_km');
  end;
  if v < 0 or v > 2000000 then
    perform app.raise('VALIDATION', 'odometer_km');
  end if;
  return round(v)::int;
end $$;

-- Insert concern lines (text list or {text, estimate} objects), replacing existing ones.
create or replace function app.write_concerns(p_wo uuid, p jsonb, p_min int) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_n int;
begin
  if p is null or jsonb_typeof(p) <> 'array' then
    perform app.raise('VALIDATION', 'concerns');
  end if;
  delete from public.work_order_concerns where work_order_id = p_wo;
  insert into public.work_order_concerns (work_order_id, position, text, estimate)
  select p_wo, row_number() over (order by ord), t, e
  from (
    select ord,
           left(btrim(case when jsonb_typeof(x) = 'object' then x->>'text' else x #>> '{}' end), 500) as t,
           case when jsonb_typeof(x) = 'object' and nullif(x->>'estimate', '') is not null
                then (x->>'estimate')::numeric(10,2) end as e
    from jsonb_array_elements(p) with ordinality as a(x, ord)
  ) c
  where t <> '';
  get diagnostics v_n = row_count;
  if v_n < p_min or v_n > 8 then
    perform app.raise('VALIDATION', 'concerns');
  end if;
  if exists (select 1 from public.work_order_concerns where work_order_id = p_wo and estimate < 0) then
    perform app.raise('VALIDATION', 'concerns');
  end if;
exception when invalid_text_representation or numeric_value_out_of_range then
  perform app.raise('VALIDATION', 'concerns');
end $$;

create or replace function public.kiosk_check_in(p_session uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s public.device_sessions := app.require_session(p_session, 'kiosk');
  c public.customers;
  v_vehicle uuid;
  v_intake jsonb := app.clean_intake(p->'intake');
  v_signed text := left(btrim(coalesce(p->>'signed_name', '')), 120);
  v_sig text := btrim(coalesce(p->>'signature_path', ''));
  v_id uuid;
  v_no text;
begin
  c := app.require_customer(nullif(p->>'customer_id', '')::uuid);
  v_vehicle := (app.require_vehicle(nullif(p->>'vehicle_id', '')::uuid)).id;
  if not exists (select 1 from public.vehicle_owners
                 where vehicle_id = v_vehicle and customer_id = c.id and to_at is null) then
    perform app.raise('VALIDATION', 'customer_id');
  end if;
  if v_signed = '' then
    perform app.raise('VALIDATION', 'signed_name');
  end if;
  if v_sig !~ ('^' || s.shop_id::text || '/[0-9]{4}/[0-9]{2}/[0-9a-f-]{36}\.png$') then
    perform app.raise('VALIDATION', 'signature_path');
  end if;

  v_no := app.next_order_no(s.shop_id);
  insert into public.work_orders (shop_id, order_no, vehicle_id, customer_id, status, reasons, odometer_km,
                                  signed_name, signed_at, signature_path, source, intake, urgency)
  values (s.shop_id, v_no, v_vehicle, c.id, 'checked_in', app.clean_reasons(p->'reasons'), app.clean_odometer(p->'odometer_km'),
          v_signed, now(), v_sig, 'kiosk', v_intake, (v_intake->>'urgency')::public.urgency_level)
  returning id into v_id;
  perform app.write_concerns(v_id, p->'concerns', 1);
  insert into public.work_order_events (work_order_id, shop_id, staff_id, kind, to_status, message)
  values (v_id, s.shop_id, s.staff_id, 'kiosk_check_in', 'checked_in', 'Checked in at the kiosk by ' || v_signed);

  return jsonb_build_object('work_order_id', v_id, 'order_no', v_no, 'first_name', app.first_name(c.name),
                            'phone_masked', '(•••) •••-' || right(c.phone, 4));
end $$;
