\set helpers_included 1
begin;
\ir _helpers.sql
select plan(30);

-- A second shop to prove isolation.
insert into public.shops (id, name) values ('00000000-0000-0000-0000-00000000a002', 'Other Shop');
insert into public.staff (id, shop_id, email, name, roles, pin_hash) values
  ('00000000-0000-0000-0000-00000000b099', '00000000-0000-0000-0000-00000000a002', 'other@example.com', 'Other Admin',
   '{admin,frontdesk,kiosk,display}', extensions.crypt('9999', extensions.gen_salt('bf', 4)));
insert into public.customers (shop_id, name, phone) values ('00000000-0000-0000-0000-00000000a002', 'Zed Zulu', '4165559999');

-- RLS enabled everywhere
select ok(bool_and(c.relrowsecurity), 'RLS enabled on every business table')
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
  and c.relname in ('shops','staff','device_sessions','customers','vehicles','vehicle_owners','work_orders',
                    'work_order_concerns','work_order_items','work_order_events','order_counters','pin_attempts');

-- No write grants for clients
select ok(not has_table_privilege('authenticated', 'public.work_orders', 'INSERT'), 'authenticated cannot insert work_orders');
select ok(not has_table_privilege('authenticated', 'public.customers', 'UPDATE'), 'authenticated cannot update customers');
select ok(not has_table_privilege('authenticated', 'public.work_order_events', 'DELETE'), 'authenticated cannot delete events');
select ok(not has_table_privilege('anon', 'public.customers', 'SELECT'), 'anon cannot select customers');
select ok(not has_column_privilege('authenticated', 'public.staff', 'pin_hash', 'SELECT'), 'pin_hash not selectable');
select ok(not has_column_privilege('authenticated', 'public.staff', 'cognito_sub', 'SELECT'), 'cognito_sub not selectable');
select ok(not has_table_privilege('anon', 'public.v_display_board', 'SELECT'), 'anon cannot read display board');

-- Kiosk-only account: create one (kiosk + display, like the recommended "Reception kiosk")
insert into public.staff (shop_id, email, name, roles, pin_hash) values
  ('00000000-0000-0000-0000-00000000a001', 'kiosk@example.com', 'Reception kiosk', '{kiosk,display}', extensions.crypt('5555', extensions.gen_salt('bf', 4)));

select tests.as_staff('kiosk@example.com');
select is((select count(*) from public.customers), 0::bigint, 'kiosk cannot select customers');
select is((select count(*) from public.vehicles), 0::bigint, 'kiosk cannot select vehicles');
select is((select count(*) from public.work_orders), 0::bigint, 'kiosk cannot select work_orders');
select is((select count(*) from public.vehicle_owners), 0::bigint, 'kiosk cannot select vehicle_owners');
select is((select count(*) from public.work_order_events), 0::bigint, 'kiosk cannot select events');
select is((select count(*) from public.staff), 1::bigint, 'kiosk sees only own staff row');
select ok((select count(*) from public.v_display_board) > 0, 'display role reads v_display_board');
select is((select count(*) from public.v_job_durations), 0::bigint, 'display cannot read v_job_durations');
select is((select count(*) from public.v_display_board where masked_name !~ '^\S+( \S\.)?$'), 0::bigint, 'board names are masked');
select tests.reset();

select tests.as_staff('ana.desk@example.com');
select is((select count(*) from public.customers), 4::bigint, 'front desk sees own shop customers only');
select is((select count(*) from public.work_orders), 11::bigint, 'front desk sees own shop work orders');
select is((select count(*) from public.staff), 1::bigint, 'non-admin sees only own staff row');
select is((select count(*) from public.shops), 1::bigint, 'sees only own shop');
select ok((select count(*) from public.v_display_board) = 5, 'front desk reads board (5 active jobs)');
select tests.reset();

select tests.as_staff('owner@example.com');
select is((select count(*) from public.staff), 3::bigint + 1, 'admin sees all staff of own shop');
select ok((select count(*) from public.v_job_durations) > 0, 'admin reads v_job_durations');
select is((select count(*) from public.customers where name = 'Zed Zulu'), 0::bigint, 'shop A admin cannot see shop B customers');
select tests.reset();

select tests.as_staff('other@example.com');
select is((select count(*) from public.customers), 1::bigint, 'shop B sees only its customer');
select is((select count(*) from public.v_display_board), 0::bigint, 'shop B board is empty');
select tests.reset();

-- Revoked roles take effect immediately (looked up from the table, not the claim)
select tests.as_staff('ana.desk@example.com');
select tests.reset();
update public.staff set roles = '{kiosk}' where email = 'ana.desk@example.com';
select set_config('request.jwt.claims', json_build_object('role','authenticated','staff_id','00000000-0000-0000-0000-00000000b002',
  'shop_id','00000000-0000-0000-0000-00000000a001','app_roles','frontdesk kiosk display')::text, true);
select set_config('role', 'authenticated', true);
select is((select count(*) from public.customers), 0::bigint, 'role removed from staff row: no access despite claim');
select tests.reset();

-- Inactive staff: has_any_role false
update public.staff set active = false, roles = '{frontdesk}' where email = 'ana.desk@example.com';
select tests.as_staff('ana.desk@example.com');
select is((select count(*) from public.customers), 0::bigint, 'inactive staff sees nothing');
select tests.reset();

select is(app.mask_name('Mei Lin Chen'), 'Mei C.', 'mask_name uses last initial');

select * from finish();
rollback;
