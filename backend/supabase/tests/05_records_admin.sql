\set helpers_included 1
begin;
\ir _helpers.sql
select no_plan();

select tests.as_staff('ana.desk@example.com');
select tests.session('frontdesk') as fd \gset
select tests.reset();
select tests.as_staff('owner@example.com');
select tests.session('admin') as adm \gset
select tests.session('frontdesk') as own_fd \gset
select tests.reset();
select tests.as_staff('sam.tech@example.com');
select tests.session('workshop') as ws \gset
select tests.reset();

-- ---------------------------------------------------------------- search / lists / drawers
select tests.as_staff('ana.desk@example.com');
select is(jsonb_array_length(public.search_all('priya')->'customers'), 1, 'search by name');
select is(jsonb_array_length(public.search_all('0198')->'customers'), 1, 'search by phone digits');
select is(public.search_all('bxrt 552')->'vehicles'->0->>'plate', 'BXRT552', 'search by plate');
select is(public.search_all('KH601234')->'vehicles'->0->>'plate', 'CAAB214', 'search by VIN');
select ok(jsonb_array_length(public.search_all('grinding')->'jobs') >= 1, 'search by concern text');
select is(jsonb_array_length(public.search_all('x')->'customers'), 0, 'short query returns nothing');
select is(public.search_all('dkpl870')->'vehicles'->0->'current_owners', '["Daniel Okafor", "Mei Lin Chen"]'::jsonb, 'vehicle current owners');

select is(jsonb_array_length(public.list_customers()), 4, 'list_customers');
select is((select x->'plates' from jsonb_array_elements(public.list_customers()) x where x->>'name' = 'Daniel Okafor'), '["DKPL870", "CJWN309"]'::jsonb, 'customer plates');
select is(jsonb_array_length(public.list_vehicles()), 4, 'list_vehicles');
select is((select (x->>'owners_on_record')::int from jsonb_array_elements(public.list_vehicles()) x where x->>'plate' = 'BXRT552'), 2, 'owners on record');

select is(jsonb_array_length(public.get_customer('00000000-0000-0000-0000-00000000c001')->'vehicles'), 1, 'get_customer: current vehicles');
select is(public.get_customer('00000000-0000-0000-0000-00000000c001')->'previous_vehicles'->0->>'plate', 'BXRT552', 'get_customer: previous vehicles');
select is((public.get_customer('00000000-0000-0000-0000-00000000c001')->>'visit_count')::int, 4, 'get_customer: visits');
select ok((public.get_customer('00000000-0000-0000-0000-00000000c001')->>'lifetime_total')::numeric > 0, 'get_customer: lifetime total');

select is(public.get_vehicle('00000000-0000-0000-0000-00000000d002')->'previous_owners'->0->>'ended_reason', 'Sold / transferred', 'get_vehicle: previous owner');
select is((select count(*) from jsonb_array_elements(public.get_vehicle('00000000-0000-0000-0000-00000000d002')->'history') h
           where h->>'customer_name' = 'Priya Sharma' and (h->>'customer_was_owner_then')::boolean
             and not (h->>'customer_is_current_owner')::boolean), 2::bigint, 'history: previous owner visits flagged');
select is((public.get_vehicle('00000000-0000-0000-0000-00000000d001')->>'last_odometer_km')::int, 52870, 'get_vehicle: last odometer');
select tests.reset();

select tests.as_staff('sam.tech@example.com');
select is(tests.err($$select public.search_all('priya')$$), 'ROLE_NOT_ALLOWED', 'workshop cannot search_all');
select is(tests.err($$select public.list_staff()$$), 'ROLE_NOT_ALLOWED', 'workshop cannot list staff');
select is(tests.err(format($$select public.update_customer(%L, '00000000-0000-0000-0000-00000000c001', '{"name":"X"}')$$, :'ws')), 'ROLE_NOT_ALLOWED', 'workshop cannot update customers');
select tests.reset();

-- ---------------------------------------------------------------- updates
select tests.as_staff('ana.desk@example.com');
select is(public.update_customer(:'fd', '00000000-0000-0000-0000-00000000c004', '{"phone":"905-555-0178","email":"MEI@example.com"}')->'customer'->>'email',
          'mei@example.com', 'update_customer');
