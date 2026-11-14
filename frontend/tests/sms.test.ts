import { describe, expect, it } from 'vitest';
import { smsSegments, smsTemplate, type SmsContext } from '../src/lib/sms';

const ctx: SmsContext = {
  shopName: 'Demo Auto Repair',
  shopPhone: '9055550100',
  customerName: 'Mei Lin Chen',
  vehicle: { year: 2019, make: 'Mazda', model: 'CX-5' },
  total: 213.62,
};

describe('smsTemplate', () => {
  it('ready: names the shop, customer, vehicle and total', () => {
    expect(smsTemplate('ready', ctx)).toBe(
      'Demo Auto Repair: Hi Mei, your 2019 Mazda CX-5 is ready for pickup. Total: $213.62 incl. HST. Questions? Call us at (905) 555-0100. Reply STOP to opt out.',
    );
  });
  it('ready without a total or shop phone', () => {
    expect(smsTemplate('ready', { ...ctx, total: 0, shopPhone: null })).toBe(
      'Demo Auto Repair: Hi Mei, your 2019 Mazda CX-5 is ready for pickup. Reply STOP to opt out.',
    );
  });
  it('approval includes the note', () => {
    expect(smsTemplate('approval', { ...ctx, approvalNote: 'Rear rotors are worn too.' })).toBe(
      'Demo Auto Repair: Hi Mei, we found something on your 2019 Mazda CX-5 that needs your OK before we continue: Rear rotors are worn too. Please call us at (905) 555-0100. Reply STOP to opt out.',
    );
  });
  it('waiting on parts and custom', () => {
    expect(smsTemplate('waiting_parts', { ...ctx, shopPhone: null })).toBe(
      "Demo Auto Repair: Hi Mei, your 2019 Mazda CX-5 is waiting on parts. We'll text you when it's ready. Reply STOP to opt out.",
    );
    expect(smsTemplate('custom', ctx)).toBe('Demo Auto Repair: Hi Mei, ');
  });
  it('fits templates in two parts', () => {
    for (const k of ['ready', 'approval', 'waiting_parts'] as const) expect(smsSegments(smsTemplate(k, ctx)).segments).toBeLessThanOrEqual(2);
  });
});

describe('smsSegments', () => {
  it('counts GSM and Unicode parts', () => {
    expect(smsSegments('')).toEqual({ segments: 0, unicode: false });
    expect(smsSegments('x'.repeat(160))).toEqual({ segments: 1, unicode: false });
    expect(smsSegments('x'.repeat(161))).toEqual({ segments: 2, unicode: false });
    expect(smsSegments('€'.repeat(80))).toEqual({ segments: 1, unicode: false });
    expect(smsSegments('’'.repeat(70))).toEqual({ segments: 1, unicode: true });
    expect(smsSegments('’'.repeat(71))).toEqual({ segments: 2, unicode: true });
  });
});
