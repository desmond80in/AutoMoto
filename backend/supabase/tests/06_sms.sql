\set helpers_included 1
begin;
\ir _helpers.sql
select no_plan();

-- Seed: e0010 ready (CX-5, Mei Lin Chen, opted in), e0009 accepted (Elantra, Marco Rossi, not opted in),
-- e0011 cancelled, e0007 in_progress (Corolla, Priya Sharma, opted in).

select tests.as_staff('ana.desk@example.com');
select tests.session('frontdesk') as fd \gset
select tests.session('kiosk') as k \gset
select tests.reset();
select tests.as_staff('sam.tech@example.com');
select tests.session('workshop') as ws \gset
select tests.reset();

create function pg_temp.ver(p uuid) returns int language sql as $$ select version from public.work_orders where id = p $$;

-- ---------------------------------------------------------------- sms_queue
select tests.as_staff('ana.desk@example.com');
select public.sms_queue(:'fd', '00000000-0000-0000-0000-0000000e0010', 'ready',
                        '  Demo Auto Repair: Your  Mazda CX-5 is ready for pickup.  ') as q \gset
select is((:'q'::jsonb)->>'to', '+19055550177', 'returns the E.164 number of the customer');
select is((:'q'::jsonb)->>'body', 'Demo Auto Repair: Your Mazda CX-5 is ready for pickup.', 'body is trimmed, spaces collapsed');
select is(public.get_work_order('00000000-0000-0000-0000-0000000e0010')->'messages'->0->>'status', 'queued', 'job shows the queued message');
select is(public.get_work_order('00000000-0000-0000-0000-0000000e0010')->'messages'->0->>'sent_by_name', 'Ana Moreira', 'message shows who sent it');
select is(public.get_work_order('00000000-0000-0000-0000-0000000e0010')->'events'->0->>'message',
          'Text to the customer (ready for pickup) by Ana Moreira', 'history records the text');
select is(public.get_work_order('00000000-0000-0000-0000-0000000e0010')->'customer'->>'sms_opt_in', 'true', 'job shows consent');

select is(tests.err(format($$select public.sms_queue(%L, '00000000-0000-0000-0000-0000000e0009', 'custom', 'Hi')$$, :'fd')),
          'SMS_NOT_ALLOWED', 'no text without consent');
select is(tests.err(format($$select public.sms_queue(%L, '00000000-0000-0000-0000-0000000e0010', 'custom', '   ')$$, :'fd')),
          'VALIDATION', 'empty body');
select is(tests.err(format($$select public.sms_queue(%L, '00000000-0000-0000-0000-0000000e0010', 'custom', %L)$$, :'fd', repeat('x', 481))),
          'VALIDATION', 'body over 480 characters');
select is(tests.err(format($$select public.sms_queue(%L, '00000000-0000-0000-0000-0000000e0011', 'custom', 'Hi')$$, :'fd')),
          'INVALID_TRANSITION', 'no text on a cancelled job');
select is(tests.err(format($$select public.sms_queue(%L, '00000000-0000-0000-0000-0000000e0010', 'custom', 'Hi')$$, :'k')),
          'ROLE_NOT_ALLOWED', 'kiosk cannot text');
select tests.reset();

select tests.as_staff('sam.tech@example.com');
select is(tests.err(format($$select public.sms_queue(%L, '00000000-0000-0000-0000-0000000e0010', 'custom', 'Hi')$$, :'ws')),
          'ROLE_NOT_ALLOWED', 'workshop cannot text');
select tests.reset();

select tests.as_staff('ana.desk@example.com');
select public.sms_queue(:'fd', '00000000-0000-0000-0000-0000000e0010', 'custom', 'Message ' || g) from generate_series(2, 5) g;
select is(tests.err(format($$select public.sms_queue(%L, '00000000-0000-0000-0000-0000000e0010', 'custom', 'Six')$$, :'fd')),
          'RATE_LIMITED', 'at most 5 texts per job per hour');
select tests.reset();

-- No direct table access for clients.
select tests.as_staff('owner@example.com');
select is(tests.err('select count(*) from public.sms_messages'), 'permission denied for table sms_messages', 'no select on sms_messages');
select tests.reset();

-- ---------------------------------------------------------------- consent
select tests.as_staff('ana.desk@example.com');
select is(public.update_customer(:'fd', '00000000-0000-0000-0000-00000000c002', '{"sms_opt_in": true}')->'customer'->>'sms_opt_in',
          'true', 'desk turns consent on');