select tests.reset();
insert into public.customers (shop_id, name, phone) values ('00000000-0000-0000-0000-00000000a001', 'Priya Sharma', '6475550000');
select tests.as_staff('ana.desk@example.com');
select is(tests.err(format($$select public.update_customer(%L, (select id from public.customers where phone = '6475550000'), '{"phone":"4165550142"}')$$, :'fd')),
          'PHONE_TAKEN', 'same phone and same name -> PHONE_TAKEN');
select is(tests.err(format($$select public.update_vehicle(%L, '00000000-0000-0000-0000-00000000d001', '{"plate":"bxrt 552"}')$$, :'fd')), 'PLATE_TAKEN', 'PLATE_TAKEN');
select is(public.update_vehicle(:'fd', '00000000-0000-0000-0000-00000000d001', '{"engine":"1.5L","year":2020}')->'vehicle'->>'year', '2020', 'update_vehicle');

-- owners
select public.owner_add(:'fd', '00000000-0000-0000-0000-00000000d004', '2895550110', '', 'co_owner') as v \gset
select ok((:'v'::jsonb)->'current_owners' @> '[{"name":"Marco Rossi","role":"co_owner","verified":true}]', 'owner_add co_owner by phone (verified)');
select public.owner_add(:'fd', '00000000-0000-0000-0000-00000000d004', '4165550777', 'Nina Brand', 'transfer') as v \gset
select is(jsonb_array_length((:'v'::jsonb)->'current_owners'), 1, 'owner_add transfer leaves one owner');
select is((:'v'::jsonb)->'current_owners'->0->>'name', 'Nina Brand', 'new customer created');
select is(jsonb_array_length((:'v'::jsonb)->'previous_owners'), 2, 'previous owners kept');
select ((:'v'::jsonb)->'current_owners'->0->>'id') as own_id \gset
select is(jsonb_array_length(public.owner_end(:'fd', :'own_id')->'current_owners'), 0, 'owner_end');
select is(tests.err(format('select public.owner_end(%L, %L)', :'fd', :'own_id')), 'NOT_CURRENT_OWNER', 'owner_end twice');
select tests.reset();
update public.vehicle_owners set verified = false where vehicle_id = '00000000-0000-0000-0000-00000000d003' and customer_id = '00000000-0000-0000-0000-00000000c004';
select tests.as_staff('ana.desk@example.com');
select ok((select (x->>'owner_unverified')::boolean from jsonb_array_elements(public.list_jobs('active')) x where x->>'plate' = 'DKPL870' limit 1), 'owner_unverified flag on jobs');
select ok(public.owner_verify(:'fd', (select id from public.vehicle_owners where vehicle_id = '00000000-0000-0000-0000-00000000d003' and customer_id = '00000000-0000-0000-0000-00000000c004'))
          ->'current_owners' @> '[{"name":"Mei Lin Chen","verified":true}]', 'owner_verify');
select tests.reset();

-- ---------------------------------------------------------------- admin
select tests.as_staff('owner@example.com');
select is(jsonb_array_length(public.list_staff()), 3, 'list_staff');
select ok(public.list_staff()::text !~ 'pin_hash', 'list_staff never returns pin_hash');
select is(tests.err(format($$select public.staff_upsert(%L, '{"name":"New","email":"new@example.com","roles":["workshop"],"quick_switch":[]}')$$, :'adm')), 'VALIDATION', 'new staff need a PIN');
select is(tests.err(format($$select public.staff_upsert(%L, '{"name":"New","email":"new@example.com","roles":[],"pin":"1234"}')$$, :'adm')), 'VALIDATION', 'at least one role');
select is(tests.err(format($$select public.staff_upsert(%L, '{"name":"New","email":"new@example.com","roles":["workshop"],"quick_switch":["admin"],"pin":"1234"}')$$, :'adm')), 'VALIDATION', 'quick_switch subset of roles');
select is(tests.err(format($$select public.staff_upsert(%L, '{"name":"Dup","email":"ANA.DESK@example.com","roles":["workshop"],"pin":"1234"}')$$, :'adm')), 'EMAIL_TAKEN', 'email unique');
select public.staff_upsert(:'adm', '{"name":"Jo Tech","email":"Jo.Tech@Example.com","roles":["workshop","frontdesk"],"quick_switch":["workshop","frontdesk"],"pin":"3333"}') as jo \gset
select is((:'jo'::jsonb)->>'email', 'jo.tech@example.com', 'staff_upsert creates staff (email lower-cased)');
select ok(not ((:'jo'::jsonb) ? 'pin_hash'), 'staff_upsert returns no pin');
select is(public.staff_upsert(:'adm', jsonb_build_object('id', (:'jo'::jsonb)->>'id', 'name', 'Jo Tech', 'email', 'jo.tech@example.com',
          'roles', '["workshop"]'::jsonb, 'quick_switch', '[]'::jsonb, 'active', false))->>'active', 'false', 'staff_upsert updates (deactivate)');
