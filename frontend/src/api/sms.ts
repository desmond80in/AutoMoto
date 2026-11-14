import type { AuthAdapter } from '../auth/types';
import { AppError, ERROR_CODES, type ErrorCode } from './errors';
import { SmsSendResult, type SmsKind } from './types';

export interface SmsRequest {
  session_id: string;
  work_order_id: string;
  kind: SmsKind;
  body: string;
}

/** POST /sms/send on the HTTP API (sms-api Lambda). The database decides who may text whom. */
export class SmsApi {
  constructor(
    private readonly apiUrl: string,
    private readonly auth: AuthAdapter,
  ) {}

  async send(req: SmsRequest): Promise<SmsSendResult> {
    const token = await this.auth.getAccessToken();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20_000);
    try {
      const res = await fetch(`${this.apiUrl.replace(/\/$/, '')}/sms/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(req),
        signal: ctrl.signal,
      });
      const data = (await res.json().catch(() => null)) as { error?: string; detail?: string | null } | null;
      if (!res.ok) {
        const code = (ERROR_CODES as readonly string[]).includes(data?.error ?? '') ? (data!.error as ErrorCode) : 'SMS_UNAVAILABLE';
        throw new AppError(code, data?.detail ?? null);
      }
      const r = SmsSendResult.safeParse(data);
      if (!r.success) throw new AppError('SMS_UNAVAILABLE');
      return r.data;
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw new AppError('SMS_UNAVAILABLE', null, e);
    } finally {
      clearTimeout(timer);
    }
  }
}
