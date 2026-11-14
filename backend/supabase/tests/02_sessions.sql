\set helpers_included 1
begin;
\ir _helpers.sql
select no_plan();

-- me()
select tests.as_staff('ana.desk@example.com');
select is(public.me()->'staff'->>'name', 'Ana Moreira', 'me: staff name');
select is(public.me()->'shop'->>'hst_rate', '0.1300', 'me: shop hst_rate');
select is((public.me()->'staff'->>'has_pin')::boolean, true, 'me: has_pin');
select ok(not (public.me()->'staff' ? 'pin_hash'), 'me: no pin_hash');
select tests.reset();

select set_config('request.jwt.claims', '{"role":"authenticated","staff_id":"00000000-0000-0000-0000-0000000000ff","shop_id":"00000000-0000-0000-0000-00000000a001"}', true);
select set_config('role', 'authenticated', true);
select is(tests.err('select public.me()'), 'NOT_STAFF', 'me: unknown staff -> NOT_STAFF');
select tests.reset();

-- anon cannot call RPCs
select set_config('role', 'anon', true);
select ok(tests.err('select public.me()') like 'permission denied%', 'anon cannot execute me()');
select tests.reset();

-- start_session
select tests.as_staff('sam.tech@example.com');
select is(tests.err($$select public.start_session('frontdesk', 'x')$$), 'ROLE_NOT_ALLOWED', 'start_session: role not held');
select tests.session('workshop') as sam_ws \gset
select is((public.get_session(:'sam_ws')->>'role'), 'workshop', 'get_session returns role');
select ok((public.get_session(:'sam_ws')->>'expires_at')::timestamptz > now(), 'session expires in the future');
select is((public.get_session(:'sam_ws')->>'expires_at')::timestamptz,
          ((date_trunc('day', now() at time zone 'America/Toronto') + interval '1 day') at time zone 'America/Toronto'),
          'session expires at next local midnight');
select tests.reset();

-- get_session belongs to another staff -> SESSION_INVALID
select tests.as_staff('ana.desk@example.com');
select is(tests.err(format('select public.get_session(%L)', :'sam_ws')), 'SESSION_INVALID', 'get_session: other staff session');
select is(tests.err(format($$select public.kiosk_lookup(%L, '4165550142')$$, :'sam_ws')), 'SESSION_INVALID', 'write RPC with other staff session');
select tests.reset();

-- Session expiry
update public.device_sessions set expires_at = now() - interval '1 second' where id = :'sam_ws';
select tests.as_staff('sam.tech@example.com');
select is(tests.err(format('select public.get_session(%L)', :'sam_ws')), 'SESSION_EXPIRED', 'expired session -> SESSION_EXPIRED');
select is(tests.err(format($$select public.job_transition(%L, '00000000-0000-0000-0000-0000000e0009', 'in_progress', 1)$$, :'sam_ws')),
          'SESSION_EXPIRED', 'write RPC with expired session -> SESSION_EXPIRED');
-- end_session
select tests.session('workshop') as sam_ws2 \gset
select lives_ok(format('select public.end_session(%L)', :'sam_ws2'), 'end_session');
select is(tests.err(format('select public.get_session(%L)', :'sam_ws2')), 'SESSION_EXPIRED', 'ended session -> SESSION_EXPIRED');
select tests.reset();

-- Role removed from staff row after session start -> ROLE_NOT_ALLOWED
select tests.as_staff('ana.desk@example.com');
select tests.session('display') as ana_disp \gset
select tests.reset();
update public.staff set roles = '{frontdesk,kiosk}' where email = 'ana.desk@example.com';
select tests.as_staff('ana.desk@example.com');
select is(tests.err(format($$select public.verify_pin(%L, '2222')$$, :'ana_disp')), 'ROLE_NOT_ALLOWED', 'role removed -> ROLE_NOT_ALLOWED');
select tests.reset();
update public.staff set roles = '{frontdesk,kiosk,display}' where email = 'ana.desk@example.com';

