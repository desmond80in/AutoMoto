-- Workshop Check-In: schema, helpers, RLS, views (SPEC-BACKEND sections 6 and 7).

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('kiosk', 'frontdesk', 'workshop', 'display', 'admin');
create type public.job_status as enum ('checked_in', 'accepted', 'in_progress', 'waiting_parts', 'ready', 'picked_up', 'cancelled');
create type public.visit_reason as enum ('mechanical', 'body', 'accident');
create type public.line_type as enum ('part', 'labour');
create type public.owner_role as enum ('owner', 'co_owner');
create type public.record_source as enum ('kiosk', 'staff');
create type public.urgency_level as enum ('routine', 'soon', 'unsafe');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'America/Toronto',
  hst_rate numeric(5,4) not null default 0.13,
  labour_rate numeric(10,2) not null default 140,
  created_at timestamptz not null default now()
);

create table public.staff (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  email extensions.citext not null,
  name text not null,
  roles public.app_role[] not null,
  quick_switch public.app_role[] not null default '{}',
  pin_hash text,
  is_owner boolean not null default false,
  active boolean not null default true,
  cognito_sub uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, email),
  check (quick_switch <@ roles),
  check (cardinality(roles) > 0)
);
create index staff_email_idx on public.staff (lower(email::text));

create table public.device_sessions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  staff_id uuid not null references public.staff(id),
  role public.app_role not null,
  device_label text,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz
);
create index device_sessions_staff_idx on public.device_sessions (staff_id);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  name text not null,
  phone text not null check (phone ~ '^[0-9]{10}$'),
  email extensions.citext,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customers_shop_phone_idx on public.customers (shop_id, phone);
create index customers_name_trgm_idx on public.customers using gin (name extensions.gin_trgm_ops);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  plate text not null check (plate ~ '^[A-Z0-9]{2,8}$'),
  province text not null default 'ON',
  vin text check (vin is null or vin ~ '^[A-Z0-9]{17}$'),
  year int check (year is null or year between 1970 and 2100),
  make text not null,
  model text not null,
  engine text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, plate)
);

create table public.vehicle_owners (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  vehicle_id uuid not null references public.vehicles(id),
  customer_id uuid not null references public.customers(id),
  role public.owner_role not null,
  from_at timestamptz not null default now(),
  to_at timestamptz,
  ended_reason text,
  verified boolean not null,
  source public.record_source not null,
  created_by uuid references public.staff(id)
);
create unique index vehicle_owners_current_uidx on public.vehicle_owners (vehicle_id, customer_id) where to_at is null;
create index vehicle_owners_customer_idx on public.vehicle_owners (customer_id);

create table public.work_orders (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  order_no text not null,
  vehicle_id uuid not null references public.vehicles(id),
  customer_id uuid not null references public.customers(id),
  status public.job_status not null default 'checked_in',
  reasons public.visit_reason[] not null default '{mechanical}',
  odometer_km int check (odometer_km is null or odometer_km between 0 and 2000000),
  received_by uuid references public.staff(id),
  tech_id uuid references public.staff(id),
  pickup_date date,
  notes text not null default '',
  signed_name text,
  signed_at timestamptz,
  signature_path text,
  source public.record_source not null,
  intake jsonb,
  urgency public.urgency_level,
  accepted_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  picked_up_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1,
  unique (shop_id, order_no)
);
create index work_orders_shop_status_idx on public.work_orders (shop_id, status);
create index work_orders_vehicle_idx on public.work_orders (vehicle_id);
create index work_orders_customer_idx on public.work_orders (customer_id);

create table public.work_order_concerns (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  position int not null,
  text text not null,
  estimate numeric(10,2)
);
create index work_order_concerns_wo_idx on public.work_order_concerns (work_order_id, position);

create table public.work_order_items (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  position int not null,
  type public.line_type not null,
  description text not null,
  qty numeric(10,2) not null default 1,
  unit_price numeric(10,2) not null default 0
);
create index work_order_items_wo_idx on public.work_order_items (work_order_id, position);

create table public.work_order_events (
  id bigserial primary key,
  work_order_id uuid not null references public.work_orders(id),
  shop_id uuid not null references public.shops(id), -- realtime filters on shop_id
  at timestamptz not null default now(),
  staff_id uuid references public.staff(id),
  kind text not null check (kind in ('kiosk_check_in', 'created', 'status_change', 'details_updated', 'owner_note')),
  from_status public.job_status,
  to_status public.job_status,
  message text not null
);
create index work_order_events_wo_idx on public.work_order_events (work_order_id, at);

create table public.order_counters (
  shop_id uuid not null references public.shops(id),
  day date not null,
  last int not null,
  primary key (shop_id, day)
);

