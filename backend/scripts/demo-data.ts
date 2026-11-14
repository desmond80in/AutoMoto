// Loads or removes demo data in the hosted Supabase project (not the local stack; that uses seed.sql).
// Usage: npx tsx scripts/demo-data.ts load|remove    Needs psql and SUPABASE_DB_URL in backend/.env.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { backendDir, env } from './env';

const action = process.argv[2];
if (action !== 'load' && action !== 'remove') throw new Error('Usage: demo-data.ts load|remove');

/** Split the connection URI by hand: passwords with #, @ or * are often pasted unencoded. */
function pgEnv(uri: string): NodeJS.ProcessEnv {
  const rest = uri.replace(/^postgres(ql)?:\/\//, '');
  const at = rest.lastIndexOf('@');
  const cred = rest.slice(0, at);
  const [hostPort = '', ...dbParts] = rest.slice(at + 1).split('/');
  const dbAndQuery = dbParts.join('/');
  const colon = cred.indexOf(':');
  const portAt = hostPort.lastIndexOf(':');
  const decode = (s: string) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  };
  return {
    ...process.env,
    PGUSER: decode(cred.slice(0, colon)),
    PGPASSWORD: decode(cred.slice(colon + 1)),
    PGHOST: portAt > 0 ? hostPort.slice(0, portAt) : hostPort,
    PGPORT: portAt > 0 ? hostPort.slice(portAt + 1) : '5432',
    PGDATABASE: dbAndQuery.split('?')[0] || 'postgres',
    PGSSLMODE: process.env.PGSSLMODE ?? 'require',
  };
}

const pgenv = pgEnv(process.env.SUPABASE_DB_URL?.trim() || env('SUPABASE_DB_URL'));

function psql(args: string[], capture = false): string {
  const r = spawnSync('psql', ['-X', '-q', ...args], {
    env: pgenv,
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
  });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    if (capture) process.stderr.write(r.stderr);
    process.exit(r.status ?? 1);
  }
  return r.stdout ?? '';
}

if (action === 'remove') {
  psql(['-f', join(backendDir, 'supabase', 'demo-data-remove.sql')]);
  console.log('Demo data removed.');
} else {
  // The demo attaches to the only shop; the owner and the first active front-desk staff member are named in the history.
  const out = psql(
    [
      '-At',
      '-F',
      '\t',
      '-c',
      `
    select s.id, o.id, o.name, coalesce(d.id, o.id), coalesce(d.name, o.name), (select count(*) from public.shops)
    from public.shops s
    join lateral (select id, name from public.staff where shop_id = s.id and is_owner and active order by created_at limit 1) o on true
    left join lateral (select id, name from public.staff where shop_id = s.id and not is_owner and active
                       and 'frontdesk' = any(roles) order by created_at limit 1) d on true
    order by s.created_at limit 1`,
    ],
    true,
  ).trim();
  if (!out) throw new Error('No shop with an active owner. Run scripts/bootstrap-owner.ts first.');
  const [shop, owner, ownerName, desk, deskName, shops] = out.split('\t');
  if (shops !== '1') throw new Error(`Expected one shop, found ${shops}.`);
  psql([
    '-v',
    `shop=${shop}`,
    '-v',
    `owner=${owner}`,
    '-v',
    `owner_name=${ownerName}`,
    '-v',
    `desk=${desk}`,
    '-v',
    `desk_name=${deskName}`,
    '-f',
    join(backendDir, 'supabase', 'demo-data.sql'),
  ]);
  console.log(
    `Demo data loaded into "${shop}". Demo technician: Sam Okonkwo, PIN 1111. Remove with: npm run demo:remove`,
  );
}