select is(tests.err(format($$select public.staff_upsert(%L, '{"id":"00000000-0000-0000-0000-00000000b001","name":"Owner","email":"owner@example.com","roles":["frontdesk"],"active":true}')$$, :'adm')),
          'LAST_ADMIN', 'cannot remove admin from last admin');
select is(tests.err(format($$select public.staff_upsert(%L, '{"id":"00000000-0000-0000-0000-00000000b001","name":"Owner","email":"owner@example.com","roles":["admin"],"active":false}')$$, :'adm')),
          'SELF_DEACTIVATE', 'cannot deactivate yourself');
select is(tests.err(format($$select public.staff_upsert(%L, '{"name":"X","email":"x@example.com","roles":["workshop"],"pin":"1234"}')$$, :'own_fd')), 'ROLE_NOT_ALLOWED', 'staff_upsert needs admin session');

select is(public.update_shop(:'adm', '{"name":"Demo Auto","hst_rate":0.15,"labour_rate":150}')->>'hst_rate', '0.1500', 'update_shop');
select is(tests.err(format($$select public.update_shop(%L, '{"hst_rate":0.5}')$$, :'adm')), 'VALIDATION', 'hst_rate <= 0.2');
select is(tests.err(format($$select public.update_shop(%L, '{"labour_rate":5000}')$$, :'adm')), 'VALIDATION', 'labour_rate <= 1000');
select tests.reset();

-- deactivated staff: blocked immediately
select tests.as_staff('ana.desk@example.com');
select tests.reset();
update public.staff set active = false where email = 'ana.desk@example.com';
select tests.as_staff('ana.desk@example.com');
select is(tests.err('select public.me()'), 'NOT_STAFF', 'deactivated staff -> NOT_STAFF');
select is(tests.err(format($$select public.job_transition(%L, '00000000-0000-0000-0000-0000000e0008', 'accepted', 1)$$, :'fd')), 'NOT_STAFF', 'deactivated staff cannot write');
select tests.reset();

-- ---------------------------------------------------------------- order numbers across the UTC date boundary
insert into public.shops (id, name, timezone) values
  ('00000000-0000-0000-0000-00000000a0e1', 'East', 'Etc/GMT-14'),   -- UTC+14
  ('00000000-0000-0000-0000-00000000a0e2', 'West', 'Etc/GMT+12');   -- UTC-12
-- a counter row for the UTC date must not affect a shop whose local date differs
-- (at any hour, at least one of the two shops is on a different date than UTC)
insert into public.order_counters
select id, (now() at time zone 'UTC')::date, 41 from public.shops
where id in ('00000000-0000-0000-0000-00000000a0e1', '00000000-0000-0000-0000-00000000a0e2')
  and (now() at time zone timezone)::date <> (now() at time zone 'UTC')::date;
select ok((select count(*) from public.order_counters where last = 41) >= 1, 'a UTC-dated counter exists for a shop on another local date');
select is(app.next_order_no('00000000-0000-0000-0000-00000000a0e1'),
          to_char(now() at time zone 'Etc/GMT-14', 'YYMMDD') || '-01', 'UTC+14 shop: local date, starts at 01');
select is(app.next_order_no('00000000-0000-0000-0000-00000000a0e1'),
          to_char(now() at time zone 'Etc/GMT-14', 'YYMMDD') || '-02', 'sequential per local day');
