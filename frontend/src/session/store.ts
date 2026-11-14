import type { AppRole } from '../api/types';

export interface StoredSession {
  id: string;
  role: AppRole;
  expires_at: string;
  staff_id: string;
}

const KEY = 'workshop.session';
const LABEL_KEY = 'workshop.deviceLabel';
const MSG_KEY = 'workshop.loginMessage';

function read<T>(storage: Storage, key: string): T | null {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export const sessionStore = {
  get: () => read<StoredSession>(localStorage, KEY),
  set: (s: StoredSession) => localStorage.setItem(KEY, JSON.stringify(s)),
  clear: () => localStorage.removeItem(KEY),
};

export const deviceLabel = {
  get: () => localStorage.getItem(LABEL_KEY) || 'This device',
  set: (v: string) => localStorage.setItem(LABEL_KEY, v.trim() || 'This device'),
};

/** Message shown on /login after a sign-out (survives the Cognito logout redirect). */
export const loginMessage = {
  set: (m: string) => sessionStorage.setItem(MSG_KEY, m),
  take: () => {
    const m = sessionStorage.getItem(MSG_KEY);
    sessionStorage.removeItem(MSG_KEY);
    return m;
  },
};

export const pinPrompted = {
  get: (staffId: string) => localStorage.getItem(`workshop.pinPrompted.${staffId}`) === '1',
  set: (staffId: string) => localStorage.setItem(`workshop.pinPrompted.${staffId}`, '1'),
};
