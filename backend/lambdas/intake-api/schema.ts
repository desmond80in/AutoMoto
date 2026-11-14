import { z } from 'zod';

export const VisitRequest = z.object({
  text: z.string().trim().min(1).max(4000),
  vehicle: z.string().max(200).default(''),
  last_odometer_km: z.number().int().nonnegative().max(2_000_000).nullable().default(null),
});

export const RegistrationRequest = z.object({
  text: z.string().trim().min(1).max(3000),
});

const REASONS = ['mechanical', 'body', 'accident'] as const;
const URGENCY = ['routine', 'soon', 'unsafe'] as const;

const str = (max: number) =>
  z.preprocess((v) => (v == null ? '' : typeof v === 'string' ? v : String(v)), z.string()).transform((s) => s.trim().slice(0, max));
const strList = (maxItems: number, maxLen: number) =>
  z
    .preprocess((v) => (Array.isArray(v) ? v : []), z.array(z.unknown()))
    .transform((a) =>
      a
        .filter((x) => typeof x === 'string' || typeof x === 'number')
        .map((x) => String(x).trim().slice(0, maxLen))
        .filter(Boolean)
        .slice(0, maxItems),
    );

export const VisitResult = z
  .object({
    concerns: strList(8, 500),
    reasons: z
      .preprocess((v) => (Array.isArray(v) ? v : []), z.array(z.unknown()))
      .transform((a) => [...new Set(a.filter((x): x is (typeof REASONS)[number] => REASONS.includes(x as never)))]),
    odometer_km: z.preprocess((v) => {
      const n = typeof v === 'string' ? Number(v.replace(/[, ]/g, '')) : typeof v === 'number' ? v : NaN;
      return Number.isFinite(n) && n > 0 && n < 2_000_000 ? Math.round(n) : null;
    }, z.number().nullable()),
    warning_lights: strList(6, 120),
    when_it_happens: str(500),
    urgency: z.preprocess((v) => (URGENCY.includes(v as never) ? v : 'routine'), z.enum(URGENCY)),
    safety_note: str(500),
    summary: str(1000),
    questions: strList(2, 300),
  })
  .strip();
export type VisitResult = z.infer<typeof VisitResult>;

const digits = (s: string) => s.replace(/\D/g, '');
export const RegistrationResult = z
  .object({
    name: str(120),
    phone: str(40).transform((s) => {
      let d = digits(s);
      if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
      return d.length >= 7 && d.length <= 10 ? d : '';
    }),
    email: str(200).transform((s) => (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) ? s.toLowerCase() : '')),
    plate: str(20).transform((s) => {
      const p = s.toUpperCase().replace(/[^A-Z0-9]/g, '');
      return p.length >= 2 && p.length <= 8 ? p : '';
    }),
    year: str(10).transform((s) => {
      const y = Number(digits(s));
      return y >= 1970 && y <= new Date().getFullYear() + 1 ? String(y) : '';
    }),
    make: str(60),
    model: str(60),
    engine: str(60),
    vin: str(30).transform((s) => {
      const v = s.toUpperCase().replace(/[^A-Z0-9]/g, '');
      return v.length === 17 ? v : '';
    }),
  })
  .strip();
export type RegistrationResult = z.infer<typeof RegistrationResult>;

/** JSON Schemas sent as `output_config.format` (structured outputs). */
const strArr = { type: 'array', items: { type: 'string' } };
export const VISIT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['concerns', 'reasons', 'odometer_km', 'warning_lights', 'when_it_happens', 'urgency', 'safety_note', 'summary', 'questions'],
  properties: {
    concerns: strArr,
    reasons: { type: 'array', items: { type: 'string', enum: [...REASONS] } },
    odometer_km: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    warning_lights: strArr,
    when_it_happens: { type: 'string' },
    urgency: { type: 'string', enum: [...URGENCY] },
    safety_note: { type: 'string' },
    summary: { type: 'string' },
    questions: strArr,
  },
} as const;
const regKeys = ['name', 'phone', 'email', 'plate', 'year', 'make', 'model', 'engine', 'vin'] as const;
export const REGISTRATION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [...regKeys],
  properties: Object.fromEntries(regKeys.map((k) => [k, { type: 'string' }])),
} as const;

/** Parse a model reply as JSON, tolerating a ``` code fence or text around the object. */
export function parseModelJson(text: string): unknown {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) t = fence[1].trim();
  try {
    return JSON.parse(t);
  } catch {
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(t.slice(start, end + 1));
    throw new Error('Reply is not JSON');
  }
}
