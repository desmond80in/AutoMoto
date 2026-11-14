-- Customer text messages (SMS) and "customer approval needed" on jobs (DECISIONS 2026-11-14).
-- Staff at the front desk send a text from the job drawer; the sms-api Lambda queues it through sms_queue (with the
-- staff member's own token, so every rule here applies), sends it with AWS End User Messaging SMS and records the
-- result with the Supabase secret key. Texts only go to customers who agreed to them (kiosk checkbox or desk toggle).

-- ---------------------------------------------------------------------------
-- Consent, shop phone, approval flag
-- ---------------------------------------------------------------------------
alter table public.customers
  add column sms_opt_in boolean not null default false,
  add column sms_opt_in_at timestamptz,
  add column sms_opt_in_source public.record_source;

alter table public.shops add column phone text check (phone is null or phone ~ '^[0-9]{10}$');

alter table public.work_orders
  add column approval_needed boolean not null default false,
  add column approval_note text check (approval_note is null or length(approval_note) between 1 and 200);

alter table public.work_order_events drop constraint work_order_events_kind_check;
alter table public.work_order_events add constraint work_order_events_kind_check
  check (kind in ('kiosk_check_in', 'created', 'status_change', 'details_updated', 'owner_note', 'approval', 'sms'));

-- ---------------------------------------------------------------------------
-- Messages
-- ---------------------------------------------------------------------------
create type public.sms_kind as enum ('ready', 'approval', 'waiting_parts', 'custom');
-- simulated: no origination number configured yet; recorded but not sent.
create type public.sms_status as enum ('queued', 'sent', 'simulated', 'failed');

create table public.sms_messages (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  to_phone text not null check (to_phone ~ '^[0-9]{10}$'),
  kind public.sms_kind not null,
  body text not null check (length(body) between 1 and 480),
  status public.sms_status not null default 'queued',
  error text,
  provider_message_id text,
  sent_by uuid references public.staff(id),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index sms_messages_wo_idx on public.sms_messages (work_order_id, created_at);
create index sms_messages_shop_created_idx on public.sms_messages (shop_id, created_at);

-- No client access: staff read messages through job_json; the Lambda writes results with the secret key.
alter table public.sms_messages enable row level security;
revoke all on public.sms_messages from anon, authenticated;

-- ---------------------------------------------------------------------------
-- JSON shapes
-- ---------------------------------------------------------------------------
create or replace function app.shop_json(p_shop uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', id, 'name', name, 'timezone', timezone,
                            'hst_rate', hst_rate, 'labour_rate', labour_rate, 'phone', phone)
  from public.shops where id = p_shop
$$;

create or replace function app.sms_json(p_wo uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'body', m.body, 'status', m.status,
                                               'error', m.error, 'created_at', m.created_at, 'sent_at', m.sent_at,
                                               'sent_by_name', s.name) order by m.created_at desc), '[]'::jsonb)
  from public.sms_messages m left join public.staff s on s.id = m.sent_by
  where m.work_order_id = p_wo
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
    'cancel_reason', w.cancel_reason,
    'approval_needed', w.approval_needed, 'approval_note', w.approval_note,
    'customer', jsonb_build_object('id', c.id, 'name', c.name, 'phone', c.phone, 'email', c.email::text,
                                   'sms_opt_in', c.sms_opt_in),
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
    'messages', app.sms_json(w.id),
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
                                where o.vehicle_id = w.vehicle_id and o.to_at is null and not o.verified),
    'approval_needed', w.approval_needed,
    'ready_texted', exists (select 1 from public.sms_messages m
                            where m.work_order_id = w.id and m.kind = 'ready' and m.status in ('sent', 'simulated'))
  )
  from public.work_orders w
  join public.customers c on c.id = w.customer_id
  join public.vehicles v on v.id = w.vehicle_id
  left join public.staff rb on rb.id = w.received_by
  left join public.staff t on t.id = w.tech_id
  cross join lateral app.totals(w.id) tt
  where w.id = p_id
$$;

