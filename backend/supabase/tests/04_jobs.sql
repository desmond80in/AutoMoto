\set helpers_included 1
begin;
\ir _helpers.sql
select no_plan();

-- Seeded jobs: e0008 checked_in (F-150), e0009 accepted (Civic), e0007 in_progress (CR-V, Sam),
-- e0006 waiting_parts (RAV4, Sam), e0010 ready (RAV4), e0001 picked_up, e0011 cancelled.

create function pg_temp.status(p uuid) returns text language sql as $$ select status::text from public.work_orders where id = p $$;
create function pg_temp.ver(p uuid) returns int language sql as $$ select version from public.work_orders where id = p $$;

select tests.as_staff('ana.desk@example.com');
select tests.session('frontdesk') as fd \gset
select tests.session('kiosk') as ana_k \gset
select tests.reset();
select tests.as_staff('sam.tech@example.com');
select tests.session('workshop') as ws \gset
select tests.reset();
select tests.as_staff('owner@example.com');
select tests.session('admin') as adm \gset
select tests.reset();

-- ---------------------------------------------------------------- read rules
select tests.as_staff('ana.desk@example.com');
select is(jsonb_array_length(public.list_jobs('arrivals')), 1, 'arrivals: 1 checked_in');
select is(jsonb_array_length(public.list_jobs('active')), 5, 'active: 5 open jobs');
select is(jsonb_array_length(public.list_jobs('queue')), 1, 'queue: 1 accepted');
select is(jsonb_array_length(public.list_jobs('recent_picked_up')), 5, 'recent picked up');
select is(tests.err($$select public.list_jobs('everything')$$), 'VALIDATION', 'bad scope');
select is(public.list_jobs('arrivals')->0->>'customer_name', 'Daniel Okafor', 'summary has customer name');
select ok(public.list_jobs('arrivals')->0 ?& array['id','order_no','status','version','urgency','created_at','accepted_at','started_at',
  'plate','year','make','model','customer_name','customer_phone','first_concern','concern_count','tech_name','received_by_name',
  'total','estimate','owner_unverified'], 'job summary has all documented keys');
select is((public.get_work_order('00000000-0000-0000-0000-0000000e0007')->'totals'->>'total')::numeric, 298.89, 'totals: 96.50 + 168 + 13% HST = 298.89');
select is((public.get_work_order('00000000-0000-0000-0000-0000000e0007')->'totals'->>'tax')::numeric, 34.39, 'totals: tax');
select is((public.get_work_order('00000000-0000-0000-0000-0000000e0007')->'totals'->>'estimate')::numeric, 420.00, 'totals: estimate');
select ok(public.get_work_order('00000000-0000-0000-0000-0000000e0007') ?& array['id','order_no','status','version','reasons','odometer_km',
  'notes','pickup_date','source','urgency','intake','signed_name','signed_at','signature_path','created_at','accepted_at','started_at',
  'completed_at','picked_up_at','customer','vehicle','received_by','tech','concerns','items','totals','events','owner_is_current'],
  'full job has all documented keys');
select is(public.get_work_order('00000000-0000-0000-0000-0000000e0007')->'tech'->>'name', 'Sam Okonkwo', 'full job: tech');
select is(public.get_work_order('00000000-0000-0000-0000-0000000e0007')->'events'->0->>'message', 'Job taken up by Sam Okonkwo', 'events newest first');
select is(tests.err($$select public.get_work_order('00000000-0000-0000-0000-0000000000ff')$$), 'NOT_FOUND', 'get_work_order: unknown id');
select tests.reset();

select tests.as_staff('sam.tech@example.com');
select is(jsonb_array_length(public.list_jobs('mine')), 2, 'mine: Sam has in_progress + waiting_parts');
select tests.reset();

