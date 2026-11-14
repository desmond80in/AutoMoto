-- Demo data for a deployed shop (the hosted project), built from seed.sql. Not for local use: `supabase db reset` runs seed.sql.
-- Attaches sample customers, vehicles and jobs to the existing shop and adds one demo technician (Sam Okonkwo, PIN 1111).
-- Run: npm run demo:load    Remove: npm run demo:remove
-- psql variables (set by scripts/demo-data.sh): shop, owner, owner_name, desk, desk_name.
\set ON_ERROR_STOP on
begin;

do $$ begin
  if exists (select 1 from public.customers where id = '00000000-0000-0000-0000-00000000c001') then
    raise exception 'Demo data is already loaded. Remove it first: npm run demo:remove';
  end if;
end $$;
create or replace function pg_temp.at(days_ago int, h int default 10, mi int default 0) returns timestamptz
language sql stable as $$
  select (date_trunc('day', now() at time zone 'America/Toronto') - make_interval(days => days_ago)
          + make_interval(hours => h, mins => mi)) at time zone 'America/Toronto'
$$;

create or replace function pg_temp.ono(t timestamptz, n int) returns text
language sql stable as $$
  select to_char(t at time zone 'America/Toronto', 'YYMMDD') || '-' || lpad(n::text, 2, '0')
$$;


insert into public.staff (id, shop_id, email, name, roles, quick_switch, pin_hash, is_owner, created_at) values
  ('00000000-0000-0000-0000-00000000b003', :'shop', 'sam.tech@example.com', 'Sam Okonkwo', '{workshop}', '{}',
   extensions.crypt('1111', extensions.gen_salt('bf', 10)), false, pg_temp.at(400));

insert into public.customers (id, shop_id, name, phone, email, created_at) values
  ('00000000-0000-0000-0000-00000000c001', :'shop', 'Priya Sharma', '4165550142', 'priya.sharma@example.com', pg_temp.at(2400)),
  ('00000000-0000-0000-0000-00000000c002', :'shop', 'Marco Rossi', '2895550110', null, pg_temp.at(420, 11)),
  ('00000000-0000-0000-0000-00000000c003', :'shop', 'Daniel Okafor', '6475550198', 'd.okafor@example.com', pg_temp.at(1100)),
  ('00000000-0000-0000-0000-00000000c004', :'shop', 'Mei Lin Chen', '9055550177', null, pg_temp.at(540)),
  ('00000000-0000-0000-0000-00000000c005', :'shop', 'Aisha Rahman', '4375550163', 'aisha.rahman@example.com', pg_temp.at(0, 9, 18)),
  ('00000000-0000-0000-0000-00000000c006', :'shop', 'Tom Gallagher', '6135550124', 'tom.g@example.com', pg_temp.at(900)),
  ('00000000-0000-0000-0000-00000000c007', :'shop', 'Sophie Tremblay', '5145550191', null, pg_temp.at(83, 10, 40));

