import { describe, expect, it } from 'vitest';
import { AppError, errorMessage, toAppError } from '../src/api/errors';
import type { KioskLookup } from '../src/api/types';
import { canonMake, canonModel, yearOptions } from '../src/data/catalog';
import { initialKiosk, kioskReducer } from '../src/features/kiosk/reducer';
import { switchOption } from '../src/session/roles';
import { assertSafeAuthMode, ConfigSchema } from '../src/config/loadConfig';

describe('vehicle catalog', () => {
  it('matches makes with aliases', () => {
    expect(canonMake('chevy')).toBe('Chevrolet');
    expect(canonMake('VW')).toBe('Volkswagen');
    expect(canonMake('mercedes')).toBe('Mercedes-Benz');
    expect(canonMake('honda')).toBe('Honda');
    expect(canonMake('Zastava')).toBeNull();
  });
  it('matches models loosely', () => {
    expect(canonModel('Honda', 'crv')).toBe('CR-V');
    expect(canonModel('Ford', 'f150')).toBe('F-150');
    expect(canonModel('Mazda', 'Mazda 3')).toBe('Mazda3');
    expect(canonModel('Honda', 'Model T')).toBeNull();
  });
  it('years from next year down to 1970', () => {
    const ys = yearOptions(new Date(2026, 5, 1));
    expect(ys[0]).toBe(2027);
    expect(ys.at(-1)).toBe(1970);
  });
});

describe('kiosk reducer', () => {
  const v = { id: 'v1', plate: 'CAAB214', year: 2019, make: 'Honda', model: 'CR-V', role: 'owner' as const, last_visit_at: null, last_odometer_km: 52870 };
  it('customer match -> pick vehicle -> visit', () => {
    const r: KioskLookup = { match: 'customer', customer: { id: 'c1', first_name: 'Priya', phone_last4: '0142' }, vehicles: [v] };
    let s = kioskReducer(initialKiosk(), { type: 'lookup', result: r });
    expect(s.step).toBe('pickVehicle');
    expect(s.customer?.firstName).toBe('Priya');
    s = kioskReducer(s, { type: 'chooseVehicle', vehicle: v });
    expect(s.step).toBe('visit');
    expect(s.vehicle?.last_odometer_km).toBe(52870);
    s = kioskReducer(s, { type: 'changeVehicle' });
    expect(s.step).toBe('pickVehicle');
  });
  it('several customers -> pick customer; none -> not found', () => {
    expect(kioskReducer(initialKiosk(), { type: 'lookup', result: { match: 'customers', customers: [] } }).step).toBe('pickCustomer');
    expect(kioskReducer(initialKiosk(), { type: 'lookup', result: { match: 'none' } }).step).toBe('notFound');
  });
  it('vehicle match -> who are you -> not listed -> link owner', () => {
    const owner = { customer_id: 'c3', masked_name: 'Marco R.', phone_last4: '0110', role: 'owner' as const };
    let s = kioskReducer(initialKiosk(), { type: 'lookup', result: { match: 'vehicle', vehicle: v, owners: [owner] } });
    expect(s.step).toBe('whoAreYou');
    expect(kioskReducer(s, { type: 'chooseOwner', owner }).customer).toEqual({ id: 'c3', firstName: 'Marco', phoneLast4: '0110' });
    s = kioskReducer(s, { type: 'notListed' });
    expect(s.step).toBe('linkOwner');
    expect(s.othersOwn).toBe(true);
    expect(s.customer).toBeNull();
  });
  it('register -> link_owner when the plate belongs to someone else', () => {
    const s = kioskReducer(initialKiosk(), {
      type: 'vehicleSaved',
      customer: { id: 'c9', firstName: 'Lena', phoneLast4: '0101' },
      vehicle: { id: 'v1', plate: 'CAAB214', year: null, make: 'Honda', model: 'CR-V', last_odometer_km: null },
      next: 'link_owner',
    });
    expect(s.step).toBe('linkOwner');
    expect(s.othersOwn).toBe(true);
  });
  it('reset clears everything and bumps the run counter', () => {
    const s = kioskReducer({ ...initialKiosk(3), step: 'visit', query: '416' }, { type: 'reset' });
    expect(s).toEqual(initialKiosk(4));
  });
});

describe('error mapping', () => {
  it('maps backend codes to messages', () => {
    expect(errorMessage({ message: 'PIN_INVALID' })).toBe('Wrong PIN.');
    expect(errorMessage({ message: 'PIN_LOCKED', details: '120' })).toBe('Too many tries. Wait 120 seconds.');
    expect(errorMessage({ message: 'VALIDATION', details: 'plate' })).toBe('Check the licence plate field.');
    expect(errorMessage({ message: 'NOT_FOUND' }, { query: '123' })).toBe('No job found for “123”.');
    expect(errorMessage({ message: 'PLATE_TAKEN', details: 'BXRT552' })).toBe('Another vehicle already has plate BXRT 552.');
    expect(errorMessage({ message: 'LAST_ADMIN' })).toBe('Keep at least one active administrator.');
    expect(errorMessage(new AppError('RATE_LIMITED'))).toMatch(/^Too many requests just now/);
  });
  it('unknown errors get the generic message', () => {
    const orig = console.error;
    console.error = () => undefined;
    expect(toAppError(new Error('boom')).code).toBe('UNKNOWN');
    expect(errorMessage({ message: 'relation does not exist' })).toBe('Something went wrong. Try again.');
    console.error = orig;
  });
});

describe('quick switch decision', () => {
  const owner = { roles: ['kiosk', 'frontdesk', 'workshop', 'display', 'admin'] as const, quick_switch: ['frontdesk', 'workshop', 'admin'] as const };
  const s = { roles: [...owner.roles], quick_switch: [...owner.quick_switch] };
  it('allows only when both roles are in quick_switch', () => {
    expect(switchOption(s, 'admin', 'admin')).toBe('current');
    expect(switchOption(s, 'admin', 'frontdesk')).toBe('switch');
    expect(switchOption(s, 'admin', 'kiosk')).toBe('signout');
    expect(switchOption(s, 'kiosk', 'admin')).toBe('signout');
    expect(switchOption({ roles: ['frontdesk', 'kiosk'], quick_switch: [] }, 'frontdesk', 'kiosk')).toBe('signout');
  });
});

describe('config', () => {
  const base = {
    stage: 'dev', region: 'ca-central-1', supabaseUrl: 'http://127.0.0.1:54321', supabasePublishableKey: 'k',
    cognito: { userPoolId: 'p', userPoolClientId: 'c', domain: 'd', redirectSignIn: ['x'], redirectSignOut: ['y'] },
    apiUrl: 'http://localhost:8788', authMode: 'dev',
  };
  it('dev auth only with stage dev and a local Supabase', () => {
    expect(() => assertSafeAuthMode(ConfigSchema.parse(base))).not.toThrow();
    expect(() => assertSafeAuthMode(ConfigSchema.parse({ ...base, stage: 'pov' }))).toThrow();
    expect(() => assertSafeAuthMode(ConfigSchema.parse({ ...base, supabaseUrl: 'https://x.supabase.co' }))).toThrow();
    expect(() => assertSafeAuthMode(ConfigSchema.parse({ ...base, authMode: 'cognito', stage: 'pov', supabaseUrl: 'https://x.supabase.co' }))).not.toThrow();
  });
});
