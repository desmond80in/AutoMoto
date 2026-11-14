// Creates the shop and the owner staff row in a real Supabase project. Idempotent.
// Needs SUPABASE_DB_URL (Supabase dashboard -> Connect -> session pooler URI) in the environment or backend/.env.
import pg from 'pg';
import { askHidden, env } from './env';

const shopName = env('SHOP_NAME');
const timezone = env('SHOP_TIMEZONE', 'America/Toronto');
const email = env('OWNER_EMAIL').toLowerCase();
const name = env('OWNER_NAME');

let pin = '';
while (!/^[0-9]{4,6}$/.test(pin)) {
  pin = await askHidden('Owner PIN (4-6 digits): ');
  if (!/^[0-9]{4,6}$/.test(pin)) console.log('Enter 4 to 6 digits.');
  else if ((await askHidden('Repeat the PIN: ')) !== pin) {
    console.log('The PINs did not match.');
    pin = '';
  }
}

const client = new pg.Client({ connectionString: env('SUPABASE_DB_URL'), ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query('begin');
  const shop = await client.query<{ id: string }>(
    `with found as (select id from public.shops where name = $1 order by created_at limit 1),
          ins as (insert into public.shops (name, timezone) select $1, $2 where not exists (select 1 from found) returning id)
     select id from found union all select id from ins`,
    [shopName, timezone],
  );
  const shopId = shop.rows[0]!.id;
  await client.query(
    `insert into public.staff (shop_id, email, name, roles, quick_switch, is_owner, active, pin_hash)
     values ($1, $2, $3, '{kiosk,frontdesk,workshop,display,admin}', '{frontdesk,workshop,admin}', true, true,
             extensions.crypt($4, extensions.gen_salt('bf', 10)))
     on conflict (shop_id, email) do update set name = excluded.name, roles = excluded.roles, is_owner = true,
       active = true, pin_hash = excluded.pin_hash`,
    [shopId, email, name, pin],
  );
  await client.query('commit');
  console.log(`Shop "${shopName}" (${shopId}) ready. Owner ${email} has all roles.`);
} catch (e) {
  await client.query('rollback');
  throw e;
} finally {
  await client.end();
}