create table public.pin_attempts (
  id bigserial primary key,
  staff_id uuid not null references public.staff(id),
  at timestamptz not null default now(),
  success boolean not null
);
create index pin_attempts_staff_at_idx on public.pin_attempts (staff_id, at);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger staff_touch before update on public.staff for each row execute function public.touch_updated_at();
create trigger customers_touch before update on public.customers for each row execute function public.touch_updated_at();
create trigger vehicles_touch before update on public.vehicles for each row execute function public.touch_updated_at();
create trigger work_orders_touch before update on public.work_orders for each row execute function public.touch_updated_at();
revoke execute on function public.touch_updated_at() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- app schema helpers (not exposed through the Data API)
-- ---------------------------------------------------------------------------
create schema if not exists app;
grant usage on schema app to authenticated, service_role;

create or replace function app.raise(code text, detail text default null) returns void
language plpgsql as $$
begin
  if detail is null then
    raise exception using message = code, errcode = 'P0001';
  end if;
  raise exception using message = code, detail = detail, errcode = 'P0001';
end $$;

create or replace function app.staff_id() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select nullif(auth.jwt()->>'staff_id', '')::uuid
$$;

create or replace function app.shop_id() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select nullif(auth.jwt()->>'shop_id', '')::uuid
$$;

create or replace function app.has_any_role(variadic r public.app_role[]) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select s.active and s.roles && r
    from public.staff s
    where s.id = app.staff_id() and s.shop_id = app.shop_id()
  ), false)
$$;

create or replace function app.require_session(p_session uuid, variadic allowed public.app_role[])
returns public.device_sessions
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  s public.device_sessions;
  st public.staff;
begin
  select * into s from public.device_sessions where id = p_session;
  if not found or s.staff_id is distinct from app.staff_id() then
    perform app.raise('SESSION_INVALID');
  end if;
  if s.ended_at is not null or s.expires_at <= now() then
    perform app.raise('SESSION_EXPIRED');
  end if;
  select * into st from public.staff where id = s.staff_id;
  if not st.active then
    perform app.raise('NOT_STAFF');
  end if;
  if not (s.role = any (allowed)) or not (s.role = any (st.roles)) then
    perform app.raise('ROLE_NOT_ALLOWED');
  end if;
  return s;
end $$;

-- The current active staff row of the caller, or NOT_STAFF.
create or replace function app.me() returns public.staff
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  st public.staff;
begin
  select * into st from public.staff where id = app.staff_id() and shop_id = app.shop_id() and active;
  if not found then
    perform app.raise('NOT_STAFF');
  end if;
  return st;
end $$;

-- Next local midnight in the shop's time zone.
create or replace function app.next_midnight(p_tz text) returns timestamptz
language sql stable set search_path = public, pg_temp as $$
  select (date_trunc('day', now() at time zone p_tz) + interval '1 day') at time zone p_tz
$$;

