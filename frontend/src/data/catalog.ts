import catalog from './vehicle-catalog.json';

export const MAKES = catalog as Record<string, string[]>;
export const MAKE_NAMES = Object.keys(MAKES);
const ALIASES: Record<string, string> = {
  chevy: 'Chevrolet',
  vw: 'Volkswagen',
  volks: 'Volkswagen',
  mercedes: 'Mercedes-Benz',
  benz: 'Mercedes-Benz',
  mini: 'MINI',
  dodgeram: 'Ram',
};
const squash = (s: string | null | undefined) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Catalog make for free text ("chevy" -> "Chevrolet"), or null. */
export function canonMake(s: string | null | undefined): string | null {
  const k = squash(s);
  if (!k) return null;
  return MAKE_NAMES.find((m) => squash(m) === k) ?? ALIASES[k] ?? null;
}

/** Catalog model of a make for free text ("crv" -> "CR-V"), or null. */
export function canonModel(make: string | null | undefined, s: string | null | undefined): string | null {
  const k = squash(s);
  const list = make ? MAKES[make] : undefined;
  if (!k || !list) return null;
  return list.find((m) => squash(m) === k) ?? list.find((m) => squash(make + m) === k) ?? null;
}

/** Next year down to 1970. */
export function yearOptions(now = new Date()): number[] {
  const out: number[] = [];
  for (let y = now.getFullYear() + 1; y >= 1970; y--) out.push(y);
  return out;
}
