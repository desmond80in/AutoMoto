-- A vehicle can have at most one open work order (DECISIONS 2026-11-14). While it is in the shop, further concerns
-- go on the open job instead of a second check-in.

create unique index work_orders_one_open_per_vehicle on public.work_orders (vehicle_id)
  where status not in ('picked_up', 'cancelled');

-- Raises VEHICLE_IN_SHOP (detail: the open job's order number) when the vehicle already has an open work order.
create or replace function app.require_not_in_shop(p_vehicle uuid) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_no text;
begin
  select order_no into v_no from public.work_orders
  where vehicle_id = p_vehicle and status not in ('picked_up', 'cancelled');
  if found then
    perform app.raise('VEHICLE_IN_SHOP', v_no);
  end if;
end $$;

-- Kiosk vehicle tiles say whether the vehicle is already checked in (no history details).
create or replace function app.kiosk_vehicle_json(v public.vehicles) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', v.id, 'plate', v.plate, 'year', v.year, 'make', v.make, 'model', v.model,
    'last_visit_at', (select max(created_at) from public.work_orders where vehicle_id = v.id and status <> 'cancelled'),
    'last_odometer_km', app.last_odometer(v.id),
    'in_shop', exists (select 1 from public.work_orders where vehicle_id = v.id and status not in ('picked_up', 'cancelled')))
$$;

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
  perform app.require_not_in_shop(v_vehicle);

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

create or replace function public.create_work_order(p_session uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s public.device_sessions := app.require_session(p_session, 'frontdesk', 'admin');
  c public.customers := app.require_customer(nullif(p->>'customer_id', '')::uuid);
  v public.vehicles := app.require_vehicle(nullif(p->>'vehicle_id', '')::uuid);
  w public.work_orders;
begin
  if not exists (select 1 from public.vehicle_owners where vehicle_id = v.id and customer_id = c.id and to_at is null) then
    perform app.raise('NOT_CURRENT_OWNER');
  end if;
  perform app.require_not_in_shop(v.id);
  insert into public.work_orders (shop_id, order_no, vehicle_id, customer_id, status, reasons, odometer_km, source)
  values (s.shop_id, app.next_order_no(s.shop_id), v.id, c.id, 'checked_in', app.clean_reasons(p->'reasons'),
          app.clean_odometer(p->'odometer_km'), 'staff')
  returning * into w;
  perform app.write_concerns(w.id, coalesce(p->'concerns', '[]'::jsonb), 1);
  perform app.add_event(w, s.staff_id, 'created', null, 'checked_in',
                        'Work order created by ' || app.staff_name(s.staff_id));
  return app.job_json(w.id);
end $$;

revoke all on function app.require_not_in_shop(uuid) from public, anon;
grant execute on function app.require_not_in_shop(uuid) to authenticated, service_role;
