import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AuthAdapter } from '../auth/types';
import type { AppConfig } from '../config/loadConfig';

export function createSupabase(cfg: AppConfig, auth: AuthAdapter): SupabaseClient {
  return createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
    accessToken: () => auth.getAccessToken(),
    realtime: { params: { eventsPerSecond: 5 } },
  });
}