insert into public.vehicles (id, shop_id, plate, vin, year, make, model, engine, created_at) values
  ('00000000-0000-0000-0000-00000000d001', :'shop', 'CAAB214', '2HKRW2H85KH601234', 2019, 'Honda', 'CR-V', '1.5L turbo I4', pg_temp.at(1500)),
  ('00000000-0000-0000-0000-00000000d002', :'shop', 'BXRT552', '2HGFC2F59GH512345', 2016, 'Honda', 'Civic', '2.0L I4', pg_temp.at(2400)),
  ('00000000-0000-0000-0000-00000000d003', :'shop', 'DKPL870', '2T3W1RFV8MC123456', 2021, 'Toyota', 'RAV4', '2.5L I4', pg_temp.at(1100)),
  ('00000000-0000-0000-0000-00000000d004', :'shop', 'CJWN309', '1FTFW1EF4EFA12345', 2014, 'Ford', 'F-150', '5.0L V8', pg_temp.at(1000)),
  ('00000000-0000-0000-0000-00000000d005', :'shop', 'BNTR418', 'JM3KFBDM5K0612345', 2019, 'Mazda', 'CX-5', '2.5L I4', pg_temp.at(300)),
  ('00000000-0000-0000-0000-00000000d006', :'shop', 'BTRL562', '2T1BURHE5LJ123987', 2020, 'Toyota', 'Corolla', '1.8L I4', pg_temp.at(700)),
  ('00000000-0000-0000-0000-00000000d007', :'shop', 'BKMR735', 'KMHD84LF5HU345678', 2017, 'Hyundai', 'Elantra', '2.0L I4', pg_temp.at(250)),
  ('00000000-0000-0000-0000-00000000d008', :'shop', 'BRVN204', '5FNRL6H82NB012345', 2022, 'Honda', 'Odyssey', '3.5L V6', pg_temp.at(200)),
  ('00000000-0000-0000-0000-00000000d009', :'shop', 'BVLS221', '4S4BSANC5J3212345', 2018, 'Subaru', 'Outback', '2.5L H4', pg_temp.at(0, 9, 18)),
  ('00000000-0000-0000-0000-00000000d010', :'shop', 'CDTR667', '3GCUKREC5FG123456', 2015, 'Chevrolet', 'Silverado 1500', '5.3L V8', pg_temp.at(900)),
  ('00000000-0000-0000-0000-00000000d011', :'shop', 'CTSN915', '5XYP3DHC4PG123456', 2023, 'Kia', 'Sorento', '2.5L I4', pg_temp.at(83, 10, 40));

insert into public.vehicle_owners (shop_id, vehicle_id, customer_id, role, from_at, to_at, ended_reason, verified, source, created_by) values
  (:'shop', '00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-00000000c001', 'owner', pg_temp.at(1500), null, null, true, 'staff', :'owner'),
  (:'shop', '00000000-0000-0000-0000-00000000d002', '00000000-0000-0000-0000-00000000c001', 'owner', pg_temp.at(2400), pg_temp.at(420, 11), 'Sold / transferred', true, 'staff', :'owner'),
  (:'shop', '00000000-0000-0000-0000-00000000d002', '00000000-0000-0000-0000-00000000c002', 'owner', pg_temp.at(420, 11), null, null, true, 'staff', :'owner'),
  (:'shop', '00000000-0000-0000-0000-00000000d003', '00000000-0000-0000-0000-00000000c003', 'owner', pg_temp.at(1100), null, null, true, 'staff', :'owner'),
  (:'shop', '00000000-0000-0000-0000-00000000d003', '00000000-0000-0000-0000-00000000c004', 'co_owner', pg_temp.at(540), null, null, true, 'staff', :'owner'),
  (:'shop', '00000000-0000-0000-0000-00000000d004', '00000000-0000-0000-0000-00000000c003', 'owner', pg_temp.at(1000), null, null, true, 'staff', :'owner'),
  (:'shop', '00000000-0000-0000-0000-00000000d005', '00000000-0000-0000-0000-00000000c004', 'owner', pg_temp.at(300), null, null, true, 'staff', :'owner'),
  (:'shop', '00000000-0000-0000-0000-00000000d006', '00000000-0000-0000-0000-00000000c001', 'owner', pg_temp.at(700), null, null, true, 'staff', :'owner'),
  (:'shop', '00000000-0000-0000-0000-00000000d007', '00000000-0000-0000-0000-00000000c002', 'owner', pg_temp.at(250), null, null, true, 'staff', :'owner'),
  (:'shop', '00000000-0000-0000-0000-00000000d008', '00000000-0000-0000-0000-00000000c003', 'owner', pg_temp.at(200), null, null, true, 'staff', :'owner'),
  (:'shop', '00000000-0000-0000-0000-00000000d009', '00000000-0000-0000-0000-00000000c005', 'owner', pg_temp.at(0, 9, 18), null, null, false, 'kiosk', null),
  (:'shop', '00000000-0000-0000-0000-00000000d010', '00000000-0000-0000-0000-00000000c006', 'owner', pg_temp.at(900), null, null, true, 'staff', :'owner'),
  (:'shop', '00000000-0000-0000-0000-00000000d011', '00000000-0000-0000-0000-00000000c007', 'owner', pg_temp.at(83, 10, 40), null, null, true, 'staff', :'owner');

