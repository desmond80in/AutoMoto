import { fmtPlate } from '../lib/format';

export function PlateChip({ plate, size = 'md' }: { plate: string | null | undefined; size?: 'sm' | 'md' | 'lg' }) {
  const text = fmtPlate(plate) || '—';
  const cls = size === 'lg' ? 'plate lg' : size === 'sm' ? 'plate sm' : 'plate';
  return (
    <span className={cls} role="img" aria-label={`Licence plate ${text}`}>
      <small aria-hidden="true">ONTARIO</small>
      <b aria-hidden="true">{text}</b>
    </span>
  );
}
