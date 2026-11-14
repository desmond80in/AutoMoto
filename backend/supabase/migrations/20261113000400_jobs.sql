-- Jobs (SPEC-BACKEND 8.3): full job shape, summaries, create, save, transitions, lookups.

create or replace function app.totals(p_wo uuid)
returns table (parts numeric, labour numeric, tax numeric, total numeric, estimate numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  with i as (
    select coalesce(sum(qty * unit_price) filter (where type = 'part'), 0)::numeric(12,2) as parts,
           coalesce(sum(qty * unit_price) filter (where type = 'labour'), 0)::numeric(12,2) as labour
    from public.work_order_items where work_order_id = p_wo
  ), r as (
    select s.hst_rate from public.work_orders w join public.shops s on s.id = w.shop_id where w.id = p_wo
  )
  select i.parts, i.labour,
         round((i.parts + i.labour) * r.hst_rate, 2),
         i.parts + i.labour + round((i.parts + i.labour) * r.hst_rate, 2),
         coalesce((select sum(estimate) from public.work_order_concerns where work_order_id = p_wo), 0)::numeric(12,2)
  from i, r
$$;

create or replace view public.v_work_order_totals as
select w.id as work_order_id, t.parts::numeric(12,2) as parts, t.labour::numeric(12,2) as labour,
       t.tax::numeric(12,2) as tax, t.total::numeric(12,2) as total, t.estimate::numeric(12,2) as estimate
from public.work_orders w cross join lateral app.totals(w.id) t
where w.shop_id = app.shop_id() and app.has_any_role('frontdesk', 'workshop', 'admin');
revoke all on public.v_work_order_totals from anon, public;
grant select on public.v_work_order_totals to authenticated;

create or replace function app.require_reader() returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.me();
  if not app.has_any_role('frontdesk', 'workshop', 'admin') then
    perform app.raise('ROLE_NOT_ALLOWED');
  end if;
end $$;

create or replace function app.require_records_reader() returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.me();
  if not app.has_any_role('frontdesk', 'admin') then
    perform app.raise('ROLE_NOT_ALLOWED');
  end if;
end $$;

create or replace function app.staff_name(p_id uuid) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select name from public.staff where id = p_id
$$;

create or replace function app.job_json(p_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', w.id, 'order_no', w.order_no, 'status', w.status, 'version', w.version,
    'reasons', to_jsonb(w.reasons), 'odometer_km', w.odometer_km, 'notes', w.notes, 'pickup_date', w.pickup_date,
    'source', w.source, 'urgency', w.urgency, 'intake', w.intake,
    'signed_name', w.signed_name, 'signed_at', w.signed_at, 'signature_path', w.signature_path,
    'created_at', w.created_at, 'updated_at', w.updated_at, 'accepted_at', w.accepted_at, 'started_at', w.started_at,
    'completed_at', w.completed_at, 'picked_up_at', w.picked_up_at, 'cancelled_at', w.cancelled_at,
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

create or replace function app.job_summary(p_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', w.id, 'order_no', w.order_no, 'status', w.status, 'version', w.version, 'urgency', w.urgency,
    'created_at', w.created_at, 'accepted_at', w.accepted_at, 'started_at', w.started_at,
    'completed_at', w.completed_at, 'picked_up_at', w.picked_up_at, 'odometer_km', w.odometer_km,
    'vehicle_id', v.id, 'plate', v.plate, 'year', v.year, 'make', v.make, 'model', v.model,
    'customer_id', c.id, 'customer_name', c.name, 'customer_phone', c.phone,
    'first_concern', (select x.text from public.work_order_concerns x where x.work_order_id = w.id order by x.position limit 1),
    'concern_count', (select count(*) from public.work_order_concerns x where x.work_order_id = w.id),
    'concerns', coalesce((select jsonb_agg(x.text order by x.position) from public.work_order_concerns x
                          where x.work_order_id = w.id), '[]'::jsonb),
    'safety_note', nullif(w.intake->>'safety_note', ''),
    'tech_name', t.name, 'received_by_name', rb.name,
    'total', tt.total, 'estimate', tt.estimate,
    'owner_unverified', exists (select 1 from public.vehicle_owners o
                                where o.vehicle_id = w.vehicle_id and o.to_at is null and not o.verified)
  )
  from public.work_orders w
  join public.customers c on c.id = w.customer_id
  join public.vehicles v on v.id = w.vehicle_id
  left join public.staff rb on rb.id = w.received_by
  left join public.staff t on t.id = w.tech_id
  cross join lateral app.totals(w.id) tt
  where w.id = p_id
$$;

create or replace function app.add_event(p_wo public.work_orders, p_staff uuid, p_kind text,
                                         p_from public.job_status, p_to public.job_status, p_message text)
returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into public.work_order_events (work_order_id, shop_id, staff_id, kind, from_status, to_status, message)
  values (p_wo.id, p_wo.shop_id, p_staff, p_kind, p_from, p_to, p_message)
$$;

-- Lock a job of the caller's shop for update.
create or replace function app.lock_job(p_id uuid) returns public.work_orders
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  w public.work_orders;
begin
  select * into w from public.work_orders where id = p_id and shop_id = app.shop_id() for update;
  if not found then
    perform app.raise('NOT_FOUND', 'work_order');
  end if;
  return w;
end $$;

-- ---------------------------------------------------------------------------

create or replace function public.get_work_order(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.require_reader();
  if not exists (select 1 from public.work_orders where id = p_id and shop_id = app.shop_id()) then
    perform app.raise('NOT_FOUND', 'work_order');
  end if;
  return app.job_json(p_id);
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
  insert into public.work_orders (shop_id, order_no, vehicle_id, customer_id, status, reasons, odometer_km, source)
  values (s.shop_id, app.next_order_no(s.shop_id), v.id, c.id, 'checked_in', app.clean_reasons(p->'reasons'),
          app.clean_odometer(p->'odometer_km'), 'staff')
  returning * into w;
  perform app.write_concerns(w.id, coalesce(p->'concerns', '[]'::jsonb), 1);
  perform app.add_event(w, s.staff_id, 'created', null, 'checked_in',
                        'Work order created by ' || app.staff_name(s.staff_id));
  return app.job_json(w.id);
end $$;

create or replace function app.job_details(p_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('reasons', to_jsonb(w.reasons), 'odometer_km', w.odometer_km, 'notes', w.notes,
    'pickup_date', w.pickup_date, 'received_by', w.received_by,
    'concerns', coalesce((select jsonb_agg(jsonb_build_object('text', text, 'estimate', estimate) order by position)
                          from public.work_order_concerns where work_order_id = w.id), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object('type', type, 'description', description, 'qty', qty,
                                                           'unit_price', unit_price) order by position)
                       from public.work_order_items where work_order_id = w.id), '[]'::jsonb))
  from public.work_orders w where w.id = p_id
$$;

create or replace function public.save_work_order(p_session uuid, p_id uuid, p_expected_version int, p_patch jsonb)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s public.device_sessions := app.require_session(p_session, 'frontdesk', 'workshop', 'admin');
  w public.work_orders := app.lock_job(p_id);
  v_before jsonb := app.job_details(p_id);
  v_pickup date;
  v_received uuid;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    perform app.raise('VALIDATION', 'patch');
  end if;
  if w.version <> p_expected_version then
    perform app.raise('VERSION_CONFLICT');
  end if;

  if p_patch ? 'pickup_date' then
    begin
      v_pickup := nullif(p_patch->>'pickup_date', '')::date;
    exception when others then
      perform app.raise('VALIDATION', 'pickup_date');
    end;
  else
    v_pickup := w.pickup_date;
  end if;
  if p_patch ? 'received_by' then
    v_received := nullif(p_patch->>'received_by', '')::uuid;
    if v_received is not null and not exists (select 1 from public.staff where id = v_received and shop_id = w.shop_id) then
      perform app.raise('VALIDATION', 'received_by');
    end if;
  else
    v_received := w.received_by;
  end if;
  if s.role = 'workshop' and (v_pickup is distinct from w.pickup_date or v_received is distinct from w.received_by) then
    perform app.raise('ROLE_NOT_ALLOWED');
  end if;

  update public.work_orders set
    reasons = case when p_patch ? 'reasons' then app.clean_reasons(p_patch->'reasons') else reasons end,
    odometer_km = case when p_patch ? 'odometer_km' then app.clean_odometer(p_patch->'odometer_km') else odometer_km end,
    notes = case when p_patch ? 'notes' then left(coalesce(p_patch->>'notes', ''), 4000) else notes end,
    pickup_date = v_pickup,
    received_by = v_received
  where id = w.id;

  if p_patch ? 'concerns' then
    perform app.write_concerns(w.id, p_patch->'concerns', 0);
  end if;
  if p_patch ? 'items' then
    if jsonb_typeof(p_patch->'items') <> 'array' or jsonb_array_length(p_patch->'items') > 100 then
      perform app.raise('VALIDATION', 'items');
    end if;
    delete from public.work_order_items where work_order_id = w.id;
    begin
      insert into public.work_order_items (work_order_id, position, type, description, qty, unit_price)
      select w.id, ord, (x->>'type')::public.line_type, left(btrim(x->>'description'), 300),
             coalesce(nullif(x->>'qty', '')::numeric(10,2), 1), coalesce(nullif(x->>'unit_price', '')::numeric(10,2), 0)
      from jsonb_array_elements(p_patch->'items') with ordinality as a(x, ord);
    exception when others then
      perform app.raise('VALIDATION', 'items');
    end;
    if exists (select 1 from public.work_order_items
               where work_order_id = w.id and (description is null or description = '' or qty < 0 or unit_price < 0)) then
      perform app.raise('VALIDATION', 'items');
    end if;
  end if;

  if app.job_details(w.id) is distinct from v_before then
    update public.work_orders set version = version + 1 where id = w.id;
    perform app.add_event(w, s.staff_id, 'details_updated', null, null,
                          'Repair details updated by ' || app.staff_name(s.staff_id));
  end if;
  return app.job_json(w.id);
end $$;

create or replace function public.job_transition(p_session uuid, p_id uuid, p_to public.job_status, p_expected_version int)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s public.device_sessions := app.require_session(p_session, 'frontdesk', 'workshop', 'admin');
  w public.work_orders := app.lock_job(p_id);
  v_name text := app.staff_name(s.staff_id);
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
      v_allowed := '{admin}'; v_msg := 'Cancelled by ' || v_name;
    else
      perform app.raise('INVALID_TRANSITION', w.status::text || '->' || coalesce(p_to::text, 'null'));
  end case;
  if not (s.role = any (v_allowed)) then
    perform app.raise('ROLE_NOT_ALLOWED');
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
    cancelled_at = case when p_to = 'cancelled' then now() else cancelled_at end
  where id = w.id;
  perform app.add_event(w, s.staff_id, 'status_change', w.status, p_to, v_msg);
  return app.job_json(w.id);
end $$;

create or replace function public.list_jobs(p_scope text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_shop uuid := app.shop_id();
  r jsonb;
begin
  perform app.require_reader();
  case p_scope
    when 'active' then
      select jsonb_agg(app.job_summary(id) order by created_at) into r from public.work_orders
      where shop_id = v_shop and status not in ('picked_up', 'cancelled');
    when 'arrivals' then
      select jsonb_agg(app.job_summary(id) order by created_at) into r from public.work_orders
      where shop_id = v_shop and status = 'checked_in';
    when 'queue' then
      select jsonb_agg(app.job_summary(id) order by (urgency = 'unsafe') desc nulls last, accepted_at) into r
      from public.work_orders where shop_id = v_shop and status = 'accepted';
    when 'mine' then
      select jsonb_agg(app.job_summary(id) order by started_at) into r from public.work_orders
      where shop_id = v_shop and tech_id = app.staff_id() and status in ('in_progress', 'waiting_parts');
    when 'recent_picked_up' then
      select jsonb_agg(app.job_summary(id) order by picked_up_at desc) into r from (
        select id, picked_up_at from public.work_orders
        where shop_id = v_shop and status = 'picked_up' order by picked_up_at desc limit 20) x;
    else
      perform app.raise('VALIDATION', 'scope');
  end case;
  return coalesce(r, '[]'::jsonb);
end $$;

create or replace function public.find_job_by_code(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_code text := btrim(coalesce(p_code, ''));
  v_digits text := regexp_replace(v_code, '[^0-9]', '', 'g');
  v_id uuid;
begin
  perform app.require_reader();
  if v_code ~* '^WO:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select id into v_id from public.work_orders where id = substr(v_code, 4)::uuid and shop_id = app.shop_id();
  end if;
  if v_id is null then
    select id into v_id from public.work_orders where order_no = v_code and shop_id = app.shop_id();
  end if;
  if v_id is null and length(v_digits) >= 3 then
    select id into v_id from public.work_orders
    where shop_id = app.shop_id() and status not in ('picked_up', 'cancelled')
      and replace(order_no, '-', '') like '%' || v_digits
    order by created_at desc limit 1;
  end if;
  if v_id is null then
    perform app.raise('NOT_FOUND', v_code);
  end if;
  return jsonb_build_object('id', v_id);
end $$;