-- customer_json gains the consent fields inside 'customer'.
do $$
declare
  v_def text := pg_get_functiondef('app.customer_json(uuid)'::regprocedure);
  v_new text := replace(v_def,
    $x$'email', c.email::text,
                                   'created_at', c.created_at)$x$,
    $x$'email', c.email::text,
                                   'created_at', c.created_at, 'sms_opt_in', c.sms_opt_in,
                                   'sms_opt_in_at', c.sms_opt_in_at, 'sms_opt_in_source', c.sms_opt_in_source)$x$);
begin
  if v_new = v_def then
    raise exception 'customer_json: pattern not found';
  end if;
  execute v_new;
end $$;

-- ---------------------------------------------------------------------------
-- Consent: kiosk checkbox and desk toggle
-- ---------------------------------------------------------------------------
create or replace function app.set_sms_consent(p_customer uuid, p_on boolean, p_source public.record_source)
returns void
language sql security definer set search_path = public, pg_temp as $$
  update public.customers
  set sms_opt_in = p_on, sms_opt_in_at = now(), sms_opt_in_source = p_source
  where id = p_customer and sms_opt_in is distinct from p_on
$$;

-- kiosk_check_in: optional p.sms_opt_in (boolean). The customer's latest choice wins.
do $$
declare
  v_def text := pg_get_functiondef('public.kiosk_check_in(uuid, jsonb)'::regprocedure);
  v_new text := replace(v_def,
    $x$  perform app.write_concerns(v_id, p->'concerns', 1);$x$,
    $x$  perform app.write_concerns(v_id, p->'concerns', 1);
  if jsonb_typeof(p->'sms_opt_in') = 'boolean' then
    perform app.set_sms_consent(c.id, (p->>'sms_opt_in')::boolean, 'kiosk');
  end if;$x$);
begin
  if v_new = v_def then
    raise exception 'kiosk_check_in: pattern not found';
  end if;
  execute v_new;
end $$;

-- update_customer: optional p.sms_opt_in (boolean), set by staff.
do $$
declare
  v_def text := pg_get_functiondef('public.update_customer(uuid, uuid, jsonb)'::regprocedure);
  v_new text := replace(v_def,
    $x$  update public.customers set name = left(v_name, 120), phone = v_phone, email = v_email where id = c.id;$x$,
    $x$  if p ? 'sms_opt_in' and jsonb_typeof(p->'sms_opt_in') <> 'boolean' then
    perform app.raise('VALIDATION', 'sms_opt_in');
  end if;
  update public.customers set name = left(v_name, 120), phone = v_phone, email = v_email where id = c.id;
  if p ? 'sms_opt_in' then
    perform app.set_sms_consent(c.id, (p->>'sms_opt_in')::boolean, 'staff');
  end if;$x$);
begin
  if v_new = v_def then
    raise exception 'update_customer: pattern not found';
  end if;
  execute v_new;
end $$;

-- update_shop: optional p.phone (10 digits, or '' to clear).
do $$
declare
  v_def text := pg_get_functiondef('public.update_shop(uuid, jsonb)'::regprocedure);
  v_new text := replace(v_def,
    $x$  update public.shops set name = left(v_name, 120), hst_rate = round(v_hst, 4), labour_rate = round(v_rate, 2)
  where id = sh.id;$x$,
    $x$  if p ? 'phone' and nullif(app.norm_phone(p->>'phone'), '') is not null
     and app.norm_phone(p->>'phone') !~ '^[0-9]{10}$' then
    perform app.raise('VALIDATION', 'phone');
  end if;
  update public.shops set name = left(v_name, 120), hst_rate = round(v_hst, 4), labour_rate = round(v_rate, 2),
    phone = case when p ? 'phone' then nullif(app.norm_phone(p->>'phone'), '') else phone end
  where id = sh.id;$x$);
begin
  if v_new = v_def then
    raise exception 'update_shop: pattern not found';
  end if;
  execute v_new;
end $$;

