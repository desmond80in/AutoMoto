import { getSecret } from './secrets';

export interface StaffRow {
  id: string;
  shop_id: string;
  email: string;
  name: string;
  roles: string[];
  active: boolean;
  cognito_sub: string | null;
}

function supabaseUrl(): string {
  const url = process.env.SUPABASE_URL;
  if (!url) throw new Error('Missing SUPABASE_URL');
  return url.replace(/\/$/, '');
}

export async function rest(path: string, init: RequestInit = {}): Promise<Response> {
  const key = await getSecret('SUPABASE_SECRET_KEY');
  const res = await fetch(`${supabaseUrl()}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, 'Content-Type': 'application/json', ...init.headers },
  });
  if (!res.ok) throw new Error(`Supabase ${init.method ?? 'GET'} ${path.split('?')[0]} failed: ${res.status}`);
  return res;
}

/** Active staff row by e-mail (any shop), using the Supabase secret key. */
export async function findActiveStaff(email: string): Promise<StaffRow | null> {
  const e = encodeURIComponent(email.trim().toLowerCase());
  const res = await rest(
    `staff?select=id,shop_id,email,name,roles,active,cognito_sub&email=eq.${e}&active=is.true&order=created_at.asc&limit=1`,
  );
  const rows = (await res.json()) as StaffRow[];
  return rows[0] ?? null;
}

export async function linkCognitoSub(staffId: string, sub: string): Promise<void> {
  await rest(`staff?id=eq.${encodeURIComponent(staffId)}&cognito_sub=is.null`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ cognito_sub: sub }),
  });
}
