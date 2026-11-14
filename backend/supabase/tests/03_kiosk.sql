\set helpers_included 1
begin;
\ir _helpers.sql
select no_plan();

-- Two family members sharing a phone, for the "customers" match.
insert into public.customers (id, shop_id, name, phone) values
  ('00000000-0000-0000-0000-00000000c010', '00000000-0000-0000-0000-00000000a001', 'Ravi Patel', '4165550300'),
  ('00000000-0000-0000-0000-00000000c011', '00000000-0000-0000-0000-00000000a001', 'Asha Patel', '4165550300');

select tests.as_staff('ana.desk@example.com');
select tests.session('kiosk') as k \gset
select tests.session('frontdesk') as fd \gset

-- Role check
select is(tests.err(format($$select public.kiosk_lookup(%L, '4165550142')$$, :'fd')), 'ROLE_NOT_ALLOWED', 'kiosk_lookup needs kiosk session');

-- Phone: exact, formatted, with leading 1, suffix
select is(public.kiosk_lookup(:'k', '416 555 0142')->>'match', 'customer', 'phone exact -> customer');
select is(public.kiosk_lookup(:'k', '1-416-555-0142')->'customer'->>'first_name', 'Priya', 'leading 1 stripped; first name only');
select is(public.kiosk_lookup(:'k', '5550142')->>'match', 'customer', 'phone suffix (7 digits) -> customer');
select is(public.kiosk_lookup(:'k', '4165550142')->'customer'->>'phone_last4', '0142', 'phone_last4');
select is(jsonb_array_length(public.kiosk_lookup(:'k', '4165550142')->'vehicles'), 1, 'Priya: one current vehicle (Civic was sold)');
select is(public.kiosk_lookup(:'k', '4165550142')->'vehicles'->0->>'plate', 'CAAB214', 'vehicle plate');
select is((public.kiosk_lookup(:'k', '4165550142')->'vehicles'->0->>'last_odometer_km')::int, 52870, 'last odometer');
select ok(public.kiosk_lookup(:'k', '4165550142')->'vehicles'->0 ? 'last_visit_at', 'last_visit_at present');
-- privacy
select ok(public.kiosk_lookup(:'k', '4165550142')::text !~ '(Sharma|priya\.sharma|4165550142)', 'customer match has no full name/email/phone');
select is(public.kiosk_lookup(:'k', '4165550300')->>'match', 'customers', 'shared phone -> customers');
select is(jsonb_array_length(public.kiosk_lookup(:'k', '4165550300')->'customers'), 2, 'two customers');
select ok(public.kiosk_lookup(:'k', '4165550300')::text !~ '(Ravi Patel|Asha Patel|4165550300)', 'customers match is masked');
select is(public.kiosk_lookup(:'k', '4165550300')->'customers'->0->>'masked_name', 'Ravi P.', 'masked name');

-- Plate
select is(public.kiosk_lookup(:'k', 'dkpl 870')->>'match', 'vehicle', 'plate (lowercase, space) -> vehicle');
select is(jsonb_array_length(public.kiosk_lookup(:'k', 'DKPL870')->'owners'), 2, 'shared vehicle has 2 owners');
select ok(public.kiosk_lookup(:'k', 'DKPL870')::text !~ '(Okafor|Mei Lin Chen|6475550198|9055550177)', 'vehicle match is masked');
select is(public.kiosk_lookup(:'k', 'BXRT552')->'owners'->0->>'masked_name', 'Marco R.', 'sold vehicle shows only the current owner');
select is(public.kiosk_lookup(:'k', 'ZZZZ999')->>'match', 'none', 'unknown plate -> none');
select is(public.kiosk_lookup(:'k', '9999999999')->>'match', 'none', 'unknown phone -> none');

