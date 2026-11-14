import Anthropic from '@anthropic-ai/sdk';
import type { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { log } from '../shared/log';
import { getSecret } from '../shared/secrets';
import { registrationPrompt, visitPrompt } from './prompts';
import { allow } from './rate-limit';
import {
  parseModelJson,
  REGISTRATION_JSON_SCHEMA,
  RegistrationRequest,
  RegistrationResult,
  VISIT_JSON_SCHEMA,
  VisitRequest,
  VisitResult,
} from './schema';

type Event = APIGatewayProxyEventV2WithJWTAuthorizer;
type Result = APIGatewayProxyStructuredResultV2;
export type ErrorCode = 'VALIDATION' | 'ROLE_NOT_ALLOWED' | 'NOT_UNDERSTOOD' | 'RATE_LIMITED' | 'AI_UNAVAILABLE';

const STATUS: Record<ErrorCode, number> = {
  VALIDATION: 400,
  ROLE_NOT_ALLOWED: 403,
  NOT_UNDERSTOOD: 422,
  RATE_LIMITED: 429,
  AI_UNAVAILABLE: 502,
};

export class IntakeError extends Error {
  constructor(public code: ErrorCode) {
    super(code);
  }
}

const json = (statusCode: number, body: unknown): Result => ({
  statusCode,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify(body),
});

/** Minimal surface of the Anthropic client we use, so tests can inject a fake. */
export interface ModelClient {
  complete(prompt: string, schema: Record<string, unknown>): Promise<string>;
}

let defaultClient: ModelClient | undefined;
async function anthropicClient(): Promise<ModelClient> {
  if (defaultClient) return defaultClient;
  const client = new Anthropic({ apiKey: await getSecret('ANTHROPIC_API_KEY'), maxRetries: 1, timeout: 15_000 });
  defaultClient = {
    async complete(prompt, schema) {
      const res = await client.messages.create({
        model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
        max_tokens: 2000,
        output_config: { effort: 'low', format: { type: 'json_schema', schema } },
        messages: [{ role: 'user', content: prompt }],
      });
      if (res.stop_reason === 'refusal') throw new IntakeError('NOT_UNDERSTOOD');
      if (res.stop_reason === 'max_tokens') throw new IntakeError('AI_UNAVAILABLE');
      const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
      if (!text) throw new IntakeError('AI_UNAVAILABLE');
      return text;
    },
  };
  return defaultClient;
}

export function hasRole(event: Event, role: string): boolean {
  const roles = String(event.requestContext.authorizer?.jwt?.claims?.app_roles ?? '');
  return roles.split(/\s+/).includes(role);
}

function body(event: Event): unknown {
  if (!event.body) return {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  try {
    return JSON.parse(raw);
  } catch {
    throw new IntakeError('VALIDATION');
  }
}

async function ask(client: ModelClient, prompt: string, schema: Record<string, unknown>): Promise<unknown> {
  let text: string;
  try {
    text = await client.complete(prompt, schema);
  } catch (e) {
    if (e instanceof IntakeError) throw e;
    throw new IntakeError('AI_UNAVAILABLE');
  }
  try {
    return parseModelJson(text);
  } catch {
    throw new IntakeError('AI_UNAVAILABLE');
  }
}

export async function extractVisit(input: unknown, client: ModelClient): Promise<VisitResult> {
  const req = VisitRequest.safeParse(input);
  if (!req.success) throw new IntakeError('VALIDATION');
  const raw = await ask(client, visitPrompt(req.data.text, req.data.vehicle, req.data.last_odometer_km), VISIT_JSON_SCHEMA);
  const out = VisitResult.safeParse(raw);
  if (!out.success) throw new IntakeError('AI_UNAVAILABLE');
  if (!out.data.concerns.length) throw new IntakeError('NOT_UNDERSTOOD');
  return out.data;
}

export async function extractRegistration(input: unknown, client: ModelClient): Promise<RegistrationResult> {
  const req = RegistrationRequest.safeParse(input);
  if (!req.success) throw new IntakeError('VALIDATION');
  const raw = await ask(client, registrationPrompt(req.data.text), REGISTRATION_JSON_SCHEMA);
  const out = RegistrationResult.safeParse(raw);
  if (!out.success) throw new IntakeError('AI_UNAVAILABLE');
  if (Object.values(out.data).every((v) => v === '')) throw new IntakeError('NOT_UNDERSTOOD');
  return out.data;
}

export async function handle(event: Event, client?: ModelClient): Promise<Result> {
  const started = Date.now();
  const route = event.routeKey ?? `${event.requestContext.http.method} ${event.rawPath}`;
  const staffId = String(event.requestContext.authorizer?.jwt?.claims?.staff_id ?? '');
  let outcome = 'ok';
  try {
    if (route === 'GET /health') return json(200, { ok: true });
    if (route !== 'POST /intake/visit' && route !== 'POST /intake/registration') {
      outcome = 'not_found';
      return json(404, { error: 'NOT_FOUND' });
    }
    if (!staffId || !hasRole(event, 'kiosk')) throw new IntakeError('ROLE_NOT_ALLOWED');
    const input = body(event);
    if (!(await allow(staffId))) throw new IntakeError('RATE_LIMITED');
    const c = client ?? (await anthropicClient());
    const result = route === 'POST /intake/visit' ? await extractVisit(input, c) : await extractRegistration(input, c);
    return json(200, result);
  } catch (e) {
    const code: ErrorCode = e instanceof IntakeError ? e.code : 'AI_UNAVAILABLE';
    outcome = code;
    if (!(e instanceof IntakeError)) log('error', 'intake failed', { error: (e as Error).name });
    return json(STATUS[code], { error: code });
  } finally {
    // Never log customer text or tokens.
    log('info', 'intake request', {
      request_id: event.requestContext.requestId,
      route,
      staff_id: staffId || undefined,
      latency_ms: Date.now() - started,
      outcome,
    });
  }
}

export const handler = (event: Event): Promise<Result> => handle(event);