-- Quick switch (owner: quick_switch frontdesk/workshop/admin)
select tests.as_staff('owner@example.com');
select tests.session('admin') as own_admin \gset
select is(public.switch_role(:'own_admin', 'frontdesk')->>'role', 'frontdesk', 'quick switch admin -> frontdesk');
select is(tests.err(format('select public.get_session(%L)', :'own_admin')), 'SESSION_EXPIRED', 'old session ended after switch');
select tests.session('admin') as own_admin2 \gset
select is(tests.err(format($$select public.switch_role(%L, 'kiosk')$$, :'own_admin2')), 'QUICK_SWITCH_NOT_ALLOWED', 'admin -> kiosk not in quick switch');
select tests.session('kiosk') as own_kiosk \gset
select is(tests.err(format($$select public.switch_role(%L, 'admin')$$, :'own_kiosk')), 'QUICK_SWITCH_NOT_ALLOWED', 'kiosk -> admin: current role not in quick switch');
select tests.reset();

select tests.as_staff('ana.desk@example.com');
select tests.session('frontdesk') as ana_fd \gset
select is(tests.err(format($$select public.switch_role(%L, 'kiosk')$$, :'ana_fd')), 'QUICK_SWITCH_NOT_ALLOWED', 'empty quick switch -> not allowed');
select is(tests.err(format($$select public.switch_role(%L, 'workshop')$$, :'ana_fd')), 'ROLE_NOT_ALLOWED', 'switch to a role not held');
select tests.reset();

-- set_my_pin
select tests.as_staff('sam.tech@example.com');
select is(tests.err($$select public.set_my_pin('12')$$), 'VALIDATION', 'set_my_pin: too short');
select is(tests.err($$select public.set_my_pin('12345a')$$), 'VALIDATION', 'set_my_pin: not digits');
select lives_ok($$select public.set_my_pin('7777')$$, 'set_my_pin: 4 digits');
select tests.reset();
select ok((select pin_hash = extensions.crypt('7777', pin_hash) from public.staff where email = 'sam.tech@example.com'), 'pin stored as bcrypt');

-- verify_pin
select tests.as_staff('ana.desk@example.com');
select tests.session('kiosk') as ana_k \gset
select is(public.verify_pin(:'ana_k', '2222')->>'staff_id', '00000000-0000-0000-0000-00000000b002', 'verify_pin: own PIN');
select is(public.verify_pin(:'ana_k', '4321')->>'staff_id', '00000000-0000-0000-0000-00000000b001', 'verify_pin: admin PIN');
select is(public.verify_pin(:'ana_k', '1111')->>'message', 'PIN_INVALID', 'verify_pin: other non-admin PIN is invalid');
select is(tests.err(format($$select public.verify_pin(%L, '2222')$$, :'ana_fd')), 'ROLE_NOT_ALLOWED', 'verify_pin needs kiosk/display session');
select public.verify_pin(:'ana_k', '0000');
select public.verify_pin(:'ana_k', '0000');
select public.verify_pin(:'ana_k', '0000');
select is(public.verify_pin(:'ana_k', '0000')->>'message', 'PIN_INVALID', 'fifth failure still PIN_INVALID');
select is(tests.err(format($$select public.verify_pin(%L, '2222')$$, :'ana_k')), 'PIN_LOCKED', 'locked after 5 failures');
select tests.reset();
select is((select count(*) from public.pin_attempts where staff_id = '00000000-0000-0000-0000-00000000b002' and not success), 5::bigint,
          'failed attempts are recorded');
-- detail = seconds remaining
select tests.as_staff('ana.desk@example.com');
create function pg_temp.err_detail(p_sql text) returns text language plpgsql as $$
declare d text;
begin execute p_sql; return null;
exception when others then get stacked diagnostics d = pg_exception_detail; return d; end $$;
select ok(pg_temp.err_detail(format($$select public.verify_pin(%L, '2222')$$, :'ana_k'))::int between 1 and 300, 'PIN_LOCKED detail is seconds remaining');
select tests.reset();
update public.pin_attempts set at = now() - interval '6 minutes' where staff_id = '00000000-0000-0000-0000-00000000b002';
select tests.as_staff('ana.desk@example.com');
select is(public.verify_pin(:'ana_k', '2222')->>'ok', 'true', 'unlocked after 5 minutes');
select tests.reset();

select * from finish();
rollback;
