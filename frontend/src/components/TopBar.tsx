import { useEffect, useRef, useState } from 'react';
import type { ConnState } from '../api/realtime';
import { useSession } from '../session/SessionProvider';
import { roleLabel } from '../session/roles';
import { Clock } from './Clock';
import { PinDialog } from './PinDialog';
import { SwitchRoleDialog } from './SwitchRoleDialog';

const CONN_TEXT: Record<ConnState, string> = { live: 'Live', reconnecting: 'Reconnecting…', offline: 'Offline' };

export function TopBar({ conn }: { conn: ConnState | null }) {
  const { state, signOut } = useSession();
  const [dialog, setDialog] = useState<null | 'pin' | 'switch'>(null);
  const ready = state.status === 'ready' ? state : null;
  const shopName = state.status === 'ready' || state.status === 'pickRole' || state.status === 'pinSetup' ? state.me.shop.name : 'Workshop';
  const locked = ready && (ready.session.role === 'kiosk' || ready.session.role === 'display');
  const ref = useRef<HTMLElement>(null);

  // Publish the bar's height so the section tabs can stick just below it (the bar wraps on narrow screens).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement.style;
    const ro = new ResizeObserver(() => root.setProperty('--topbar-h', `${el.offsetHeight}px`));
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.removeProperty('--topbar-h');
    };
  }, []);

  return (
    <header className="topbar" ref={ref}>
      <div className="brand">
        <div className="logo" aria-hidden="true">
          {shopName
            .split(/\s+/)
            .slice(0, 2)
            .map((w) => w[0])
            .join('')
            .toUpperCase()}
        </div>
        <div>
          <b>{shopName}</b>
          <small>Work orders &amp; service history</small>
        </div>
      </div>
      {ready && (
        <div className="bar">
          {locked ? (
            <>
              <Clock />
              <button type="button" className="btn sm ghost" onClick={() => setDialog('pin')}>
                Staff
              </button>
            </>
          ) : (
            <>
              <span className="rolechip">{roleLabel(ready.session.role)}</span>
              <span className="who-bar">{ready.me.staff.name}</span>
              <button type="button" className="btn sm" onClick={() => setDialog('switch')}>
                Switch role
              </button>
              <button type="button" className="btn sm ghost" onClick={() => void signOut()}>
                Sign out
              </button>
            </>
          )}
        </div>
      )}
      {ready && conn && !locked && (
        <span className={`conn ${conn}`} role="status">
          <i aria-hidden="true" />
          <span>{CONN_TEXT[conn]}</span>
        </span>
      )}
      {dialog === 'pin' && <PinDialog onClose={() => setDialog(null)} onUnlocked={() => setDialog('switch')} />}
      {dialog === 'switch' && <SwitchRoleDialog onClose={() => setDialog(null)} />}
    </header>
  );
}