-- kiosk-only account cannot read jobs
insert into public.staff (shop_id, email, name, roles) values ('00000000-0000-0000-0000-00000000a001', 'kiosk@example.com', 'Reception kiosk', '{kiosk,display}');
select tests.as_staff('kiosk@example.com');
select is(tests.err($$select public.list_jobs('active')$$), 'ROLE_NOT_ALLOWED', 'kiosk-only cannot list jobs');
select is(tests.err($$select public.get_work_order('00000000-0000-0000-0000-0000000e0007')$$), 'ROLE_NOT_ALLOWED', 'kiosk-only cannot get job');
select tests.reset();

-- ---------------------------------------------------------------- find_job_by_code
select tests.as_staff('sam.tech@example.com');
select is(public.find_job_by_code('WO:00000000-0000-0000-0000-0000000e0009')->>'id', '00000000-0000-0000-0000-0000000e0009', 'find by QR payload');
select is(public.find_job_by_code((select order_no from public.work_orders where id = '00000000-0000-0000-0000-0000000e0009'))->>'id',
          '00000000-0000-0000-0000-0000000e0009', 'find by exact order number');
select is(public.find_job_by_code(right((select replace(order_no, '-', '') from public.work_orders where id = '00000000-0000-0000-0000-0000000e0009'), 3))->>'id',
          '00000000-0000-0000-0000-0000000e0009', 'find by last 3 digits');
select is(tests.err($$select public.find_job_by_code('WO:00000000-0000-0000-0000-0000000000ff')$$), 'NOT_FOUND', 'unknown QR');
select is(tests.err($$select public.find_job_by_code('12')$$), 'NOT_FOUND', 'too few digits');
select tests.reset();

-- ---------------------------------------------------------------- transitions (allowed)
-- checked_in -> accepted (frontdesk)
select tests.as_staff('ana.desk@example.com');
select is(public.job_transition(:'fd', '00000000-0000-0000-0000-0000000e0008', 'accepted', 1)->>'status', 'accepted', 'frontdesk accepts');
select is(public.get_work_order('00000000-0000-0000-0000-0000000e0008')->'received_by'->>'name', 'Ana Moreira', 'received_by set to caller');
select is(public.get_work_order('00000000-0000-0000-0000-0000000e0008')->'events'->0->>'message',
          'Keys received by Ana Moreira. Job added to the workshop queue', 'accept event message');
select is(jsonb_array_length(public.list_jobs('queue')), 2, 'accepted job moves to the queue');
select ok(public.get_work_order('00000000-0000-0000-0000-0000000e0008')->>'accepted_at' is not null, 'accepted_at stamped');
select is(pg_temp.ver('00000000-0000-0000-0000-0000000e0008'), 2, 'version incremented');
-- version conflict
select is(tests.err(format($$select public.job_transition(%L, '00000000-0000-0000-0000-0000000e0010', 'picked_up', 99)$$, :'fd')), 'VERSION_CONFLICT', 'stale version');
-- ready -> picked_up (frontdesk)
select is(public.job_transition(:'fd', '00000000-0000-0000-0000-0000000e0010', 'picked_up', 1)->>'status', 'picked_up', 'frontdesk releases vehicle');
select ok(public.get_work_order('00000000-0000-0000-0000-0000000e0010')->>'pickup_date' is not null, 'pickup_date defaulted to today');
-- frontdesk cannot take a job
select is(tests.err(format($$select public.job_transition(%L, '00000000-0000-0000-0000-0000000e0009', 'in_progress', 1)$$, :'fd')), 'ROLE_NOT_ALLOWED', 'frontdesk cannot take job');
select is(tests.err(format($$select public.job_transition(%L, '00000000-0000-0000-0000-0000000e0009', 'cancelled', 1)$$, :'fd')), 'ROLE_NOT_ALLOWED', 'frontdesk cannot cancel');
select is(tests.err(format($$select public.job_transition(%L, '00000000-0000-0000-0000-0000000e0009', 'in_progress', 1)$$, :'ana_k')), 'ROLE_NOT_ALLOWED', 'kiosk session cannot transition');
select tests.reset();