-- ---------------------------------------------------------------------------
-- Approval needed
-- ---------------------------------------------------------------------------
create or replace function public.set_approval_needed(p_session uuid, p_id uuid, p_on boolean, p_expected_version int,
                                                      p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s public.device_sessions := app.require_session(p_session, 'frontdesk', 'workshop', 'admin');
  w public.work_orders := app.lock_job(p_id);
  v_note text := nullif(regexp_replace(btrim(coalesce(p_note, '')), '\s+', ' ', 'g'), '');
  v_name text := app.staff_name(s.staff_id);
begin
  if p_on is null then
    perform app.raise('VALIDATION', 'approval_needed');
  end if;
  if w.status in ('picked_up', 'cancelled') then
    perform app.raise('INVALID_TRANSITION', w.status::text);
  end if;
  if length(v_note) > 200 then
    perform app.raise('VALIDATION', 'approval_note');
  end if;
  if w.version <> p_expected_version then
    perform app.raise('VERSION_CONFLICT');
  end if;
  if w.approval_needed = p_on and (not p_on or w.approval_note is not distinct from v_note) then
    return app.job_json(w.id);
  end if;
  update public.work_orders set
    approval_needed = p_on,
    approval_note = case when p_on then v_note end,
    version = version + 1
  where id = w.id;
  perform app.add_event(w, s.staff_id, 'approval', null, null,
    case when p_on then 'Customer approval needed' || coalesce(': ' || v_note, '') || '. Set by ' || v_name
         else 'Customer approval received. Cleared by ' || v_name end);
  return app.job_json(w.id);
end $$;

-- ---------------------------------------------------------------------------
-- Queue a text (called by the sms-api Lambda with the staff member's token)
-- Returns { id, to (E.164), body }. At most 5 texts per job per hour and 200 per shop per day.
-- ---------------------------------------------------------------------------
create or replace function public.sms_queue(p_session uuid, p_work_order_id uuid, p_kind public.sms_kind, p_body text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s public.device_sessions := app.require_session(p_session, 'frontdesk', 'admin');
  w public.work_orders := app.lock_job(p_work_order_id);
  c public.customers;
  v_body text := btrim(regexp_replace(coalesce(p_body, ''), '[ \t]+', ' ', 'g'));
  v_id uuid;
  v_label text;
begin
  if p_kind is null then
    perform app.raise('VALIDATION', 'kind');
  end if;
  if v_body = '' or length(v_body) > 480 then
    perform app.raise('VALIDATION', 'body');
  end if;
  if w.status = 'cancelled' then
    perform app.raise('INVALID_TRANSITION', w.status::text);
  end if;
  select * into c from public.customers where id = w.customer_id;
  if not c.sms_opt_in then
    perform app.raise('SMS_NOT_ALLOWED');
  end if;
  if (select count(*) from public.sms_messages where work_order_id = w.id and created_at > now() - interval '1 hour') >= 5
     or (select count(*) from public.sms_messages where shop_id = w.shop_id and created_at > now() - interval '1 day') >= 200 then
    perform app.raise('RATE_LIMITED');
  end if;

  insert into public.sms_messages (shop_id, work_order_id, customer_id, to_phone, kind, body, sent_by)
  values (w.shop_id, w.id, c.id, c.phone, p_kind, v_body, s.staff_id)
  returning id into v_id;
  v_label := case p_kind when 'ready' then 'ready for pickup' when 'approval' then 'approval needed'
                         when 'waiting_parts' then 'waiting on parts' else 'message' end;
  perform app.add_event(w, s.staff_id, 'sms', null, null,
                        'Text to the customer (' || v_label || ') by ' || app.staff_name(s.staff_id));
  return jsonb_build_object('id', v_id, 'to', '+1' || c.phone, 'body', v_body, 'customer_id', c.id);
end $$;

revoke all on function public.set_approval_needed(uuid, uuid, boolean, int, text) from public, anon;
revoke all on function public.sms_queue(uuid, uuid, public.sms_kind, text) from public, anon;
grant execute on function public.set_approval_needed(uuid, uuid, boolean, int, text) to authenticated;
grant execute on function public.sms_queue(uuid, uuid, public.sms_kind, text) to authenticated;
revoke all on function app.sms_json(uuid), app.set_sms_consent(uuid, boolean, public.record_source) from public, anon;
grant execute on function app.sms_json(uuid), app.set_sms_consent(uuid, boolean, public.record_source) to authenticated, service_role;
