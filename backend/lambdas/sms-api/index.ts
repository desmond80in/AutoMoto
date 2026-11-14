import { PinpointSMSVoiceV2Client, SendTextMessageCommand } from '@aws-sdk/client-pinpoint-sms-voice-v2';
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { z } from 'zod';
import { log } from '../shared/log';
import { rest } from '../shared/staff';

type Event = APIGatewayProxyEventV2WithJWTAuthorizer;
type Result = APIGatewayProxyStructuredResultV2;

/** Codes sms_queue can raise that we pass through to the client unchanged. */
const RPC_CODES: Record<string, number> = {
  VALIDATION: 400,
  SESSION_INVALID: 401,
  SESSION_EXPIRED: 401,
  NOT_STAFF: 403,
  ROLE_NOT_ALLOWED: 403,
  SMS_NOT_ALLOWED: 403,
  NOT_FOUND: 404,
  INVALID_TRANSITION: 409,
  RATE_LIMITED: 429,
};

/** Any 8-4-4-4-12 hex id (seed and demo rows use non-RFC ids). */
const Id = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

export const SendRequest = z.object({
  session_id: Id,
  work_order_id: Id,
  kind: z.enum(['ready', 'approval', 'waiting_parts', 'custom']),
  body: z.string().trim().min(1).max(480),
});

const Queued = z.object({
  id: Id,
  to: z.string().regex(/^\+1[0-9]{10}$/),
  body: z.string(),
  customer_id: Id,
});

export type Outcome = { status: 'sent'; messageId: string } | { status: 'failed'; error: string };

/** Sends one text. Swapped out in tests. */
export interface SmsSender {
  send(to: string, body: string): Promise<Outcome>;
}

/** Short, customer-free reason for the staff UI and logs. */
export function failureReason(e: unknown): string {
  const err = e as { name?: string; Reason?: string; reason?: string };
  const reason = err.Reason ?? err.reason ?? '';
  if (reason === 'DESTINATION_PHONE_NUMBER_OPTED_OUT') return 'opted_out';
  if (reason === 'DESTINATION_PHONE_NUMBER_NOT_VERIFIED') return 'not_verified';
  if (err.name === 'ServiceQuotaExceededException') return 'spend_limit';
  if (err.name === 'ThrottlingException') return 'throttled';
  return 'provider_error';
}

let awsSender: SmsSender | undefined;
function defaultSender(): SmsSender | null {
  const origination = process.env.SMS_ORIGINATION_IDENTITY?.trim();
  if (!origination) return null;
  if (awsSender) return awsSender;
  const client = new PinpointSMSVoiceV2Client({ maxAttempts: 2 });
  awsSender = {
    async send(to, body) {
      try {
        const out = await client.send(
          new SendTextMessageCommand({
            DestinationPhoneNumber: to,
            OriginationIdentity: origination,
            MessageBody: body,
            MessageType: 'TRANSACTIONAL',
            ConfigurationSetName: process.env.SMS_CONFIGURATION_SET || undefined,
          }),
        );
        return { status: 'sent', messageId: out.MessageId ?? '' };
      } catch (e) {
        return { status: 'failed', error: failureReason(e) };
      }
    },
  };
  return awsSender;
}

const json = (statusCode: number, body: unknown): Result => ({
  statusCode,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify(body),
});

class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    public detail: string | null = null,
  ) {
    super(code);
  }
}

function parseBody(event: Event): unknown {
  if (!event.body) return {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'VALIDATION');
  }
}

function supabaseUrl(): string {
  const url = process.env.SUPABASE_URL;
  if (!url) throw new Error('Missing SUPABASE_URL');
  return url.replace(/\/$/, '');
}

