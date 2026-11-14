-- Desk record search with pages, and "customer left" cancellation by the front desk (DECISIONS 2026-11-14).

-- ---------------------------------------------------------------------------
-- Cancellation reason
-- ---------------------------------------------------------------------------
alter table public.work_orders add column cancel_reason text
  check (cancel_reason is null or length(cancel_reason) between 1 and 200);

create or replace function app.job_json(p_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', w.id, 'order_no', w.order_no, 'status', w.status, 'version', w.version,
    'reasons', to_jsonb(w.reasons), 'odometer_km', w.odometer_km, 'notes', w.notes, 'pickup_date', w.pickup_date,
    'source', w.source, 'urgency', w.urgency, 'intake', w.intake,
    'signed_name', w.signed_name, 'signed_at', w.signed_at, 'signature_path', w.signature_path,
    'created_at', w.created_at, 'updated_at', w.updated_at, 'accepted_at', w.accepted_at, 'started_at', w.started_at,
    'completed_at', w.completed_at, 'picked_up_at', w.picked_up_at, 'cancelled_at', w.cancelled_at,
    'cancel_reason', w.cancel_reason,
    'customer', jsonb_build_object('id', c.id, 'name', c.name, 'phone', c.phone, 'email', c.email::text),
    'vehicle', jsonb_build_object('id', v.id, 'plate', v.plate, 'year', v.year, 'make', v.make, 'model', v.model,
                                  'engine', v.engine, 'vin', v.vin),
    'received_by', case when rb.id is not null then jsonb_build_object('id', rb.id, 'name', rb.name) end,
    'tech', case when t.id is not null then jsonb_build_object('id', t.id, 'name', t.name) end,
    'concerns', coalesce((select jsonb_agg(jsonb_build_object('text', x.text, 'estimate', x.estimate) order by x.position)
                          from public.work_order_concerns x where x.work_order_id = w.id), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object('type', x.type, 'description', x.description, 'qty', x.qty,
                                                           'unit_price', x.unit_price) order by x.position)
                       from public.work_order_items x where x.work_order_id = w.id), '[]'::jsonb),
    'totals', (select jsonb_build_object('parts', tt.parts, 'labour', tt.labour, 'tax', tt.tax, 'total', tt.total,
                                         'estimate', tt.estimate) from app.totals(w.id) tt),
    'events', coalesce((select jsonb_agg(jsonb_build_object('at', e.at, 'message', e.message, 'staff_name', s.name,
                                                            'kind', e.kind, 'to_status', e.to_status)
                                         order by e.at desc, e.id desc)
                        from public.work_order_events e left join public.staff s on s.id = e.staff_id
                        where e.work_order_id = w.id), '[]'::jsonb),
    'owner_is_current', exists (select 1 from public.vehicle_owners o
                                where o.vehicle_id = w.vehicle_id and o.customer_id = w.customer_id and o.to_at is null)
  )
  from public.work_orders w
  join public.customers c on c.id = w.customer_id
  join public.vehicles v on v.id = w.vehicle_id
  left join public.staff rb on rb.id = w.received_by
  left join public.staff t on t.id = w.tech_id
  where w.id = p_id
$$;

-- job_transition gains p_reason (required for cancelled). Front desk may now cancel at any open stage, e.g. when
-- the customer leaves without repairs; the workshop still cannot.
drop function public.job_transition(uuid, uuid, public.job_status, int);