-- kiosk_customer_vehicles
select is(public.kiosk_customer_vehicles(:'k', '00000000-0000-0000-0000-00000000c003')->>'match', 'customer', 'customer_vehicles shape');
select is(jsonb_array_length(public.kiosk_customer_vehicles(:'k', '00000000-0000-0000-0000-00000000c003')->'vehicles'), 2, 'Daniel has 2 vehicles');
select ok(public.kiosk_customer_vehicles(:'k', '00000000-0000-0000-0000-00000000c004')->'vehicles' @> '[{"role":"co_owner"}]', 'Mei is co-owner');
select is(tests.err(format($$select public.kiosk_customer_vehicles(%L, '00000000-0000-0000-0000-0000000000ff')$$, :'k')), 'NOT_FOUND', 'unknown customer');

-- kiosk_register: new customer + new vehicle
select public.kiosk_register(:'k', '{"name":"Lena Novak","phone":"(613) 555-0101","email":"Lena@Example.com"}',
                             '{"plate":"lnvk 101","year":2020,"make":"Mazda","model":"CX-5"}') as reg \gset
select is((:'reg'::jsonb)->>'next', 'visit', 'register new plate -> visit');
select is((:'reg'::jsonb)->>'existing_customer', 'false', 'new customer');
select is((:'reg'::jsonb)->>'first_name', 'Lena', 'first_name');
select tests.reset();
select is((select email::text from public.customers where name = 'Lena Novak'), 'lena@example.com', 'email lower-cased');
select is((select plate from public.vehicles where id = ((:'reg'::jsonb)->>'vehicle_id')::uuid), 'LNVK101', 'plate normalised');
select is((select verified::text || source::text from public.vehicle_owners where vehicle_id = ((:'reg'::jsonb)->>'vehicle_id')::uuid), 'truekiosk', 'ownership verified, source kiosk');
select tests.as_staff('ana.desk@example.com');

-- same phone + same name (case-insensitive) -> reuse
select is(public.kiosk_register(:'k', '{"name":"lena novak","phone":"6135550101"}', '{"plate":"LNVK101","make":"Mazda","model":"CX-5"}')->>'existing_customer',
          'true', 'register reuses customer with same phone + name');
select is(public.kiosk_register(:'k', '{"name":"lena novak","phone":"6135550101"}', '{"plate":"LNVK101","make":"Mazda","model":"CX-5"}')->>'next',
          'visit', 'caller already owner -> visit');
-- plate known, other owners -> link_owner, nothing created
select is(public.kiosk_register(:'k', '{"name":"New Buyer","phone":"6135550202"}', '{"plate":"CAAB214","make":"Honda","model":"CR-V"}')->>'next',
          'link_owner', 'plate with other owners -> link_owner');
select tests.reset();
select is((select count(*) from public.vehicle_owners where vehicle_id = '00000000-0000-0000-0000-00000000d001' and to_at is null), 1::bigint, 'no ownership created for link_owner');
-- plate known with no current owners -> add ownership
insert into public.vehicles (id, shop_id, plate, make, model) values ('00000000-0000-0000-0000-00000000d050', '00000000-0000-0000-0000-00000000a001', 'ORPH001', 'Kia', 'Soul');
select tests.as_staff('ana.desk@example.com');
select is(public.kiosk_register(:'k', '{"name":"Olive Orphan","phone":"6135550303"}', '{"plate":"ORPH001","make":"Kia","model":"Soul"}')->>'next',
          'visit', 'plate with no owners -> visit');