create or replace function app.norm_plate(p text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select regexp_replace(upper(coalesce(p, '')), '[^A-Z0-9]', '', 'g')
$$;

create or replace function app.norm_phone(p text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case when length(d) = 11 and left(d, 1) = '1' then substr(d, 2) else d end
  from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) x
$$;

create or replace function app.first_name(p text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select coalesce((regexp_split_to_array(btrim(coalesce(p, '')), '\s+'))[1], '')
$$;

-- "Priya Sharma" -> "Priya S."
create or replace function app.mask_name(p text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case
    when cardinality(a) > 1 then a[1] || ' ' || left(a[cardinality(a)], 1) || '.'
    when coalesce(a[1], '') = '' then 'Customer'
    else a[1]
  end
  from (select regexp_split_to_array(btrim(coalesce(p, '')), '\s+') as a) x
$$;

-- YYMMDD-NN in shop time zone (8.6).
create or replace function app.next_order_no(p_shop uuid) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_day date;
  v_last int;
begin
  select (now() at time zone timezone)::date into v_day from public.shops where id = p_shop;
  if v_day is null then
    perform app.raise('NOT_FOUND', 'shop');
  end if;
  insert into public.order_counters (shop_id, day, last) values (p_shop, v_day, 1)
  on conflict (shop_id, day) do update set last = public.order_counters.last + 1
  returning last into v_last;
  return to_char(v_day, 'YYMMDD') || '-' || lpad(v_last::text, case when v_last > 99 then 3 else 2 end, '0');
end $$;

revoke all on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Privileges and Row Level Security
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['shops','staff','device_sessions','customers','vehicles','vehicle_owners','work_orders',
                           'work_order_concerns','work_order_items','work_order_events','order_counters','pin_attempts']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
revoke all on sequence public.work_order_events_id_seq, public.pin_attempts_id_seq from anon, authenticated;

grant select on public.shops, public.device_sessions, public.customers, public.vehicles, public.vehicle_owners,
  public.work_orders, public.work_order_concerns, public.work_order_items, public.work_order_events to authenticated;
-- staff: never pin_hash or cognito_sub
grant select (id, shop_id, email, name, roles, quick_switch, is_owner, active, created_at, updated_at)
  on public.staff to authenticated;

create policy shops_select on public.shops for select to authenticated using (id = app.shop_id());

create policy staff_select on public.staff for select to authenticated using (
  id = app.staff_id() or (shop_id = app.shop_id() and app.has_any_role('admin'))
);

create policy device_sessions_select on public.device_sessions for select to authenticated using (staff_id = app.staff_id());

create policy customers_select on public.customers for select to authenticated
  using (shop_id = app.shop_id() and app.has_any_role('frontdesk', 'workshop', 'admin'));
create policy vehicles_select on public.vehicles for select to authenticated
  using (shop_id = app.shop_id() and app.has_any_role('frontdesk', 'workshop', 'admin'));
create policy vehicle_owners_select on public.vehicle_owners for select to authenticated
  using (shop_id = app.shop_id() and app.has_any_role('frontdesk', 'workshop', 'admin'));
create policy work_orders_select on public.work_orders for select to authenticated
  using (shop_id = app.shop_id() and app.has_any_role('frontdesk', 'workshop', 'admin'));
create policy work_order_events_select on public.work_order_events for select to authenticated
  using (shop_id = app.shop_id() and app.has_any_role('frontdesk', 'workshop', 'admin'));
create policy work_order_concerns_select on public.work_order_concerns for select to authenticated using (
  app.has_any_role('frontdesk', 'workshop', 'admin')
  and exists (select 1 from public.work_orders w where w.id = work_order_id and w.shop_id = app.shop_id())
);
create policy work_order_items_select on public.work_order_items for select to authenticated using (
  app.has_any_role('frontdesk', 'workshop', 'admin')
  and exists (select 1 from public.work_orders w where w.id = work_order_id and w.shop_id = app.shop_id())
);
-- order_counters, pin_attempts: no policies (no client access).

-- ---------------------------------------------------------------------------
-- Views (filter inside: views run as owner, so RLS does not apply)
-- ---------------------------------------------------------------------------
create view public.v_work_order_totals as
select w.id as work_order_id,
       coalesce(i.parts, 0)::numeric(12,2) as parts,
       coalesce(i.labour, 0)::numeric(12,2) as labour,
       round((coalesce(i.parts, 0) + coalesce(i.labour, 0)) * s.hst_rate, 2)::numeric(12,2) as tax,
       (coalesce(i.parts, 0) + coalesce(i.labour, 0) + round((coalesce(i.parts, 0) + coalesce(i.labour, 0)) * s.hst_rate, 2))::numeric(12,2) as total,
       coalesce(c.estimate, 0)::numeric(12,2) as estimate
from public.work_orders w
join public.shops s on s.id = w.shop_id
left join lateral (
  select sum(qty * unit_price) filter (where type = 'part') as parts,
         sum(qty * unit_price) filter (where type = 'labour') as labour
  from public.work_order_items where work_order_id = w.id
) i on true
left join lateral (
  select sum(estimate) as estimate from public.work_order_concerns where work_order_id = w.id
) c on true
where w.shop_id = app.shop_id() and app.has_any_role('frontdesk', 'workshop', 'admin');

create view public.v_display_board as
select w.id, w.order_no, w.status, v.plate, v.make, v.model,
       app.mask_name(c.name) as masked_name,
       w.created_at, w.accepted_at, w.started_at,
       null::timestamptz as estimated_ready_at
from public.work_orders w
join public.vehicles v on v.id = w.vehicle_id
join public.customers c on c.id = w.customer_id
where w.shop_id = app.shop_id()
  and app.has_any_role('display', 'frontdesk', 'admin')
  and w.status in ('checked_in', 'accepted', 'in_progress', 'waiting_parts', 'ready')
order by case w.status when 'ready' then 1 when 'in_progress' then 2 when 'waiting_parts' then 3
                       when 'accepted' then 4 else 5 end,
         w.created_at;

create view public.v_job_durations as
select w.id as work_order_id, w.reasons,
       round(extract(epoch from (w.started_at - w.accepted_at)) / 60)::int as minutes_queued,
       round(extract(epoch from (w.completed_at - w.started_at)) / 60)::int as minutes_worked,
       round(extract(epoch from (w.completed_at - w.created_at)) / 60)::int as minutes_total,
       coalesce((select array_agg(i.description order by i.position) from public.work_order_items i
                 where i.work_order_id = w.id), '{}') as items
from public.work_orders w
where w.shop_id = app.shop_id() and app.has_any_role('admin') and w.completed_at is not null;

revoke all on public.v_work_order_totals, public.v_display_board, public.v_job_durations from anon, authenticated, public;
grant select on public.v_work_order_totals, public.v_display_board, public.v_job_durations to authenticated;
