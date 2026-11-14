import { useState } from 'react';
import { errorMessage } from '../api/errors';
import type { AppRole } from '../api/types';
import { useNavigate } from 'react-router-dom';
import { useSession, useReady } from '../session/SessionProvider';
import { homeFor, ROLE_INFO, ROLE_ORDER, switchOption } from '../session/roles';
import { Dialog } from './Dialog';
import { useToast } from './Toast';

export function SwitchRoleDialog({ onClose }: { onClose: () => void }) {
  const { me, session } = useReady();
  const { switchTo, signOut } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const roles = ROLE_ORDER.filter((r) => me.staff.roles.includes(r));

  const go = async (r: AppRole) => {
    setBusy(true);
    try {
      await switchTo(r);
      onClose();
      navigate(homeFor(r));
    } catch (e) {
      toast(errorMessage(e), 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title="Switch role" onClose={onClose}>
      <div className="stack-sm">
        <p className="muted">
          Signed in as {me.staff.name} ({me.staff.email}).
        </p>
        <div className="role-list">
          {roles.map((r) => {
            const opt = switchOption(me.staff, session.role, r);
            return (
              <button key={r} type="button" className="role-row" disabled={opt !== 'switch' || busy} onClick={() => go(r)}>
                <b>{ROLE_INFO[r].label}</b>
                <span className="small muted">
                  {opt === 'current' ? 'Current role' : opt === 'switch' ? 'Switch now' : 'Sign out and sign in again to use this role'}
                </span>
              </button>
            );
          })}
        </div>
        <div className="row">
          <button type="button" className="btn danger" onClick={() => void signOut()}>
            Sign out
          </button>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </Dialog>
  );
}