-- validation
select is(tests.err(format($$select public.kiosk_register(%L, '{"name":"","phone":"6135550404"}', '{"plate":"AB12","make":"Kia","model":"Rio"}')$$, :'k')), 'VALIDATION', 'name required');
select is(tests.err(format($$select public.kiosk_register(%L, '{"name":"A B","phone":"555"}', '{"plate":"AB12","make":"Kia","model":"Rio"}')$$, :'k')), 'VALIDATION', 'phone 10 digits');
select is(tests.err(format($$select public.kiosk_register(%L, '{"name":"A B","phone":"6135550404"}', '{"plate":"A","make":"Kia","model":"Rio"}')$$, :'k')), 'VALIDATION', 'plate 2..8');
select is(tests.err(format($$select public.kiosk_register(%L, '{"name":"A B","phone":"6135550404"}', '{"plate":"AB12","make":"Kia","model":"Rio","vin":"123"}')$$, :'k')), 'VALIDATION', 'vin 17');
select is(tests.err(format($$select public.kiosk_register(%L, '{"name":"A B","phone":"6135550404"}', '{"plate":"AB12","make":"Kia","model":"Rio","year":1969}')$$, :'k')), 'VALIDATION', 'year >= 1970');
select is(tests.err(format($$select public.kiosk_register(%L, '{"name":"A B","phone":"6135550404"}', '{"plate":"AB12","make":"","model":"Rio"}')$$, :'k')), 'VALIDATION', 'make required');

-- kiosk_add_vehicle
select is(public.kiosk_add_vehicle(:'k', '00000000-0000-0000-0000-00000000c001', '{"plate":"PRYA 222","make":"Tesla","model":"Model 3","year":2024}')->>'next',
          'visit', 'add_vehicle new -> visit');
select is(public.kiosk_add_vehicle(:'k', '00000000-0000-0000-0000-00000000c001', '{"plate":"DKPL870","make":"Toyota","model":"RAV4"}')->>'next',
          'link_owner', 'add_vehicle with other owners -> link_owner');

-- kiosk_link_owner: transfer keeps history
select is(public.kiosk_link_owner(:'k', '00000000-0000-0000-0000-00000000d002', '{"phone":"6135550505","name":"Tara Buyer"}', 'transfer')->>'first_name',
          'Tara', 'link_owner transfer to new customer');
select tests.reset();
select is((select count(*) from public.vehicle_owners where vehicle_id = '00000000-0000-0000-0000-00000000d002'), 3::bigint, 'transfer keeps ownership history');
select is((select string_agg(c.name, ',') from public.vehicle_owners o join public.customers c on c.id = o.customer_id
           where o.vehicle_id = '00000000-0000-0000-0000-00000000d002' and o.to_at is null), 'Tara Buyer', 'only buyer is current');
select is((select ended_reason from public.vehicle_owners o join public.customers c on c.id = o.customer_id
           where o.vehicle_id = '00000000-0000-0000-0000-00000000d002' and c.name = 'Marco Rossi'), 'Sold / transferred', 'previous owner ended as sold');
select is((select verified from public.vehicle_owners o join public.customers c on c.id = o.customer_id
           where o.vehicle_id = '00000000-0000-0000-0000-00000000d002' and c.name = 'Tara Buyer'), false, 'kiosk transfer is unverified');
select is((select count(*) from public.work_orders where vehicle_id = '00000000-0000-0000-0000-00000000d002'), 4::bigint, 'service history stays with the vehicle');
select tests.as_staff('ana.desk@example.com');

-- co_owner with known customer
select lives_ok(format($$select public.kiosk_link_owner(%L, '00000000-0000-0000-0000-00000000d001', '{"customer_id":"00000000-0000-0000-0000-00000000c002"}', 'co_owner')$$, :'k'), 'link co_owner');
select tests.reset();
select is((select role::text || verified::text from public.vehicle_owners where vehicle_id = '00000000-0000-0000-0000-00000000d001' and customer_id = '00000000-0000-0000-0000-00000000c002'),
          'co_ownerfalse', 'co-owner added unverified');
select tests.as_staff('ana.desk@example.com');
select is(tests.err(format($$select public.kiosk_link_owner(%L, '00000000-0000-0000-0000-00000000d001', '{"customer_id":"00000000-0000-0000-0000-00000000c002"}', 'steal')$$, :'k')), 'VALIDATION', 'bad mode');
select is(tests.err(format($$select public.kiosk_link_owner(%L, '00000000-0000-0000-0000-00000000d001', '{"phone":"6135550909"}', 'co_owner')$$, :'k')), 'VALIDATION', 'unknown phone needs a name');

