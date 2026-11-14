import type { AuthAdapter } from '../auth/types';
import { AppError, type ErrorCode } from './errors';
import { RegistrationIntake, VisitIntake } from './types';

const STATUS_CODES: Record<number, ErrorCode> = { 400: 'VALIDATION', 403: 'ROLE_NOT_ALLOWED', 422: 'NOT_UNDERSTOOD', 429: 'RATE_LIMITED' };

export class IntakeApi {
  constructor(
    private readonly apiUrl: string,
    private readonly auth: AuthAdapter,
  ) {}

  private async post(path: string, body: unknown): Promise<unknown> {
    const token = await this.auth.getAccessToken();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25_000);
    try {
      const res = await fetch(`${this.apiUrl.replace(/\/$/, '')}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new AppError(STATUS_CODES[res.status] ?? 'AI_UNAVAILABLE');
      return await res.json();
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw new AppError('AI_UNAVAILABLE', null, e);
    } finally {
      clearTimeout(timer);
    }
  }

  async visit(text: string, vehicle: string, lastOdometerKm: number | null): Promise<VisitIntake> {
    const r = VisitIntake.safeParse(await this.post('/intake/visit', { text, vehicle, last_odometer_km: lastOdometerKm }));
    if (!r.success) throw new AppError('AI_UNAVAILABLE');
    return r.data;
  }

  async registration(text: string): Promise<RegistrationIntake> {
    const r = RegistrationIntake.safeParse(await this.post('/intake/registration', { text }));
    if (!r.success) throw new AppError('AI_UNAVAILABLE');
    return r.data;
  }
}
