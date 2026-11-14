import { z } from 'zod';

export const ConfigSchema = z.object({
  stage: z.string().min(1),
  region: z.string().min(1),
  supabaseUrl: z.string().url(),
  supabasePublishableKey: z.string().min(1),
  cognito: z.object({
    userPoolId: z.string().min(1),
    userPoolClientId: z.string().min(1),
    domain: z.string().min(1),
    redirectSignIn: z.array(z.string()).min(1),
    redirectSignOut: z.array(z.string()).min(1),
  }),
  apiUrl: z.string().url(),
  authMode: z.enum(['cognito', 'dev']),
  devTokenUrl: z.string().url().optional(),
  devStaffEmails: z.array(z.string()).optional(),
});
export type AppConfig = z.infer<typeof ConfigSchema>;

const isLocal = (url: string) => ['localhost', '127.0.0.1', '::1'].includes(new URL(url).hostname);

/** Dev auth is only allowed against a local Supabase in the dev stage. */
export function assertSafeAuthMode(cfg: AppConfig): void {
  if (cfg.authMode === 'dev' && (cfg.stage !== 'dev' || !isLocal(cfg.supabaseUrl))) {
    throw new Error('Dev sign-in is only allowed with stage "dev" and a local Supabase.');
  }
}

export async function loadConfig(fetchImpl: typeof fetch = fetch): Promise<AppConfig> {
  const res = await fetchImpl('/config.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`config.json: ${res.status}`);
  const cfg = ConfigSchema.parse(await res.json());
  assertSafeAuthMode(cfg);
  return cfg;
}
