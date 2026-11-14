import type { AppConfig } from '../config/loadConfig';
import { assertSafeAuthMode } from '../config/loadConfig';
import type { AuthAdapter } from './types';

const KEY = 'workshop.devToken';

/** Local development only: tokens from backend/scripts/dev-token-server.ts. */
export class DevAuth implements AuthAdapter {
  private token: string | null;
  readonly emails: string[];
  private readonly url: string;

  constructor(cfg: AppConfig) {
    assertSafeAuthMode(cfg);
    this.url = cfg.devTokenUrl ?? 'http://localhost:8787/token';
    this.emails = cfg.devStaffEmails ?? [];
    this.token = sessionStorage.getItem(KEY);
  }

  async signIn(): Promise<void> {
    throw new Error('Choose a staff member to sign in.');
  }

  async signInAs(email: string): Promise<void> {
    const res = await fetch(`${this.url}?email=${encodeURIComponent(email)}`);
    if (!res.ok) throw new Error('Dev token server refused the sign-in.');
    const { access_token } = (await res.json()) as { access_token: string };
    this.token = access_token;
    sessionStorage.setItem(KEY, access_token);
  }

  async handleCallback(): Promise<void> {}

  async getAccessToken(): Promise<string | null> {
    return this.token;
  }

  async signOut(): Promise<void> {
    this.token = null;
    sessionStorage.removeItem(KEY);
  }
}