-- Work orders. Columns: id, vehicle, customer, created, status, odometer, order seq, lifecycle times, people.
create temp table seed_wo (
  id uuid, vehicle uuid, customer uuid, created timestamptz, status public.job_status, odo int, n int,
  accepted timestamptz, started timestamptz, completed timestamptz, picked timestamptz, cancelled timestamptz,
  received uuid, tech uuid, notes text, intake jsonb, urgency public.urgency_level
);

insert into seed_wo
select x.id::uuid, x.vehicle::uuid, x.customer::uuid, x.created, x.status::public.job_status, x.odo, x.n,
       case when x.status not in ('checked_in') and x.status <> 'cancelled' then x.created + interval '9 minutes' end,
       case when x.status in ('in_progress','waiting_parts','ready','picked_up') then x.created + interval '1 hour' end,
       case when x.status in ('ready','picked_up') then x.created + interval '5 hours' end,
       case when x.status = 'picked_up' then x.created + interval '7 hours' end,
       case when x.status = 'cancelled' then x.created + interval '2 hours' end,
       case when x.status not in ('checked_in','cancelled') then :'desk'::uuid end,
       case when x.status in ('in_progress','waiting_parts','ready','picked_up') then '00000000-0000-0000-0000-00000000b003'::uuid end,
       x.notes, x.intake, x.urgency::public.urgency_level
from (values
  ('00000000-0000-0000-0000-0000000e0012', '00000000-0000-0000-0000-00000000d008', '00000000-0000-0000-0000-00000000c003', pg_temp.at(61, 9, 30), 'picked_up', 38110, 1, 'Front tires at 4/32. Recommend replacing before winter.', null::jsonb, null),
  ('00000000-0000-0000-0000-0000000e0013', '00000000-0000-0000-0000-00000000d010', '00000000-0000-0000-0000-00000000c006', pg_temp.at(118, 8, 5), 'picked_up', 164220, 1, '', null, null),
  ('00000000-0000-0000-0000-0000000e0014', '00000000-0000-0000-0000-00000000d011', '00000000-0000-0000-0000-00000000c007', pg_temp.at(83, 10, 45), 'picked_up', 21740, 1, '', null, null),
  ('00000000-0000-0000-0000-0000000e0015', '00000000-0000-0000-0000-00000000d009', '00000000-0000-0000-0000-00000000c005', pg_temp.at(0, 9, 20), 'checked_in', 97615, 5, '',
   '{"transcript":"the car pulls to the right when I drive and the steering wheel shakes a bit around 100 kilometres an hour it started after I hit a pothole last week","summary":"Pulls to the right and the steering wheel shakes at about 100 km/h since hitting a pothole last week.","when_it_happens":"Highway speed, about 100 km/h","warning_lights":[],"urgency":"soon","safety_note":"","questions":["Is the shake felt in the seat or only the steering wheel?","Any noise when turning?"]}'::jsonb,
   'soon'),
  ('00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-00000000d002', '00000000-0000-0000-0000-00000000c001', pg_temp.at(940, 9, 15), 'picked_up', 98450, 1, '', null::jsonb, null),
  ('00000000-0000-0000-0000-0000000e0002', '00000000-0000-0000-0000-00000000d002', '00000000-0000-0000-0000-00000000c001', pg_temp.at(640, 8, 40), 'picked_up', 112300, 1, 'Rear pads at 5 mm. Recheck next visit.', null, null),
  ('00000000-0000-0000-0000-0000000e0003', '00000000-0000-0000-0000-00000000d002', '00000000-0000-0000-0000-00000000c002', pg_temp.at(52, 13, 5), 'picked_up', 121980, 1, '', null, null),
  ('00000000-0000-0000-0000-0000000e0004', '00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-00000000c001', pg_temp.at(352, 10, 20), 'picked_up', 41200, 1, '', null, null),
  ('00000000-0000-0000-0000-0000000e0005', '00000000-0000-0000-0000-00000000d003', '00000000-0000-0000-0000-00000000c004', pg_temp.at(176, 9, 50), 'picked_up', 30150, 1, '', null, null),
  ('00000000-0000-0000-0000-0000000e0006', '00000000-0000-0000-0000-00000000d003', '00000000-0000-0000-0000-00000000c003', pg_temp.at(1, 15, 40), 'waiting_parts', 44905, 1, 'Heat shield ordered from the dealer, arriving tomorrow morning.', null, 'soon'),
  ('00000000-0000-0000-0000-0000000e0007', '00000000-0000-0000-0000-00000000d006', '00000000-0000-0000-0000-00000000c001', pg_temp.at(0, 8, 12), 'in_progress', 52870, 1, '',
   '{"transcript":"so when I brake on the highway theres this grinding noise from the front like metal on metal its been about a week and getting worse and the battery light flickered once yesterday on the 407 then went off its around 53 thousand km","summary":"Front grinding when braking at highway speed for about a week, getting worse. Battery warning light flickered once yesterday, then went out.","when_it_happens":"Braking at highway speed","warning_lights":["Battery light (flickered once)"],"urgency":"unsafe","safety_note":"Possible metal-on-metal brake wear. Inspect front brakes before the vehicle is driven again.","questions":["Does the grinding happen at low speed too?","Did the battery light come on at start-up or while driving?"]}'::jsonb,
   'unsafe'),
  ('00000000-0000-0000-0000-0000000e0008', '00000000-0000-0000-0000-00000000d004', '00000000-0000-0000-0000-00000000c003', pg_temp.at(0, 8, 47), 'checked_in', 187330, 2, '', null, 'soon'),
  ('00000000-0000-0000-0000-0000000e0009', '00000000-0000-0000-0000-00000000d007', '00000000-0000-0000-0000-00000000c002', pg_temp.at(0, 8, 58), 'accepted', 88400, 3, '', null, 'routine'),
  ('00000000-0000-0000-0000-0000000e0010', '00000000-0000-0000-0000-00000000d005', '00000000-0000-0000-0000-00000000c004', pg_temp.at(0, 7, 40), 'ready', 61240, 4, 'Wiper blades replaced, washer fluid topped up.', null, 'routine'),
  ('00000000-0000-0000-0000-0000000e0011', '00000000-0000-0000-0000-00000000d004', '00000000-0000-0000-0000-00000000c003', pg_temp.at(30, 14, 10), 'cancelled', 185020, 1, 'Customer asked for a quote only.', null, null)
) as x(id, vehicle, customer, created, status, odo, n, notes, intake, urgency);

