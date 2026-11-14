-- Removes what demo-data.sql added, plus anything created during a demo on the demo customers, vehicles or technician.
-- Run: npm run demo:remove
\set ON_ERROR_STOP on
begin;

create temp table demo_customers as
  select id from public.customers where id::text like '00000000-0000-0000-0000-00000000c0%';
create temp table demo_vehicles as
  select id from public.vehicles where id::text like '00000000-0000-0000-0000-00000000d0%';
create temp table demo_jobs as
  select id from public.work_orders
  where id::text like '00000000-0000-0000-0000-0000000e%'
     or customer_id in (select id from demo_customers) or vehicle_id in (select id from demo_vehicles);

delete from public.work_order_events where work_order_id in (select id from demo_jobs);
delete from public.work_orders where id in (select id from demo_jobs); -- concerns and items cascade
delete from public.vehicle_owners
  where customer_id in (select id from demo_customers) or vehicle_id in (select id from demo_vehicles);
delete from public.customers where id in (select id from demo_customers);
delete from public.vehicles where id in (select id from demo_vehicles);

-- Demo technician: detach from real jobs and events, drop sessions and PIN attempts, then delete.
update public.work_orders set tech_id = null where tech_id = '00000000-0000-0000-0000-00000000b003';
update public.work_orders set received_by = null where received_by = '00000000-0000-0000-0000-00000000b003';
update public.work_order_events set staff_id = null where staff_id = '00000000-0000-0000-0000-00000000b003';
update public.vehicle_owners set created_by = null where created_by = '00000000-0000-0000-0000-00000000b003';
update public.sms_messages set sent_by = null where sent_by = '00000000-0000-0000-0000-00000000b003';
delete from public.device_sessions where staff_id = '00000000-0000-0000-0000-00000000b003';
delete from public.pin_attempts where staff_id = '00000000-0000-0000-0000-00000000b003';
delete from public.staff where id = '00000000-0000-0000-0000-00000000b003';

select (select count(*) from demo_jobs) as jobs_removed, (select count(*) from demo_customers) as customers_removed,
       (select count(*) from demo_vehicles) as vehicles_removed;
commit;