create function public.job_transition(p_session uuid, p_id uuid, p_to public.job_status, p_expected_version int,
                                      p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s public.device_sessions := app.require_session(p_session, 'frontdesk', 'workshop', 'admin');
  w public.work_orders := app.lock_job(p_id);
  v_name text := app.staff_name(s.staff_id);
  v_reason text := nullif(regexp_replace(btrim(coalesce(p_reason, '')), '\s+', ' ', 'g'), '');
  v_allowed public.app_role[];
  v_msg text;
begin
  case
    when w.status = 'checked_in' and p_to = 'accepted' then
      v_allowed := '{frontdesk,admin}'; v_msg := 'Keys received by ' || v_name || '. Job added to the workshop queue';
    when w.status = 'accepted' and p_to = 'in_progress' then
      v_allowed := '{workshop,admin}'; v_msg := 'Job taken up by ' || v_name;
    when w.status = 'in_progress' and p_to = 'waiting_parts' then
      v_allowed := '{workshop,admin}'; v_msg := 'Waiting on parts. Set by ' || v_name;
    when w.status = 'waiting_parts' and p_to = 'in_progress' then
      v_allowed := '{workshop,admin}'; v_msg := 'Work resumed by ' || v_name;
    when w.status = 'in_progress' and p_to = 'ready' then
      v_allowed := '{workshop,admin}'; v_msg := 'Work completed by ' || v_name || '. Ready for pickup';
    when w.status = 'ready' and p_to = 'picked_up' then
      v_allowed := '{frontdesk,admin}'; v_msg := 'Picked up. Vehicle released by ' || v_name;
    when w.status not in ('picked_up', 'cancelled') and p_to = 'cancelled' then
      v_allowed := '{frontdesk,admin}'; v_msg := 'Cancelled by ' || v_name || '. Reason: ' || coalesce(v_reason, '');
    else
      perform app.raise('INVALID_TRANSITION', w.status::text || '->' || coalesce(p_to::text, 'null'));
  end case;
  if not (s.role = any (v_allowed)) then
    perform app.raise('ROLE_NOT_ALLOWED');
  end if;
  if p_to = 'cancelled' and (v_reason is null or length(v_reason) > 200) then
    perform app.raise('VALIDATION', 'reason');
  end if;
  if w.version <> p_expected_version then
    perform app.raise('VERSION_CONFLICT');
  end if;

  update public.work_orders set
    status = p_to,
    version = version + 1,
    accepted_at = case when p_to = 'accepted' then now() else accepted_at end,
    received_by = case when p_to = 'accepted' then coalesce(received_by, s.staff_id) else received_by end,
    started_at = case when p_to = 'in_progress' then coalesce(started_at, now()) else started_at end,
    tech_id = case when p_to = 'in_progress' and w.status = 'accepted' and s.role = 'workshop' then s.staff_id else tech_id end,
    completed_at = case when p_to = 'ready' then now() else completed_at end,
    picked_up_at = case when p_to = 'picked_up' then now() else picked_up_at end,
    pickup_date = case when p_to = 'picked_up'
                       then coalesce(pickup_date, (now() at time zone (select timezone from public.shops where id = w.shop_id))::date)
                       else pickup_date end,
    cancelled_at = case when p_to = 'cancelled' then now() else cancelled_at end,
    cancel_reason = case when p_to = 'cancelled' then v_reason else cancel_reason end
  where id = w.id;
  perform app.add_event(w, s.staff_id, 'status_change', w.status, p_to, v_msg);
  return app.job_json(w.id);
end $$;

-- ---------------------------------------------------------------------------
-- Customer and vehicle lists: search + pages. Returns { items, total }.
-- Customers match by name (contains), phone digits (contains, 3+ digits) or a current plate (contains, 2+ chars).
-- Vehicles match by plate (contains) or VIN (contains, 6+ characters).
-- ---------------------------------------------------------------------------
drop function public.list_customers();
drop function public.list_vehicles();

create function public.list_customers(p_query text default null, p_limit int default 25, p_offset int default 0)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_q text := lower(btrim(coalesce(p_query, '')));
  v_digits text := regexp_replace(v_q, '[^0-9]', '', 'g');
  v_plate text := app.norm_plate(v_q);
  v_limit int := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  r jsonb;
begin
  perform app.require_records_reader();
  with hits as (
    select c.* from public.customers c
    where c.shop_id = app.shop_id()
      and (v_q = ''
           or position(v_q in lower(c.name)) > 0
           or (length(v_digits) >= 3 and position(v_digits in c.phone) > 0)
           or (length(v_plate) >= 2 and exists (
                 select 1 from public.vehicle_owners o join public.vehicles v on v.id = o.vehicle_id
                 where o.customer_id = c.id and o.to_at is null and position(v_plate in v.plate) > 0)))
  ), page as (
    select * from hits order by lower(name), id limit v_limit offset v_offset
  )
  select jsonb_build_object(
    'total', (select count(*) from hits),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'id', c.id, 'name', c.name, 'phone', c.phone, 'email', c.email::text,
      'plates', coalesce((select jsonb_agg(v.plate order by o.from_at) from public.vehicle_owners o
                          join public.vehicles v on v.id = o.vehicle_id
                          where o.customer_id = c.id and o.to_at is null), '[]'::jsonb),
      'visit_count', (select count(*) from public.work_orders w where w.customer_id = c.id and w.status <> 'cancelled'),
      'last_visit_at', (select max(w.created_at) from public.work_orders w where w.customer_id = c.id))
      order by lower(c.name), c.id) from page c), '[]'::jsonb))
  into r;
  return r;
end $$;

create function public.list_vehicles(p_query text default null, p_limit int default 25, p_offset int default 0)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_plate text := app.norm_plate(p_query);
  v_limit int := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  r jsonb;
begin
  perform app.require_records_reader();
  with hits as (
    select v.* from public.vehicles v
    where v.shop_id = app.shop_id()
      and (v_plate = '' or position(v_plate in v.plate) > 0
           or (length(v_plate) >= 6 and position(v_plate in upper(coalesce(v.vin, ''))) > 0))
  ), page as (
    select * from hits order by plate, id limit v_limit offset v_offset
  )
  select jsonb_build_object(
    'total', (select count(*) from hits),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'id', v.id, 'plate', v.plate, 'year', v.year, 'make', v.make, 'model', v.model,
      'current_owners', coalesce((select jsonb_agg(c.name order by o.from_at) from public.vehicle_owners o
                                  join public.customers c on c.id = o.customer_id
                                  where o.vehicle_id = v.id and o.to_at is null), '[]'::jsonb),
      'owners_on_record', (select count(distinct o.customer_id) from public.vehicle_owners o where o.vehicle_id = v.id),
      'visit_count', (select count(*) from public.work_orders w where w.vehicle_id = v.id and w.status <> 'cancelled'),
      'last_visit_at', (select max(w.created_at) from public.work_orders w where w.vehicle_id = v.id),
      'last_odometer_km', app.last_odometer(v.id))
      order by v.plate, v.id) from page v), '[]'::jsonb))
  into r;
  return r;
end $$;

-- Grants for the recreated RPCs (authenticated only).
revoke all on function public.job_transition(uuid, uuid, public.job_status, int, text) from public, anon;
grant execute on function public.job_transition(uuid, uuid, public.job_status, int, text) to authenticated;
revoke all on function public.list_customers(text, int, int) from public, anon;
grant execute on function public.list_customers(text, int, int) to authenticated;
revoke all on function public.list_vehicles(text, int, int) from public, anon;
grant execute on function public.list_vehicles(text, int, int) to authenticated;
revoke all on function app.job_json(uuid) from public, anon;
grant execute on function app.job_json(uuid) to authenticated, service_role;