insert into public.work_orders (id, shop_id, order_no, vehicle_id, customer_id, status, reasons, odometer_km, received_by, tech_id,
  pickup_date, notes, signed_name, signed_at, source, intake, urgency, accepted_at, started_at, completed_at, picked_up_at,
  cancelled_at, created_at, updated_at, version)
select s.id, :'shop', pg_temp.ono(s.created, s.n), s.vehicle, s.customer, s.status, '{mechanical}', s.odo,
       s.received, s.tech, (s.picked at time zone 'America/Toronto')::date, s.notes, c.name, s.created, 'kiosk', s.intake, s.urgency,
       s.accepted, s.started, s.completed, s.picked, s.cancelled, s.created,
       greatest(s.created, s.accepted, s.started, s.completed, s.picked, s.cancelled), 1
from seed_wo s join public.customers c on c.id = s.customer;

insert into public.work_order_concerns (work_order_id, position, text, estimate) values
  ('00000000-0000-0000-0000-0000000e0012', 1, 'Oil change and inspection', 160),
  ('00000000-0000-0000-0000-0000000e0013', 1, 'Brakes feel soft, pedal goes low', 520),
  ('00000000-0000-0000-0000-0000000e0014', 1, 'First oil change, check tire pressure light', 120),
  ('00000000-0000-0000-0000-0000000e0015', 1, 'Pulls to the right, steering wheel shakes at highway speed', null),
  ('00000000-0000-0000-0000-0000000e0015', 2, 'Hit a pothole last week', null),
  ('00000000-0000-0000-0000-0000000e0001', 1, 'Oil change and swap to winter tires', 180),
  ('00000000-0000-0000-0000-0000000e0002', 1, 'Squealing from the front when braking', 450),
  ('00000000-0000-0000-0000-0000000e0003', 1, 'Check engine light came on', null),
  ('00000000-0000-0000-0000-0000000e0004', 1, 'Winter tire changeover', 110),
  ('00000000-0000-0000-0000-0000000e0005', 1, 'A/C not blowing cold', 220),
  ('00000000-0000-0000-0000-0000000e0006', 1, 'Rattle under the car at idle', 190),
  ('00000000-0000-0000-0000-0000000e0007', 1, 'Grinding noise from the front wheels when braking', 420),
  ('00000000-0000-0000-0000-0000000e0007', 2, 'Battery light flickered once on the highway', null),
  ('00000000-0000-0000-0000-0000000e0008', 1, 'Check engine light on, rough idle when cold', null),
  ('00000000-0000-0000-0000-0000000e0009', 1, 'Oil change and tire rotation', 140),
  ('00000000-0000-0000-0000-0000000e0010', 1, 'Wipers streaking, replace blades', 60),
  ('00000000-0000-0000-0000-0000000e0011', 1, 'Quote for rear brakes', 380);

