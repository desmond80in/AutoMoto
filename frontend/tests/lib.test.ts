import { describe, expect, it, vi } from 'vitest';
import { ago, firstName, fmtDate, fmtPhone, fmtPlate, fmtTime, km, maskName, maskPhone, money } from '../src/lib/format';
import { isValidPhone, isValidPlate, isValidVin, normPhone, normPlate, parseNumber } from '../src/lib/normalize';
import { scheduleAt } from '../src/lib/time';
import { computeTotals } from '../src/lib/totals';

describe('normalise (same rules as the backend)', () => {
  it('phone: digits only, leading 1 stripped from 11 digits', () => {
    expect(normPhone('(416) 555-0142')).toBe('4165550142');
    expect(normPhone('1-416-555-0142')).toBe('4165550142');
    expect(normPhone('416 555 0142 ext')).toBe('4165550142');
    expect(isValidPhone('416 555 014')).toBe(false);
  });
  it('plate: uppercase A-Z0-9 only', () => {
    expect(normPlate('caab 214')).toBe('CAAB214');
    expect(normPlate('ab-12')).toBe('AB12');
    expect(isValidPlate('A')).toBe(false);
    expect(isValidPlate('ABCDEFGHI')).toBe(false);
  });
  it('vin: blank or 17', () => {
    expect(isValidVin('')).toBe(true);
    expect(isValidVin('2hkrw2h85kh601234')).toBe(true);
    expect(isValidVin('123')).toBe(false);
  });
  it('numbers typed by people', () => {
    expect(parseNumber('52 870')).toBe(52870);
    expect(parseNumber('$1,234.50')).toBe(1234.5);
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('abc')).toBeNull();
  });
});

describe('format', () => {
  it('phone', () => {
    expect(fmtPhone('4165550142')).toBe('(416) 555-0142');
    expect(maskPhone('0142')).toBe('(•••) •••-0142');
  });
  it('plate: ABCD 123 only for 4 letters + 3 digits', () => {
    expect(fmtPlate('CAAB214')).toBe('CAAB 214');
    expect(fmtPlate('AB12')).toBe('AB12');
  });
  it('money in CAD, distance, dates', () => {
    expect(money(298.89)).toBe('$298.89');
    expect(money(1234.5)).toBe('$1,234.50');
    expect(km(52870)).toBe('52,870 km');
    expect(km(null)).toBe('—');
    expect(fmtDate('2026-11-13')).toBe('Nov 13, 2026');
    expect(fmtTime(new Date(2026, 10, 13, 9, 12))).toBe('9:12 a.m.');
  });
  it('relative time', () => {
    const now = Date.UTC(2026, 10, 13, 12, 0);
    expect(ago(new Date(now - 30_000).toISOString(), now)).toBe('just now');
    expect(ago(new Date(now - 12 * 60_000).toISOString(), now)).toBe('12 min ago');
    expect(ago(new Date(now - 3 * 3600_000).toISOString(), now)).toBe('3 h ago');
    expect(ago(new Date(now - 26 * 3600_000).toISOString(), now)).toBe('yesterday');
  });
  it('names', () => {
    expect(maskName('Priya Sharma')).toBe('Priya S.');
    expect(maskName('Mei Lin Chen')).toBe('Mei C.');
    expect(firstName('  Priya Sharma ')).toBe('Priya');
  });
});

describe('totals (HST 13%)', () => {
  it('matches the backend view', () => {
    const t = computeTotals(
      [
        { type: 'part', qty: 1, unit_price: 96.5 },
        { type: 'labour', qty: 1.2, unit_price: 140 },
      ],
      [{ estimate: 420 }, { estimate: null }],
      0.13,
    );
    expect(t).toEqual({ parts: 96.5, labour: 168, tax: 34.39, total: 298.89, estimate: 420 });
  });
  it('treats blanks as zero', () => {
    expect(computeTotals([{ type: 'part', qty: '', unit_price: '12' }], [{ estimate: '' }], 0.13).total).toBe(0);
  });
});

describe('scheduleAt (midnight expiry)', () => {
  it('fires at the time, not before', () => {
    vi.useFakeTimers();
    const start = Date.UTC(2026, 10, 13, 22, 0);
    vi.setSystemTime(start);
    const fn = vi.fn();
    scheduleAt(new Date(start + 2 * 3600_000).toISOString(), fn);
    vi.advanceTimersByTime(2 * 3600_000 - 1);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
  it('fires immediately when already past and can be cancelled', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    scheduleAt(Date.now() - 1, fn);
    expect(fn).toHaveBeenCalledOnce();
    const fn2 = vi.fn();
    const cancel = scheduleAt(Date.now() + 1000, fn2);
    cancel();
    vi.advanceTimersByTime(2000);
    expect(fn2).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
