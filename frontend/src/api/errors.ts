import { fmtPlate } from '../lib/format';

export const ERROR_CODES = [
  'NOT_STAFF', 'SESSION_INVALID', 'SESSION_EXPIRED', 'ROLE_NOT_ALLOWED', 'QUICK_SWITCH_NOT_ALLOWED',
  'PIN_INVALID', 'PIN_LOCKED', 'PIN_NOT_SET', 'VALIDATION', 'NOT_FOUND', 'PLATE_TAKEN', 'PHONE_TAKEN',
  'EMAIL_TAKEN', 'VERSION_CONFLICT', 'INVALID_TRANSITION', 'LAST_ADMIN', 'SELF_DEACTIVATE', 'NOT_CURRENT_OWNER',
  'RATE_LIMITED', 'NOT_UNDERSTOOD', 'AI_UNAVAILABLE',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number] | 'UNKNOWN';

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    public detail: string | null = null,
    public cause?: unknown,
  ) {
    super(code);
    this.name = 'AppError';
  }
}

/** PostgREST / supabase-js error -> AppError. The backend raises the code as the message. */
export function toAppError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  const err = e as { message?: string; details?: string | null } | null;
  const msg = err?.message ?? '';
  const code = (ERROR_CODES as readonly string[]).includes(msg) ? (msg as ErrorCode) : 'UNKNOWN';
  if (code === 'UNKNOWN') console.error('Unexpected error', e);
  return new AppError(code, err?.details ?? null, e);
}

const FIELD_LABELS: Record<string, string> = {
  name: 'name', phone: 'phone number', email: 'email', plate: 'licence plate', year: 'year', make: 'make',
  model: 'model', vin: 'VIN', odometer_km: 'odometer', concerns: 'concerns', signed_name: 'printed name',
  signature_path: 'signature', customer_id: 'customer', reasons: 'reason for visit', items: 'repair details',
  pickup_date: 'pick-up date', received_by: 'order received by', pin: 'PIN', roles: 'roles', reason: 'reason',
  quick_switch: 'switch without signing out', hst_rate: 'HST rate', labour_rate: 'labour rate', mode: 'connection',
};

export interface MessageContext {
  /** Text the person typed, for NOT_FOUND in the scanner. */
  query?: string;
  plate?: string;
}

/** User-facing message (SPEC-FRONTEND section 10). */
export function errorMessage(e: unknown, ctx: MessageContext = {}): string {
  const { code, detail } = toAppError(e);
  switch (code) {
    case 'NOT_STAFF': return "This Google account isn't set up as staff. Ask the shop owner to add you.";
    case 'SESSION_EXPIRED': return 'Signed out at midnight. Sign in to start the day.';
    case 'SESSION_INVALID': return 'This device was signed out. Sign in again.';
    case 'ROLE_NOT_ALLOWED': return "Your role can't do that.";
    case 'QUICK_SWITCH_NOT_ALLOWED': return 'Sign out and sign in again to use this role.';
    case 'PIN_INVALID': return 'Wrong PIN.';
    case 'PIN_LOCKED': return `Too many tries. Wait ${detail ?? '300'} seconds.`;
    case 'PIN_NOT_SET': return 'Set a PIN first.';
    case 'VALIDATION': return `Check the ${FIELD_LABELS[detail ?? ''] ?? detail ?? 'form'} field.`;
    case 'NOT_FOUND': return ctx.query !== undefined ? `No job found for “${ctx.query}”.` : 'That record no longer exists.';
    case 'PLATE_TAKEN': return `Another vehicle already has plate ${fmtPlate(detail ?? ctx.plate ?? '')}.`;
    case 'PHONE_TAKEN': return 'That phone number already belongs to a customer with this name.';
    case 'EMAIL_TAKEN': return 'Another staff member already uses that email.';
    case 'VERSION_CONFLICT': return 'Someone else changed this job. Reload to see the latest version.';
    case 'INVALID_TRANSITION': return 'This job has already moved on. Refreshing.';
    case 'LAST_ADMIN': return 'Keep at least one active administrator.';
    case 'SELF_DEACTIVATE': return "You can't deactivate your own account.";
    case 'NOT_CURRENT_OWNER': return "This customer isn't a current owner of the vehicle.";
    case 'RATE_LIMITED': return 'Too many requests just now. Wait a minute and try again, or fill in the form below.';
    case 'NOT_UNDERSTOOD': return "We couldn't find a vehicle problem in that. Add a little more detail, or fill in the form below.";
    case 'AI_UNAVAILABLE': return "We couldn't read that. Try again, or fill in the form below.";
    default: return 'Something went wrong. Try again.';
  }
}