/** Calls sms_queue as the signed-in staff member, so the database applies session, role and consent rules. */
async function queue(token: string, req: z.infer<typeof SendRequest>): Promise<z.infer<typeof Queued>> {
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new Error('Missing SUPABASE_PUBLISHABLE_KEY');
  const res = await fetch(`${supabaseUrl()}/rest/v1/rpc/sms_queue`, {
    method: 'POST',
    headers: { apikey: key, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      p_session: req.session_id,
      p_work_order_id: req.work_order_id,
      p_kind: req.kind,
      p_body: req.body,
    }),
  });
  const data = (await res.json().catch(() => null)) as { message?: string; details?: string | null } | null;
  if (!res.ok) {
    const code = data?.message ?? '';
    if (code in RPC_CODES) throw new HttpError(RPC_CODES[code]!, code, data?.details ?? null);
    if (res.status === 401) throw new HttpError(401, 'SESSION_INVALID');
    throw new Error(`sms_queue failed: ${res.status}`);
  }
  const parsed = Queued.safeParse(data);
  if (!parsed.success) throw new Error('sms_queue: unexpected response');
  return parsed.data;
}

/** Records the outcome with the secret key (clients have no access to sms_messages). */
async function record(
  id: string,
  customerId: string,
  outcome: Outcome | { status: 'simulated' },
): Promise<void> {
  await rest(`sms_messages?id=eq.${encodeURIComponent(id)}&status=eq.queued`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      status: outcome.status,
      sent_at: outcome.status === 'failed' ? null : new Date().toISOString(),
      provider_message_id: outcome.status === 'sent' ? outcome.messageId : null,
      error: outcome.status === 'failed' ? outcome.error : null,
    }),
  });
  // The carrier says the customer replied STOP: honour it in our records too.
  if (outcome.status === 'failed' && outcome.error === 'opted_out') {
    await rest(`customers?id=eq.${encodeURIComponent(customerId)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        sms_opt_in: false,
        sms_opt_in_at: new Date().toISOString(),
        sms_opt_in_source: 'kiosk',
      }),
    });
  }
}

export async function handle(event: Event, sender?: SmsSender | null): Promise<Result> {
  const started = Date.now();
  const route = event.routeKey ?? `${event.requestContext.http.method} ${event.rawPath}`;
  const staffId = String(event.requestContext.authorizer?.jwt?.claims?.staff_id ?? '');
  let outcome = 'ok';
  try {
    if (route !== 'POST /sms/send') {
      outcome = 'not_found';
      return json(404, { error: 'NOT_FOUND' });
    }
    const token = (event.headers?.authorization ?? event.headers?.Authorization ?? '').replace(
      /^Bearer\s+/i,
      '',
    );
    if (!staffId || !token) throw new HttpError(401, 'SESSION_INVALID');
    const req = SendRequest.safeParse(parseBody(event));
    if (!req.success) throw new HttpError(400, 'VALIDATION', String(req.error.issues[0]?.path[0] ?? 'body'));

    const q = await queue(token, req.data);
    const s = sender === undefined ? defaultSender() : sender;
    const result = s ? await s.send(q.to, q.body) : ({ status: 'simulated' } as const);
    await record(q.id, q.customer_id, result);
    outcome = result.status === 'failed' ? `failed:${result.error}` : result.status;
    return json(200, {
      id: q.id,
      status: result.status,
      error: result.status === 'failed' ? result.error : null,
    });
  } catch (e) {
    if (e instanceof HttpError) {
      outcome = e.code;
      return json(e.status, { error: e.code, detail: e.detail });
    }
    outcome = 'SMS_UNAVAILABLE';
    log('error', 'sms failed', { error: (e as Error).name, message: (e as Error).message.slice(0, 80) });
    return json(502, { error: 'SMS_UNAVAILABLE' });
  } finally {
    // Never log tokens, phone numbers or message text.
    log('info', 'sms request', {
      request_id: event.requestContext.requestId,
      route,
      staff_id: staffId || undefined,
      latency_ms: Date.now() - started,
      outcome,
    });
  }
}

export const handler = (event: Event): Promise<Result> => handle(event);