insert into public.work_order_items (work_order_id, position, type, description, qty, unit_price) values
  ('00000000-0000-0000-0000-0000000e0012', 1, 'part', 'Full synthetic oil 0W-20, 5.7 L', 1, 64.99),
  ('00000000-0000-0000-0000-0000000e0012', 2, 'part', 'Oil filter', 1, 13.49),
  ('00000000-0000-0000-0000-0000000e0012', 3, 'labour', 'Oil change and multi-point inspection', 0.6, 140),
  ('00000000-0000-0000-0000-0000000e0013', 1, 'labour', 'Brake system inspection', 0.5, 140),
  ('00000000-0000-0000-0000-0000000e0013', 2, 'part', 'Brake master cylinder', 1, 189.0),
  ('00000000-0000-0000-0000-0000000e0013', 3, 'part', 'DOT 3 brake fluid, 1 L', 2, 14.5),
  ('00000000-0000-0000-0000-0000000e0013', 4, 'labour', 'Replace master cylinder, bleed brakes', 1.8, 140),
  ('00000000-0000-0000-0000-0000000e0014', 1, 'part', 'Full synthetic oil 0W-20, 4.8 L', 1, 58.99),
  ('00000000-0000-0000-0000-0000000e0014', 2, 'part', 'Oil filter', 1, 12.49),
  ('00000000-0000-0000-0000-0000000e0014', 3, 'labour', 'Oil change, TPMS sensor relearn', 0.7, 140),
  ('00000000-0000-0000-0000-0000000e0001', 1, 'part', 'Full synthetic oil 0W-20, 4.4 L', 1, 54.99),
  ('00000000-0000-0000-0000-0000000e0001', 2, 'part', 'Oil filter', 1, 12.49),
  ('00000000-0000-0000-0000-0000000e0001', 3, 'labour', 'Oil and filter change', 0.5, 140),
  ('00000000-0000-0000-0000-0000000e0001', 4, 'labour', 'Seasonal tire changeover, balance', 0.75, 140),
  ('00000000-0000-0000-0000-0000000e0002', 1, 'part', 'Front ceramic brake pads', 1, 89.95),
  ('00000000-0000-0000-0000-0000000e0002', 2, 'part', 'Front brake rotors', 2, 74.5),
  ('00000000-0000-0000-0000-0000000e0002', 3, 'labour', 'Replace front pads and rotors', 1.5, 140),
  ('00000000-0000-0000-0000-0000000e0003', 1, 'labour', 'Diagnostic scan, code P0141', 1, 140),
  ('00000000-0000-0000-0000-0000000e0003', 2, 'part', 'Downstream O2 sensor', 1, 118.4),
  ('00000000-0000-0000-0000-0000000e0003', 3, 'labour', 'Replace O2 sensor', 0.6, 140),
  ('00000000-0000-0000-0000-0000000e0004', 1, 'labour', 'Seasonal tire changeover, balance', 0.75, 140),
  ('00000000-0000-0000-0000-0000000e0005', 1, 'labour', 'A/C leak test and recharge', 1, 140),
  ('00000000-0000-0000-0000-0000000e0005', 2, 'part', 'R-1234yf refrigerant, 450 g', 1, 96),
  ('00000000-0000-0000-0000-0000000e0006', 1, 'labour', 'Inspect exhaust, heat shield loose', 0.5, 140),
  ('00000000-0000-0000-0000-0000000e0006', 2, 'part', 'Exhaust heat shield (on order)', 1, 64),
  ('00000000-0000-0000-0000-0000000e0007', 1, 'part', 'Front ceramic brake pads', 1, 96.5),
  ('00000000-0000-0000-0000-0000000e0007', 2, 'labour', 'Replace front pads, clean slides', 1.2, 140),
  ('00000000-0000-0000-0000-0000000e0010', 1, 'part', 'Wiper blades, pair', 1, 42.99),
  ('00000000-0000-0000-0000-0000000e0010', 2, 'labour', 'Replace wiper blades', 0.2, 140);

