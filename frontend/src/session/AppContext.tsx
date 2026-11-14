import { createContext, useContext } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { IntakeApi } from '../api/intake';
import type { Api } from '../api/rpc';
import type { AuthAdapter } from '../auth/types';
import type { AppConfig } from '../config/loadConfig';

export interface AppServices {
  cfg: AppConfig;
  auth: AuthAdapter;
  api: Api;
  intake: IntakeApi;
  qc: QueryClient;
}

export const AppContext = createContext<AppServices | null>(null);

export function useApp(): AppServices {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('AppContext missing');
  return ctx;
}