-- kiosk_check_in
select format('{"customer_id":"00000000-0000-0000-0000-00000000c001","vehicle_id":"00000000-0000-0000-0000-00000000d001","reasons":["mechanical","body"],"odometer_km":"53,100","concerns":["Brakes grind", "", "Door dent"],"intake":{"transcript":"brakes grind","summary":"Grinding.","urgency":"unsafe","safety_note":"Check brakes.","questions":["a","b","c"],"evil":"x"},"signed_name":"Priya Sharma","signature_path":"%s/2026/11/0b4f8c2e-6a1d-4c3e-9f7a-1234567890ab.png"}',
              '00000000-0000-0000-0000-00000000a001') as ci_body \gset
select is(tests.err(format('select public.kiosk_check_in(%L, %L)', :'k', :'ci_body')), 'VALIDATION', 'odometer must be numeric');
select replace(:'ci_body', '"53,100"', '53100') as ci_body \gset
select public.kiosk_check_in(:'k', :'ci_body') as ci \gset
select ok((:'ci'::jsonb)->>'order_no' ~ '^[0-9]{6}-[0-9]{2}$', 'check-in returns order number');
select is((:'ci'::jsonb)->>'phone_masked', '(•••) •••-0142', 'masked phone');
select is((:'ci'::jsonb)->>'first_name', 'Priya', 'first name');
select tests.reset();
select is((select status::text || source::text || urgency::text from public.work_orders where id = ((:'ci'::jsonb)->>'work_order_id')::uuid),
          'checked_inkioskunsafe', 'work order created checked_in from kiosk with urgency');
select is((select count(*) from public.work_order_concerns where work_order_id = ((:'ci'::jsonb)->>'work_order_id')::uuid), 2::bigint, 'empty concerns dropped');
select ok(not ((select intake from public.work_orders where id = ((:'ci'::jsonb)->>'work_order_id')::uuid) ? 'evil'), 'intake keeps documented keys only');
select is(jsonb_array_length((select intake->'questions' from public.work_orders where id = ((:'ci'::jsonb)->>'work_order_id')::uuid)), 2, 'intake questions clamped to 2');
select is((select message from public.work_order_events where work_order_id = ((:'ci'::jsonb)->>'work_order_id')::uuid),
          'Checked in at the kiosk by Priya Sharma', 'kiosk_check_in event');
select is((select kind || staff_id::text from public.work_order_events where work_order_id = ((:'ci'::jsonb)->>'work_order_id')::uuid),
          'kiosk_check_in00000000-0000-0000-0000-00000000b002', 'event records the kiosk staff id');
select tests.as_staff('ana.desk@example.com');
-- order numbers are sequential (seed used -01..-04 today)
select is(public.kiosk_check_in(:'k', :'ci_body')->>'order_no',
          to_char(now() at time zone 'America/Toronto', 'YYMMDD') || '-06', 'next order number is sequential');
-- not an owner
select is(tests.err(format('select public.kiosk_check_in(%L, %L)', :'k', replace(:'ci_body', '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000c004'))),
          'VALIDATION', 'customer must be current owner');
select is(tests.err(format('select public.kiosk_check_in(%L, %L)', :'k', replace(:'ci_body', '"concerns":["Brakes grind", "", "Door dent"]', '"concerns":[""]'))),
          'VALIDATION', 'at least one concern');
select is(tests.err(format('select public.kiosk_check_in(%L, %L)', :'k', replace(:'ci_body', '"signed_name":"Priya Sharma"', '"signed_name":" "'))),
          'VALIDATION', 'signed name required');
select is(tests.err(format('select public.kiosk_check_in(%L, %L)', :'k', replace(:'ci_body', '00000000-0000-0000-0000-00000000a001/', 'other/'))),
          'VALIDATION', 'signature path must be in the shop folder');
select tests.reset();

select * from finish();
rollback;