select tests.reset();
select is((select sms_opt_in_source::text from public.customers where id = '00000000-0000-0000-0000-00000000c002'), 'staff', 'consent source: staff');
select ok((select sms_opt_in_at > now() - interval '1 minute' from public.customers where id = '00000000-0000-0000-0000-00000000c002'), 'consent time recorded');
select tests.as_staff('ana.desk@example.com');
select is(tests.err(format($$select public.update_customer(%L, '00000000-0000-0000-0000-00000000c002', '{"sms_opt_in": "yes"}')$$, :'fd')),
          'VALIDATION', 'consent must be a boolean');
select is(public.update_customer(:'fd', '00000000-0000-0000-0000-00000000c002', '{"name": "Marco Rossi"}')->'customer'->>'sms_opt_in',
          'true', 'other edits keep consent');
select public.update_customer(:'fd', '00000000-0000-0000-0000-00000000c002', '{"sms_opt_in": false}');

-- Kiosk checkbox: Marco checks in his Civic (d002) and ticks the box.
select format('{"customer_id":"00000000-0000-0000-0000-00000000c002","vehicle_id":"00000000-0000-0000-0000-00000000d002","reasons":["mechanical"],"concerns":["Noise"],"signed_name":"Marco Rossi","signature_path":"%s/2026/11/0b4f8c2e-6a1d-4c3e-9f7a-1234567890ab.png","sms_opt_in":true}',
              '00000000-0000-0000-0000-00000000a001') as ci_body \gset
select public.kiosk_check_in(:'k', :'ci_body') as ci \gset
select ok(not ((:'ci'::jsonb) ? 'sms_opt_in'), 'kiosk response unchanged');
select tests.reset();
select is((select sms_opt_in::text || sms_opt_in_source::text from public.customers where id = '00000000-0000-0000-0000-00000000c002'),
          'truekiosk', 'kiosk checkbox records consent');

-- ---------------------------------------------------------------- approval needed
select tests.as_staff('sam.tech@example.com');
select pg_temp.ver('00000000-0000-0000-0000-0000000e0007') as v7 \gset
select public.set_approval_needed(:'ws', '00000000-0000-0000-0000-0000000e0007', true, :v7, '  Rear rotors   worn too ') as j \gset
select is((:'j'::jsonb)->>'approval_needed', 'true', 'workshop flags approval needed');
select is((:'j'::jsonb)->>'approval_note', 'Rear rotors worn too', 'note cleaned');
select is(((:'j'::jsonb)->>'version')::int, :v7 + 1, 'version bumped');
select is((:'j'::jsonb)->'events'->0->>'message', 'Customer approval needed: Rear rotors worn too. Set by Sam Okonkwo', 'history');
select is((select x->>'approval_needed' from jsonb_array_elements(public.list_jobs('active')) x
           where x->>'id' = '00000000-0000-0000-0000-0000000e0007'), 'true', 'job summary has the flag');
select is(tests.err(format($$select public.set_approval_needed(%L, '00000000-0000-0000-0000-0000000e0007', false, %s)$$, :'ws', :v7)),
          'VERSION_CONFLICT', 'stale version');
select tests.reset();
select tests.as_staff('ana.desk@example.com');
select public.set_approval_needed(:'fd', '00000000-0000-0000-0000-0000000e0007', false, :v7 + 1) as j \gset
select is((:'j'::jsonb)->>'approval_needed' || coalesce((:'j'::jsonb)->>'approval_note', '-'), 'false-', 'desk clears it');
select is((:'j'::jsonb)->'events'->0->>'message', 'Customer approval received. Cleared by Ana Moreira', 'history on clear');
select is(tests.err(format($$select public.set_approval_needed(%L, '00000000-0000-0000-0000-0000000e0011', true, 1)$$, :'fd')),
          'INVALID_TRANSITION', 'not on a closed job');
select is(tests.err(format($$select public.set_approval_needed(%L, '00000000-0000-0000-0000-0000000e0007', true, %s)$$, :'k', :v7 + 2)),
          'ROLE_NOT_ALLOWED', 'kiosk cannot flag');
select tests.reset();

-- ---------------------------------------------------------------- shop phone
select tests.as_staff('owner@example.com');
select tests.session('admin') as adm \gset
select is(public.update_shop(:'adm', '{"phone": "(905) 555-0100"}')->>'phone', '9055550100', 'shop phone normalised');
select is(tests.err(format($$select public.update_shop(%L, '{"phone": "555-01"}')$$, :'adm')), 'VALIDATION', 'bad shop phone');
select is(public.update_shop(:'adm', '{"phone": ""}')->>'phone', null, 'shop phone cleared');
select tests.reset();

select * from finish();
rollback;
