// Local stand-in for the intake API (dev + e2e). Deterministic, keyword-based answers.
// POST /intake/visit, POST /intake/registration on http://localhost:8788. Add ?fail=1 for a 502.
// POST /sms/send runs the real sms-api handler against local Supabase in simulated mode (nothing is sent).
import { spawnSync } from 'node:child_process';
import { createServer, type IncomingMessage } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.MOCK_INTAKE_PORT ?? 8788);

export function visitAnswer(text: string) {
  const t = text.toLowerCase();
  const concerns: string[] = [];
  let urgency: 'routine' | 'soon' | 'unsafe' = 'routine';
  let safety = '';
  const reasons = new Set<string>();
  if (/brak/.test(t)) {
    concerns.push(/grind/.test(t) ? 'Grinding noise from the front when braking' : 'Problem with the brakes when braking');
    urgency = 'unsafe';
    safety = 'Possible brake wear. Inspect the brakes before the vehicle is driven again.';
  }
  if (/pull/.test(t)) concerns.push('Vehicle pulls to one side while driving');
  if (/light|check engine/.test(t)) {
    concerns.push('Warning light came on');
    if (urgency === 'routine') urgency = 'soon';
  }
  if (/oil/.test(t)) concerns.push('Oil change');
  if (/dent|scratch|paint/.test(t)) {
    concerns.push('Body damage');
    reasons.add('body');
  }
  if (/accident|crash|tow/.test(t)) reasons.add('accident');
  if (!reasons.size || concerns.some((c) => !/Body damage/.test(c))) reasons.add('mechanical');
  const km = t.match(/(\d{2,3})\s*thousand/);
  return {
    concerns,
    reasons: [...reasons],
    odometer_km: km ? Number(km[1]) * 1000 : null,
    warning_lights: /battery light/.test(t) ? ['Battery light'] : [],
    when_it_happens: /highway/.test(t) ? 'At highway speed' : '',
    urgency,
    safety_note: safety,
    summary: concerns.length ? `Customer reports: ${concerns.join('; ').toLowerCase()}.` : '',
    questions: concerns.length ? ['When did it start?'] : [],
  };
}

export function registrationAnswer(text: string) {
  const name = text.match(/(?:my name is|i am|i'm)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/)?.[1] ?? '';
  const phone = (text.match(/(?:\d[\s-]?){10}/)?.[0] ?? '').replace(/\D/g, '');
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0]?.toLowerCase() ?? '';
  const car = text.match(/\b(19[7-9]\d|20[0-3]\d)\s+([A-Z][A-Za-z-]+)\s+([A-Z0-9][A-Za-z0-9-]*)/);
  const plate = (text.match(/plate\s+([A-Z0-9]{2,4}\s?[A-Z0-9]{1,4})/i)?.[1] ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return { name, phone, email, plate, year: car?.[1] ?? '', make: car?.[2] ?? '', model: car?.[3] ?? '', engine: '', vin: '' };
}

const read = (req: IncomingMessage) =>
  new Promise<string>((resolve) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => resolve(b));
  });

/** Local Supabase URL and keys for the sms handler, read once from `supabase status`. */
let localSupabase = false;
function localSupabaseEnv(): void {
  if (localSupabase) return;
  const back = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'backend');
  const out = spawnSync('npx', ['supabase', 'status', '-o', 'env'], { cwd: back, encoding: 'utf8' }).stdout ?? '';
  const get = (k: string) => out.match(new RegExp(`^${k}="?([^"\\n]*)"?$`, 'm'))?.[1] ?? '';
  process.env.SUPABASE_URL = get('API_URL') || 'http://127.0.0.1:54321';
  process.env.SUPABASE_PUBLISHABLE_KEY = get('PUBLISHABLE_KEY') || get('ANON_KEY');
  process.env.SUPABASE_SECRET_KEY = get('SECRET_KEY') || get('SERVICE_ROLE_KEY');
  localSupabase = true;
}

async function sendSms(req: IncomingMessage, raw: string) {
  localSupabaseEnv();
  const { handle } = await import('../../backend/lambdas/sms-api/index');
  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  let claims: Record<string, unknown> = {};
  try {
    claims = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    // handled by the 401 below
  }
  const event = {
    routeKey: 'POST /sms/send',
    rawPath: '/sms/send',
    headers: { authorization: req.headers.authorization ?? '' },
    body: raw,
    isBase64Encoded: false,
    requestContext: { requestId: 'mock', http: { method: 'POST' }, authorizer: { jwt: { claims, scopes: [] } } },
  };
  return handle(event as never, null);
}

createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const send = (status: number, body: unknown) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
  if (req.method === 'OPTIONS') return void res.writeHead(204).end();
  if (req.method === 'GET' && url.pathname === '/health') return send(200, { ok: true });
  if (!/^Bearer .+/.test(req.headers.authorization ?? '')) return send(401, { message: 'Unauthorized' });
  if (url.searchParams.get('fail') === '1') return send(502, { error: 'AI_UNAVAILABLE' });
  if (req.method === 'POST' && url.pathname === '/sms/send') {
    const r = await sendSms(req, await read(req));
    return void res.writeHead(r.statusCode ?? 500, { 'content-type': 'application/json' }).end(r.body);
  }
  let body: { text?: string };
  try {
    body = JSON.parse(await read(req));
  } catch {
    return send(400, { error: 'VALIDATION' });
  }
  const text = String(body.text ?? '').trim();
  if (!text) return send(400, { error: 'VALIDATION' });
  if (req.method === 'POST' && url.pathname === '/intake/visit') {
    const a = visitAnswer(text);
    return a.concerns.length ? send(200, a) : send(422, { error: 'NOT_UNDERSTOOD' });
  }
  if (req.method === 'POST' && url.pathname === '/intake/registration') {
    const a = registrationAnswer(text);
    return Object.values(a).some(Boolean) ? send(200, a) : send(422, { error: 'NOT_UNDERSTOOD' });
  }
  send(404, { error: 'NOT_FOUND' });
}).listen(PORT, '127.0.0.1', () => console.log(`mock intake + sms API on http://localhost:${PORT}`));