-- workshop flow on e0008 (now accepted, version 2)
select tests.as_staff('sam.tech@example.com');
select is(tests.err(format($$select public.job_transition(%L, '00000000-0000-0000-0000-0000000e0008', 'accepted', 2)$$, :'ws')), 'INVALID_TRANSITION', 'accepted -> accepted invalid');
select is(public.job_transition(:'ws', '00000000-0000-0000-0000-0000000e0008', 'in_progress', 2)->'tech'->>'name', 'Sam Okonkwo', 'workshop takes job; tech set');
select ok((select started_at from public.work_orders where id = '00000000-0000-0000-0000-0000000e0008') is not null, 'started_at stamped');
select is(public.job_transition(:'ws', '00000000-0000-0000-0000-0000000e0008', 'waiting_parts', 3)->>'status', 'waiting_parts', 'waiting on parts');
select is(public.job_transition(:'ws', '00000000-0000-0000-0000-0000000e0008', 'in_progress', 4)->'events'->0->>'message', 'Work resumed by Sam Okonkwo', 'resume');
select is(public.job_transition(:'ws', '00000000-0000-0000-0000-0000000e0008', 'ready', 5)->'events'->0->>'message',
          'Work completed by Sam Okonkwo. Ready for pickup', 'complete');
select ok((select completed_at from public.work_orders where id = '00000000-0000-0000-0000-0000000e0008') is not null, 'completed_at stamped');
select is(tests.err(format($$select public.job_transition(%L, '00000000-0000-0000-0000-0000000e0008', 'picked_up', 6)$$, :'ws')), 'ROLE_NOT_ALLOWED', 'workshop cannot release');
select is((select count(*) from public.work_order_events where work_order_id = '00000000-0000-0000-0000-0000000e0008' and kind = 'status_change'), 5::bigint,
          'each step audited');
select tests.reset();

-- disallowed pairs (sample)
select tests.as_staff('owner@example.com');
select is(tests.err(format($$select public.job_transition(%L, '00000000-0000-0000-0000-0000000e0009', 'ready', 1)$$, :'adm')), 'INVALID_TRANSITION', 'accepted -> ready');
select is(tests.err(format($$select public.job_transition(%L, '00000000-0000-0000-0000-0000000e0009', 'checked_in', 1)$$, :'adm')), 'INVALID_TRANSITION', 'accepted -> checked_in');
select is(tests.err(format($$select public.job_transition(%L, '00000000-0000-0000-0000-0000000e0001', 'ready', 1)$$, :'adm')), 'INVALID_TRANSITION', 'picked_up -> ready');
select is(tests.err(format($$select public.job_transition(%L, '00000000-0000-0000-0000-0000000e0001', 'cancelled', 1)$$, :'adm')), 'INVALID_TRANSITION', 'picked_up -> cancelled');
select is(tests.err(format($$select public.job_transition(%L, '00000000-0000-0000-0000-0000000e0011', 'accepted', 1)$$, :'adm')), 'INVALID_TRANSITION', 'cancelled -> accepted');
select is(tests.err(format($$select public.job_transition(%L, '00000000-0000-0000-0000-0000000e0006', 'ready', 1)$$, :'adm')), 'INVALID_TRANSITION', 'waiting_parts -> ready');
-- admin can do workshop steps and cancel
select is(public.job_transition(:'adm', '00000000-0000-0000-0000-0000000e0006', 'in_progress', 1)->>'status', 'in_progress', 'admin resumes');
select is(public.job_transition(:'adm', '00000000-0000-0000-0000-0000000e0009', 'cancelled', 1)->>'status', 'cancelled', 'admin cancels');
select ok((select cancelled_at from public.work_orders where id = '00000000-0000-0000-0000-0000000e0009') is not null, 'cancelled_at stamped');
select tests.reset();

