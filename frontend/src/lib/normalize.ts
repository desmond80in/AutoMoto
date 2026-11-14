/** Same rules as the backend: digits only, strip a leading 1 from 11 digits. */
export function normPhone(s: string | null | undefined): string {
  let d = String(s ?? '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return d;
}

/** Uppercase, keep A-Z0-9 only. */
export function normPlate(s: string | null | undefined): string {
  return String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export const isValidPhone = (s: string) => normPhone(s).length === 10;
export const isValidPlate = (s: string) => /^[A-Z0-9]{2,8}$/.test(normPlate(s));
export const isValidVin = (s: string) => {
  const v = normPlate(s);
  return v.length === 0 || v.length === 17;
};
export const isValidEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.trim());

/** Parse a number typed by a person ("52 870", "1,234.50"); null when empty or invalid. */
export function parseNumber(s: string | number | null | undefined): number | null {
  if (s == null) return null;
  if (typeof s === 'number') return Number.isFinite(s) ? s : null;
  const t = s.replace(/[\s,$]/g, '');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
