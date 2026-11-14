import type { ReactNode } from 'react';

export function Tile({ onClick, children, add, className = '' }: { onClick: () => void; children: ReactNode; add?: boolean; className?: string }) {
  return (
    <button type="button" className={`tile${add ? ' add' : ''} ${className}`.trim()} onClick={onClick}>
      {children}
    </button>
  );
}
