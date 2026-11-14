import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { errorMessage, toAppError } from '../api/errors';
import type { AppRole, Me, Session } from '../api/types';
import { scheduleAt } from '../lib/time';
import { useApp } from './AppContext';
import { needsPin } from './roles';
import { deviceLabel, loginMessage, pinPrompted, sessionStore } from './store';

export type SessionState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'notStaff' }
  | { status: 'error'; message: string }
  | { status: 'pickRole'; me: Me }
  | { status: 'pinSetup'; me: Me; role: AppRole; required: boolean }
  | { status: 'ready'; me: Me; session: Session };

interface SessionApi {
  state: SessionState;
  boot: () => Promise<void>;
  chooseRole: (role: AppRole, label?: string) => Promise<void>;
  completePinSetup: (pin: string | null) => Promise<void>;
  switchTo: (role: AppRole) => Promise<void>;
  signOut: (message?: string) => Promise<void>;
  refreshMe: () => Promise<void>;
}

const Ctx = createContext<SessionApi | null>(null);

export function useSession(): SessionApi {
  const s = useContext(Ctx);
  if (!s) throw new Error('SessionProvider missing');
  return s;
}

/** The signed-in staff member and device session; only valid inside RoleGuard. */
export function useReady() {
  const { state } = useSession();
  if (state.status !== 'ready') throw new Error('No active session');
  return state;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const { api, auth, qc } = useApp();
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  const signingOut = useRef(false);

  const start = useCallback(
    async (me: Me, role: AppRole, label?: string) => {
      const s = await api.startSession(role, label ?? deviceLabel.get());
      sessionStore.set({ id: s.id, role: s.role, expires_at: s.expires_at, staff_id: me.staff.id });
      setState({ status: 'ready', me, session: s });
    },
    [api],
  );

  const signOut = useCallback(
    async (message?: string) => {
      if (signingOut.current) return;
      signingOut.current = true;
      const stored = sessionStore.get();
      if (stored) await api.endSession(stored.id).catch(() => undefined);
      sessionStore.clear();
      if (message) loginMessage.set(message);
      qc.clear();
      setState({ status: 'signedOut' });
      try {
        await auth.signOut();
      } finally {
        signingOut.current = false;
      }
    },
    [api, auth, qc],
  );

  const boot = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      if (!(await auth.getAccessToken())) {
        setState({ status: 'signedOut' });
        return;
      }
      let me: Me;
      try {
        me = await api.me();
      } catch (e) {
        if (toAppError(e).code === 'NOT_STAFF') {
          setState({ status: 'notStaff' });
          return;
        }
        throw e;
      }
      const stored = sessionStore.get();
      if (stored && stored.staff_id === me.staff.id) {
        try {
          const s = await api.getSession(stored.id);
          if (me.staff.roles.includes(s.role)) {
            setState({ status: 'ready', me, session: s });
            return;
          }
        } catch {
          // expired or invalid: start again
        }
      }
      sessionStore.clear();
      if (me.staff.roles.length === 1) {
        const role = me.staff.roles[0]!;
        if (!me.staff.has_pin && (needsPin(role) || !pinPrompted.get(me.staff.id))) {
          setState({ status: 'pinSetup', me, role, required: needsPin(role) });
          return;
        }
        await start(me, role);
        return;
      }
      setState({ status: 'pickRole', me });
    } catch (e) {
      setState({ status: 'error', message: errorMessage(e) });
    }
  }, [api, auth, start]);

  const chooseRole = useCallback(
    async (role: AppRole, label?: string) => {
      if (state.status !== 'pickRole') return;
      if (label !== undefined) deviceLabel.set(label);
      const me = state.me;
      if (!me.staff.has_pin && (needsPin(role) || !pinPrompted.get(me.staff.id))) {
        setState({ status: 'pinSetup', me, role, required: needsPin(role) });
        return;
      }
      await start(me, role);
    },
    [state, start],
  );

  const completePinSetup = useCallback(
    async (pin: string | null) => {
      if (state.status !== 'pinSetup') return;
      let me = state.me;
      if (pin) {
        await api.setMyPin(pin);
        me = { ...me, staff: { ...me.staff, has_pin: true } };
      } else {
        pinPrompted.set(me.staff.id);
      }
      await start(me, state.role);
    },
    [api, state, start],
  );

  const switchTo = useCallback(
    async (role: AppRole) => {
      if (state.status !== 'ready') return;
      const s = await api.switchRole(role);
      sessionStore.set({ id: s.id, role: s.role, expires_at: s.expires_at, staff_id: state.me.staff.id });
      setState({ status: 'ready', me: state.me, session: s });
    },
    [api, state],
  );

  const refreshMe = useCallback(async () => {
    if (state.status !== 'ready') return;
    const me = await api.me();
    setState({ ...state, me });
  }, [api, state]);

  useEffect(() => {
    void boot();
  }, [boot]);

  // Any RPC reporting an ended session signs the device out.
  useEffect(() => api.onSessionError((e) => void signOut(errorMessage(e))), [api, signOut]);

  // Sessions end at local midnight (shop time zone, computed by the backend).
  const expiresAt = state.status === 'ready' ? state.session.expires_at : null;
  useEffect(() => {
    if (!expiresAt) return;
    return scheduleAt(expiresAt, () => void signOut(errorMessage({ message: 'SESSION_EXPIRED' })));
  }, [expiresAt, signOut]);

  const value = useMemo(
    () => ({ state, boot, chooseRole, completePinSetup, switchTo, signOut, refreshMe }),
    [state, boot, chooseRole, completePinSetup, switchTo, signOut, refreshMe],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