-- Audit trail derived from the lifecycle timestamps.
insert into public.work_order_events (work_order_id, shop_id, at, staff_id, kind, from_status, to_status, message)
select w.id, w.shop_id, e.at, e.staff_id, e.kind, e.from_status::public.job_status, e.to_status::public.job_status, e.message
from public.work_orders w
cross join lateral (values
  (w.created_at, :'desk'::uuid, 'kiosk_check_in', null, 'checked_in', 'Checked in at the kiosk by ' || w.signed_name),
  (w.accepted_at, :'desk'::uuid, 'status_change', 'checked_in', 'accepted', 'Keys received by ' || :'desk_name' || '. Job added to the workshop queue'),
  (w.started_at, '00000000-0000-0000-0000-00000000b003'::uuid, 'status_change', 'accepted', 'in_progress', 'Job taken up by Sam Okonkwo'),
  (case when w.status = 'waiting_parts' then w.started_at + interval '2 hours' end, '00000000-0000-0000-0000-00000000b003'::uuid, 'status_change', 'in_progress', 'waiting_parts', 'Waiting on parts. Set by Sam Okonkwo'),
  (w.completed_at, '00000000-0000-0000-0000-00000000b003'::uuid, 'status_change', 'in_progress', 'ready', 'Work completed by Sam Okonkwo. Ready for pickup'),
  (w.picked_up_at, :'desk'::uuid, 'status_change', 'ready', 'picked_up', 'Picked up. Vehicle released by ' || :'desk_name'),
  (w.cancelled_at, :'owner'::uuid, 'status_change', 'checked_in', 'cancelled', 'Cancelled by ' || :'owner_name' || '. Reason: Customer declined the estimate')
) as e(at, staff_id, kind, from_status, to_status, message)
where e.at is not null and w.id in (select id from seed_wo);

-- Keep order numbers sequential for the seeded days.
insert into public.order_counters (shop_id, day, last)
select shop_id, to_date(left(order_no, 6), 'YYMMDD'), max(split_part(order_no, '-', 2)::int)
from public.work_orders where id in (select id from seed_wo) group by shop_id, left(order_no, 6)
on conflict (shop_id, day) do update set last = greatest(public.order_counters.last, excluded.last);

update public.work_orders set cancel_reason = 'Customer declined the estimate' where status = 'cancelled' and id in (select id from seed_wo);

-- Today's sample times are fixed clock times; cap them at now so nothing is in the future when the seed runs in the
-- morning. Events capped to the same instant keep their order by id (inserted in lifecycle order).
update public.work_orders set
  signed_at = least(signed_at, now()), accepted_at = least(accepted_at, now()), started_at = least(started_at, now()),
  completed_at = least(completed_at, now()), picked_up_at = least(picked_up_at, now()),
  cancelled_at = least(cancelled_at, now()), created_at = least(created_at, now()), updated_at = least(updated_at, now())
where id in (select id from seed_wo);
update public.work_order_events set at = least(at, now()) where work_order_id in (select id from seed_wo);

drop table seed_wo;

commit;