select is(app.next_order_no('00000000-0000-0000-0000-00000000a0e2'),
          to_char(now() at time zone 'Etc/GMT+12', 'YYMMDD') || '-01', 'UTC-12 shop: own local date and counter');
select isnt(to_char(now() at time zone 'Etc/GMT-14', 'YYMMDD'), to_char(now() at time zone 'Etc/GMT+12', 'YYMMDD'), 'the two shops are on different local dates');
update public.order_counters set last = 99 where shop_id = '00000000-0000-0000-0000-00000000a0e2';
select is(split_part(app.next_order_no('00000000-0000-0000-0000-00000000a0e2'), '-', 2), '100', 'three digits after 99');

-- ---------------------------------------------------------------- realtime and storage
select ok(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'work_orders'), 'work_orders in realtime publication');
select ok(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'work_order_events'), 'events in realtime publication');
select ok(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'vehicle_owners'), 'owners in realtime publication');
select has_trigger('public', 'work_orders', 'notify_board_change', 'board broadcast trigger');
select ok(exists (select 1 from pg_policies where schemaname = 'realtime' and tablename = 'messages'), 'realtime.messages policy');
select is((select public::text || file_size_limit::text from storage.buckets where id = 'signatures'), 'false204800', 'private signatures bucket, 200 KB');
select is((select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'signatures%'), 2::bigint, 'signature policies');

-- board broadcast is sent on change
select tests.as_staff('ana.desk@example.com');
select tests.reset();
update public.staff set active = true where email = 'ana.desk@example.com';
select tests.as_staff('ana.desk@example.com');
select public.job_transition(:'fd', '00000000-0000-0000-0000-0000000e0008', 'accepted', 1);
select tests.reset();
select ok(exists (select 1 from realtime.messages where topic = 'shop:00000000-0000-0000-0000-00000000a001' and event = 'board_changed' and private),
          'board_changed broadcast on private shop topic');

-- realtime authorization: own shop topic visible, other shop not
select tests.as_staff('ana.desk@example.com');
select set_config('realtime.topic', 'shop:00000000-0000-0000-0000-00000000a001', true);
select ok((select count(*) from realtime.messages where extension = 'broadcast') > 0, 'can read own shop topic');
select set_config('realtime.topic', 'shop:00000000-0000-0000-0000-00000000a0e1', true);
select is((select count(*) from realtime.messages where topic = 'shop:00000000-0000-0000-0000-00000000a0e1'), 0::bigint, 'cannot read another shop topic');
select tests.reset();

-- storage policies
select tests.as_staff('ana.desk@example.com');
select lives_ok($$insert into storage.objects (bucket_id, name, owner_id) values ('signatures', '00000000-0000-0000-0000-00000000a001/2026/11/0b4f8c2e-6a1d-4c3e-9f7a-1234567890ab.png', 'x')$$,
                'front desk can upload a signature to own shop folder');
select throws_ok($$insert into storage.objects (bucket_id, name, owner_id) values ('signatures', '00000000-0000-0000-0000-00000000a0e1/2026/11/0b4f8c2e-6a1d-4c3e-9f7a-1234567890ab.png', 'x')$$,
                 '42501', null, 'cannot upload to another shop folder');
select tests.reset();
select tests.as_staff('sam.tech@example.com');
select throws_ok($$insert into storage.objects (bucket_id, name, owner_id) values ('signatures', '00000000-0000-0000-0000-00000000a001/2026/11/1b4f8c2e-6a1d-4c3e-9f7a-1234567890ab.png', 'x')$$,
                 '42501', null, 'workshop cannot upload signatures');
select is((select count(*) from storage.objects where bucket_id = 'signatures'), 1::bigint, 'workshop can read signatures');
select tests.reset();
insert into public.staff (shop_id, email, name, roles) values ('00000000-0000-0000-0000-00000000a001', 'kiosk@example.com', 'Reception kiosk', '{kiosk,display}');
select tests.as_staff('kiosk@example.com');
select is((select count(*) from storage.objects where bucket_id = 'signatures'), 0::bigint, 'kiosk cannot read signatures');
select tests.reset();

select * from finish();
rollback;
