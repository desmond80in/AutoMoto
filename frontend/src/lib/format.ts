import { normPhone } from './normalize';

/** (416) 555-0142 */
export function fmtPhone(p: string | null | undefined): string {
  const d = normPhone(p);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : d || '—';
}

/** (•••) •••-0142 */
export const maskPhone = (last4: string) => `(•••) •••-${last4}`;

/** ABCD 123 when 4 letters + 3 digits, else as stored. */
export function fmtPlate(p: string | null | undefined): string {
  const s = String(p ?? '');
  return /^[A-Z]{4}\d{3}$/.test(s) ? `${s.slice(0, 4)} ${s.slice(4)}` : s;
}

export function money(n: number | string | null | undefined): string {
  return (Number(n) || 0).toLocaleString('en-CA', { style: 'currency', currency: 'CAD' });
}

/** 52,870 km */
export function km(n: number | null | undefined): string {
  return n == null || Number.isNaN(Number(n)) ? '—' : `${Number(n).toLocaleString('en-CA')} km`;
}

/** Nov 13, 2026 */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso);
  return d.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** 9:12 a.m. */
export function fmtTime(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
}

export const fmtDateTime = (iso: string | null | undefined) => (iso ? `${fmtDate(iso)}, ${fmtTime(iso)}` : '—');

/** "just now", "12 min ago", "3 h ago", "yesterday", "4 days ago" */
export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const m = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

export const firstName = (n: string | null | undefined) => String(n ?? '').trim().split(/\s+/)[0] ?? '';

/** Priya S. */
export function maskName(n: string | null | undefined): string {
  const p = String(n ?? '').trim().split(/\s+/).filter(Boolean);
  if (p.length > 1) return `${p[0]} ${p[p.length - 1]![0]}.`;
  return p[0] ?? 'Customer';
}

export function vehicleName(v: { year?: number | string | null; make?: string | null; model?: string | null } | null | undefined): string {
  if (!v) return 'Unknown vehicle';
  return [v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle';
}

export const pct = (rate: number) => `${Math.round(rate * 10000) / 100}%`;
