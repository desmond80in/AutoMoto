// Shared by mint-dev-token.ts and dev-token-server.ts: HS256 tokens for LOCAL Supabase only.
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SignJWT } from 'jose';

const backendDir = join(dirname(fileURLToPath(import.meta.url)), '..');
export const LOCAL_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';

interface LocalKeys {
  jwtSecret: string;
  secretKey: string;
}
let keys: LocalKeys | undefined;

export function assertLocal(url = LOCAL_URL): void {
  const host = new URL(url).hostname;
  if (!['localhost', '127.0.0.1', '::1', 'host.docker.internal'].includes(host)) {
    throw new Error(`Refusing to mint dev tokens: SUPABASE_URL (${url}) is not localhost.`);
  }
}

function localKeys(): LocalKeys {
  if (keys) return keys;
  if (process.env.LOCAL_JWT_SECRET && process.env.LOCAL_SECRET_KEY) {
    keys = { jwtSecret: process.env.LOCAL_JWT_SECRET, secretKey: process.env.LOCAL_SECRET_KEY };
    return keys;
  }
  const out = execSync('npx supabase status -o json', { cwd: backendDir, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  const s = JSON.parse(out.slice(out.indexOf('{'))) as Record<string, string>;
  keys = { jwtSecret: s.JWT_SECRET!, secretKey: s.SECRET_KEY ?? s.SERVICE_ROLE_KEY! };
  return keys;
}

export interface DevStaff {
  id: string;
  shop_id: string;
  email: string;
  roles: string[];
}

export async function mintDevToken(email: string): Promise<{ access_token: string; staff: DevStaff }> {
  assertLocal();
  const { jwtSecret, secretKey } = localKeys();
  const res = await fetch(
    `${LOCAL_URL}/rest/v1/staff?select=id,shop_id,email,roles&active=is.true&email=eq.${encodeURIComponent(email.toLowerCase())}`,
    { headers: { apikey: secretKey } },
  );
  if (!res.ok) throw new Error(`Staff lookup failed: ${res.status}`);
  const [staff] = (await res.json()) as DevStaff[];
  if (!staff) throw new Error(`No active staff with e-mail ${email}`);
  const access_token = await new SignJWT({
    role: 'authenticated',
    staff_id: staff.id,
    shop_id: staff.shop_id,
    app_roles: staff.roles.join(' '),
    staff_email: staff.email,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(staff.id)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(new TextEncoder().encode(jwtSecret));
  return { access_token, staff };
}
