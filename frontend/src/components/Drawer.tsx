import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

interface Props {
  crumb: string;
  title?: ReactNode;
  dirty?: boolean;
  onClose: () => void;
  onBack?: () => void;
  banner?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  /** Bump to ask the drawer to close (e.g. from a footer button); honours unsaved changes. */
  labelledBy?: string;
}

/** Right-side sheet (full screen under 720 px) with sticky header/footer and an unsaved-changes bar. */
export function Drawer({ crumb, dirty = false, onClose, onBack, banner, footer, children, labelledBy }: Props) {
  const [confirm, setConfirm] = useState<null | 'close' | 'back'>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const fallbackId = useId();

  const request = (kind: 'close' | 'back') => {
    if (dirty) setConfirm(kind);
    else if (kind === 'back' && onBack) onBack();
    else onClose();
  };

  useEffect(() => {
    sheet.current?.focus();
    document.body.classList.add('locked');
    return () => document.body.classList.remove('locked');
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.ov-backdrop')) request('close');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div className="backdrop" onClick={(e) => e.target === e.currentTarget && request('close')}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={labelledBy ?? fallbackId} tabIndex={-1} ref={sheet}>
        <div className="sheet-h">
          {onBack && (
            <button type="button" className="btn sm ghost" onClick={() => request('back')}>
              ‹ Back
            </button>
          )}
          <span className="crumb" id={labelledBy ? undefined : fallbackId}>
            {crumb}
          </span>
          <button type="button" className="btn sm ghost" onClick={() => request('close')} aria-label="Close">
            Close ✕
          </button>
        </div>
        {confirm && (
          <div className="discard" role="alert">
            <span>You have unsaved changes.</span>
            <button
              type="button"
              className="btn sm danger"
              onClick={() => {
                const kind = confirm;
                setConfirm(null);
                if (kind === 'back' && onBack) onBack();
                else onClose();
              }}
            >
              Discard changes
            </button>
            <button type="button" className="btn sm" onClick={() => setConfirm(null)}>
              Keep editing
            </button>
          </div>
        )}
        {banner}
        <div className="sheet-b">{children}</div>
        {footer && <div className="sheet-f">{footer}</div>}
      </div>
    </div>
  );
}
