-- Realtime (8.7), Storage (9) and RPC grants (8).

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.work_orders, public.work_order_events, public.vehicle_owners;

-- The display role has no table access, so it listens to a private broadcast topic instead.
create or replace function public.notify_board_change() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform realtime.send(jsonb_build_object('at', now()), 'board_changed', 'shop:' || new.shop_id::text, true);
  return null;
end $$;
revoke execute on function public.notify_board_change() from public, anon, authenticated;

create trigger notify_board_change after insert or update on public.work_orders
for each row execute function public.notify_board_change();

create policy "shop members receive board broadcasts" on realtime.messages
for select to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and realtime.topic() = 'shop:' || coalesce(auth.jwt()->>'shop_id', '')
);

-- ---------------------------------------------------------------------------
-- Storage: private signatures bucket, <shop_id>/<yyyy>/<mm>/<uuid>.png, PNG <= 200 KB
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('signatures', 'signatures', false, 204800, array['image/png'])
on conflict (id) do update set public = false, file_size_limit = 204800, allowed_mime_types = array['image/png'];

create policy "signatures insert by kiosk, front desk, admin" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'signatures'
  and (storage.foldername(name))[1] = coalesce(auth.jwt()->>'shop_id', '')
  and name ~ '^[0-9a-f-]{36}/[0-9]{4}/[0-9]{2}/[0-9a-f-]{36}\.png$'
  and app.has_any_role('kiosk', 'frontdesk', 'admin')
);

create policy "signatures read by front desk, workshop, admin" on storage.objects
for select to authenticated
using (
  bucket_id = 'signatures'
  and (storage.foldername(name))[1] = coalesce(auth.jwt()->>'shop_id', '')
  and app.has_any_role('frontdesk', 'workshop', 'admin')
);

-- ---------------------------------------------------------------------------
-- RPC grants: authenticated only
-- ---------------------------------------------------------------------------
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'me', 'start_session', 'get_session', 'switch_role', 'end_session', 'set_my_pin', 'verify_pin',
      'kiosk_lookup', 'kiosk_customer_vehicles', 'kiosk_register', 'kiosk_add_vehicle', 'kiosk_link_owner', 'kiosk_check_in',
      'create_work_order', 'save_work_order', 'job_transition', 'get_work_order', 'list_jobs', 'find_job_by_code',
      'search_all', 'get_customer', 'get_vehicle', 'update_customer', 'update_vehicle', 'owner_add', 'owner_end',
      'owner_verify', 'list_customers', 'list_vehicles', 'list_staff', 'staff_upsert', 'update_shop')
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- app helpers created after the schema migration
revoke all on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated, service_role;