-- ---------------------------------------------------------------- save_work_order
select tests.as_staff('sam.tech@example.com');
select public.save_work_order(:'ws', '00000000-0000-0000-0000-0000000e0007', 1,
  '{"notes":"Pads at 2 mm","items":[{"type":"part","description":"Front pads","qty":1,"unit_price":100},{"type":"labour","description":"Brake job","qty":1,"unit_price":140}],"concerns":[{"text":"Grinding","estimate":400}]}') as saved \gset
select is((:'saved'::jsonb)->>'version', '2', 'save increments version');
select is((:'saved'::jsonb)->'totals'->>'total', '271.20', 'totals recomputed (240 + 31.20)');
select is((:'saved'::jsonb)->'events'->0->>'message', 'Repair details updated by Sam Okonkwo', 'details_updated event');
select is(jsonb_array_length((:'saved'::jsonb)->'concerns'), 1, 'concerns replaced');
select is(tests.err(format($$select public.save_work_order(%L, '00000000-0000-0000-0000-0000000e0007', 1, '{"notes":"x"}')$$, :'ws')), 'VERSION_CONFLICT', 'stale save');
-- no change -> no version bump / event
select is(public.save_work_order(:'ws', '00000000-0000-0000-0000-0000000e0007', 2, '{"notes":"Pads at 2 mm"}')->>'version', '2', 'no-op save keeps version');
select is(tests.err(format($$select public.save_work_order(%L, '00000000-0000-0000-0000-0000000e0007', 2, '{"pickup_date":"2026-12-01"}')$$, :'ws')), 'ROLE_NOT_ALLOWED', 'workshop cannot set pickup date');
select is(tests.err(format($$select public.save_work_order(%L, '00000000-0000-0000-0000-0000000e0007', 2, '{"received_by":"00000000-0000-0000-0000-00000000b003"}')$$, :'ws')), 'ROLE_NOT_ALLOWED', 'workshop cannot set received_by');
select is(tests.err(format($$select public.save_work_order(%L, '00000000-0000-0000-0000-0000000e0007', 2, '{"items":[{"type":"gizmo","description":"x"}]}')$$, :'ws')), 'VALIDATION', 'bad item type');
select is(tests.err(format($$select public.save_work_order(%L, '00000000-0000-0000-0000-0000000e0007', 2, '{"items":[{"type":"part","description":""}]}')$$, :'ws')), 'VALIDATION', 'empty item description');
select tests.reset();
select tests.as_staff('ana.desk@example.com');
select is(public.save_work_order(:'fd', '00000000-0000-0000-0000-0000000e0007', 2, '{"pickup_date":"2026-12-01","reasons":["body"]}')->>'pickup_date', '2026-12-01', 'frontdesk sets pickup date');
select tests.reset();

-- ---------------------------------------------------------------- create_work_order
select tests.as_staff('ana.desk@example.com');
select is(public.create_work_order(:'fd', '{"vehicle_id":"00000000-0000-0000-0000-00000000d001","customer_id":"00000000-0000-0000-0000-00000000c001","concerns":["Oil change"]}')->>'source',
          'staff', 'create_work_order source staff');
select is(tests.err(format($$select public.create_work_order(%L, '{"vehicle_id":"00000000-0000-0000-0000-00000000d001","customer_id":"00000000-0000-0000-0000-00000000c003","concerns":["x"]}')$$, :'fd')),
          'NOT_CURRENT_OWNER', 'create_work_order needs a current owner');
select tests.reset();
select tests.as_staff('sam.tech@example.com');
select is(tests.err(format($$select public.create_work_order(%L, '{"vehicle_id":"00000000-0000-0000-0000-00000000d001","customer_id":"00000000-0000-0000-0000-00000000c001","concerns":["x"]}')$$, :'ws')),
          'ROLE_NOT_ALLOWED', 'workshop cannot create work orders');
select tests.reset();

select * from finish();
rollback;
