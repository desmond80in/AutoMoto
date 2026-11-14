// Post-deploy smoke test. Optional: SMOKE_TOKEN=<Cognito access token> to check me() through Supabase.
import { env, infraOutputs } from './env';

const out = infraOutputs();
const api = String(out.ApiUrl).replace(/\/$/, '');
let failed = false;
const check = (name: string, ok: boolean, info = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`);
  if (!ok) failed = true;
};

const health = await fetch(`${api}/health`);
check('GET /health', health.ok && ((await health.json()) as { ok?: boolean }).ok === true, String(health.status));

const anon = await fetch(`${api}/intake/visit`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } });
check('POST /intake/visit without a token is 401', anon.status === 401, String(anon.status));

const web = await fetch(String(out.WebUrl));
check('Web URL serves over HTTPS', web.ok && String(out.WebUrl).startsWith('https://'), String(web.status));
const deep = await fetch(`${String(out.WebUrl).replace(/\/$/, '')}/anything/deep`);
check('SPA fallback for deep links', deep.status === 200, String(deep.status));

const token = process.env.SMOKE_TOKEN;
if (token) {
  const me = await fetch(`${env('SUPABASE_URL')}/rest/v1/rpc/me`, {
    method: 'POST',
    headers: { apikey: env('SUPABASE_PUBLISHABLE_KEY'), authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: '{}',
  });
  const body = (await me.json()) as { staff?: { name?: string } };
  check('me() through Supabase with a Cognito token', me.ok && !!body.staff?.name, me.ok ? body.staff?.name : String(me.status));
} else {
  console.log('SKIP  me() through Supabase (set SMOKE_TOKEN to a Cognito access token to run it)');
}
process.exit(failed ? 1 : 0);
