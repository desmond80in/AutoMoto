import type { ReactNode } from 'react';

export function Chip({ on, onClick, children, small, disabled }: { on: boolean; onClick: () => void; children: ReactNode; small?: boolean; disabled?: boolean }) {
  return (
    <button type="button" className={small ? 'chip sm' : 'chip'} aria-pressed={on} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}
