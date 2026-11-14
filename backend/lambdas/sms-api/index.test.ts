import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { failureReason, handle, type SmsSender } from './index';

const WO = '00000000-0000-0000-0000-0000000e0010';
const SESSION = '11111111-1111-4111-8111-111111111111';
const MSG = '22222222-2222-4222-8222-222222222222';
const CUSTOMER = '00000000-0000-0000-0000-00000000c004';

const event = (
  body: unknown,
  opts: { route?: string; token?: string | null } = {},
): APIGatewayProxyEventV2WithJWTAuthorizer =>
  ({
    routeKey: opts.route ?? 'POST /sms/send',
    rawPath: '/sms/send',
    headers: opts.token === null ? {} : { authorization: `Bearer ${opts.token ?? 'user-token'}` },
    body: JSON.stringify(body),
    isBase64Encoded: false,
    requestContext: {
      requestId: 'req-1',
      http: { method: 'POST' },
      authorizer: { jwt: { claims: { staff_id: 'staff-1', app_roles: 'frontdesk' }, scopes: [] } },
    },
  }) as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;

const good = {
  session_id: SESSION,
  work_order_id: WO,
  kind: 'ready',
  body: 'Demo Auto Repair: Your CX-5 is ready.',
};

type Call = { url: string; init: RequestInit };
let calls: Call[];

function stub(rpc: { status: number; body: unknown }) {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url.includes('/rpc/sms_queue')) return Response.json(rpc.body, { status: rpc.status });
      return new Response(null, { status: 204 });
    }),
  );
}

const queued = { status: 200, body: { id: MSG, to: '+19055550177', body: good.body, customer_id: CUSTOMER } };
const sender = (o: Awaited<ReturnType<SmsSender['send']>>) => ({ send: vi.fn(async () => o) });
const patchBody = (path: string) =>
  JSON.parse(String(calls.find((c) => c.url.includes(path) && c.init.method === 'PATCH')!.init.body));

beforeEach(() => {
  process.env.SUPABASE_URL = 'http://supabase.test';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.unstubAllGlobals());

describe('sms-api', () => {
  it('queues as the user, sends, and records the result with the secret key', async () => {
    stub(queued);
    const s = sender({ status: 'sent', messageId: 'aws-1' });
    const res = await handle(event(good), s);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(String(res.body))).toEqual({ id: MSG, status: 'sent', error: null });
    const rpc = calls[0]!;
    expect(rpc.url).toBe('http://supabase.test/rest/v1/rpc/sms_queue');
    expect((rpc.init.headers as Record<string, string>).authorization).toBe('Bearer user-token');
    expect((rpc.init.headers as Record<string, string>).apikey).toBe('sb_publishable_test');
    expect(JSON.parse(String(rpc.init.body))).toEqual({
      p_session: SESSION,
      p_work_order_id: WO,
      p_kind: 'ready',
      p_body: good.body,
    });
    expect(s.send).toHaveBeenCalledWith('+19055550177', good.body);
    const patch = calls[1]!;
    expect(patch.url).toBe(`http://supabase.test/rest/v1/sms_messages?id=eq.${MSG}&status=eq.queued`);
    expect((patch.init.headers as Record<string, string>).apikey).toBe('sb_secret_test');
    expect(patchBody('sms_messages')).toMatchObject({
      status: 'sent',
      provider_message_id: 'aws-1',
      error: null,
    });
  });

  it('records "simulated" when no origination number is configured', async () => {
    stub(queued);
    const res = await handle(event(good), null);
    expect(JSON.parse(String(res.body)).status).toBe('simulated');
    expect(patchBody('sms_messages')).toMatchObject({ status: 'simulated' });
  });

  it('marks the customer opted out when the carrier says STOP', async () => {
    stub(queued);
    const res = await handle(event(good), sender({ status: 'failed', error: 'opted_out' }));
    expect(JSON.parse(String(res.body))).toEqual({ id: MSG, status: 'failed', error: 'opted_out' });
    expect(calls.some((c) => c.url === `http://supabase.test/rest/v1/customers?id=eq.${CUSTOMER}`)).toBe(
      true,
    );
    expect(patchBody('customers')).toMatchObject({ sms_opt_in: false });
  });

  it('passes database errors through', async () => {
    stub({ status: 400, body: { message: 'SMS_NOT_ALLOWED', details: null } });
    const s = sender({ status: 'sent', messageId: 'x' });
    const res = await handle(event(good), s);
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(String(res.body)).error).toBe('SMS_NOT_ALLOWED');
    expect(s.send).not.toHaveBeenCalled();
  });

  it('rejects bad input, missing token and unknown routes', async () => {
    stub(queued);
    expect((await handle(event({ ...good, kind: 'spam' }), null)).statusCode).toBe(400);
    expect((await handle(event({ ...good, body: 'x'.repeat(481) }), null)).statusCode).toBe(400);
    expect((await handle(event(good, { token: null }), null)).statusCode).toBe(401);
    expect((await handle(event(good, { route: 'POST /sms/blast' }), null)).statusCode).toBe(404);
    expect(calls).toHaveLength(0);
  });

  it('does not log tokens, phone numbers or message text', async () => {
    stub(queued);
    const spy = vi.spyOn(console, 'log');
    await handle(event(good), sender({ status: 'sent', messageId: 'aws-1' }));
    const logged = spy.mock.calls.flat().join(' ');
    expect(logged).not.toContain('user-token');
    expect(logged).not.toContain('9055550177');
    expect(logged).not.toContain('ready.');
  });
});

describe('failureReason', () => {
  it('maps provider errors to short codes', () => {
    expect(failureReason({ name: 'ConflictException', Reason: 'DESTINATION_PHONE_NUMBER_OPTED_OUT' })).toBe(
      'opted_out',
    );
    expect(
      failureReason({ name: 'ValidationException', Reason: 'DESTINATION_PHONE_NUMBER_NOT_VERIFIED' }),
    ).toBe('not_verified');
    expect(failureReason({ name: 'ServiceQuotaExceededException' })).toBe('spend_limit');
    expect(failureReason(new Error('boom'))).toBe('provider_error');
  });
});
