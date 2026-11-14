import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const backend = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'backend');

/**
 * Fresh seed data for every run, then wait until the stack answers again: db reset restarts the containers,
 * and local Realtime rebuilds its replication slot, dropping changes until it streams again.
 */
export default async function globalSetup() {
  if (!process.env.E2E_NO_RESET) execSync('npx supabase db reset', { cwd: backend, stdio: 'inherit' });
  let token = '';
  for (let i = 0; i < 60 && !token; i++) {
    token = await fetch('http://localhost:8787/token?email=ana.desk@example.com')
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { access_token?: string } | null) => j?.access_token ?? '', () => '');
    if (!token) await sleep(1000);
  }
  if (!token) throw new Error('Local stack did not come back after db reset');

  const cfg = (await import('../public/config.json', { with: { type: 'json' } })).default as { supabasePublishableKey: string };
  const db = createClient('http://127.0.0.1:54321', cfg.supabasePublishableKey, { accessToken: async () => token });
  await db.realtime.setAuth();
  let seen = false;
  const ch = db
    .channel('e2e-warmup')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'work_orders' }, () => (seen = true))
    .subscribe();
  for (let i = 0; i < 60 && !seen; i++) {
    await sleep(1000);
    execSync(
      `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -qc "update public.work_orders set updated_at = updated_at where id = '00000000-0000-0000-0000-0000000e0001'"`,
    );
  }
  await db.removeChannel(ch);
  if (!seen) throw new Error('Realtime did not deliver changes after db reset');
}
