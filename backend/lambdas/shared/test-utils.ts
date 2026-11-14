import { vi } from 'vitest';

export const STAFF = {
  id: '00000000-0000-0000-0000-00000000b002',
  shop_id: '00000000-0000-0000-0000-00000000a001',
  email: 'ana.desk@example.com',
  name: 'Ana Moreira',
  roles: ['frontdesk', 'kiosk', 'display'],
  active: true,
  cognito_sub: null as string | null,
};

/** Stub global fetch for the Supabase REST calls. Returns the mock for assertions. */
export function stubSupabase(rows: unknown[]) {
  process.env.SUPABASE_URL = 'http://supabase.test';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
  const mock = vi.fn(async (_url: string, init?: RequestInit) =>
    init?.method === 'PATCH' ? new Response(null, { status: 204 }) : Response.json(rows),
  );
  vi.stubGlobal('fetch', mock);
  return mock;
}
