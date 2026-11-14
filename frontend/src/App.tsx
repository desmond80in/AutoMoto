import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMemo, useRef } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { IntakeApi } from './api/intake';
import { SmsApi } from './api/sms';
import { Api } from './api/rpc';
import { createSupabase } from './api/supabase';
import { createAuth } from './auth/createAuth';
import { ToastProvider } from './components/Toast';
import type { AppConfig } from './config/loadConfig';
import { AppRoutes } from './routes';
import { AppContext, type AppServices } from './session/AppContext';
import { SessionProvider } from './session/SessionProvider';
import { sessionStore } from './session/store';

export function App({ cfg }: { cfg: AppConfig }) {
  const services = useRef<AppServices | null>(null);
  if (!services.current) {
    const auth = createAuth(cfg);
    const db = createSupabase(cfg, auth);
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true, staleTime: 5_000 }, mutations: { retry: 0 } },
    });
    services.current = { cfg, auth, api: new Api(db, () => sessionStore.get()?.id ?? null), intake: new IntakeApi(cfg.apiUrl, auth), sms: new SmsApi(cfg.apiUrl, auth), qc };
  }
  const value = useMemo(() => services.current!, []);
  return (
    <AppContext.Provider value={value}>
      <QueryClientProvider client={value.qc}>
        <ToastProvider>
          <BrowserRouter>
            <SessionProvider>
              <AppRoutes />
            </SessionProvider>
          </BrowserRouter>
        </ToastProvider>
      </QueryClientProvider>
    </AppContext.Provider>
  );
}
