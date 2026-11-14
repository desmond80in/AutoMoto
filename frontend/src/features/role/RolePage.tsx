import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorMessage } from '../../api/errors';
import type { AppRole } from '../../api/types';
import { useToast } from '../../components/Toast';
import { firstName } from '../../lib/format';
import { useSession } from '../../session/SessionProvider';
import { homeFor, ROLE_INFO, ROLE_ORDER } from '../../session/roles';
import { deviceLabel } from '../../session/store';
import { PinSetup } from './PinSetup';

export function RolePage() {
  const { state, chooseRole, signOut } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const [label, setLabel] = useState(() => deviceLabel.get());
  const [busy, setBusy] = useState(false);

  if (state.status === 'pinSetup') return <PinSetup />;
  if (state.status !== 'pickRole') return null;
  const { staff } = state.me;
  const roles = ROLE_ORDER.filter((r) => staff.roles.includes(r));

  const pick = async (r: AppRole) => {
    setBusy(true);
    try {
      await chooseRole(r, label);
      navigate(homeFor(r));
    } catch (e) {
      toast(errorMessage(e), 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap wide">
      <div className="card stack">
        <div>
          <span className="eyebrow">Signed in as {staff.email}</span>
          <h1>Hi {firstName(staff.name)}. Which role is this device for?</h1>
          <p className="lede">
            To use a different role later, sign out and sign in again
            {staff.quick_switch.length > 1 ? ', or switch between the roles your administrator allows' : ''}.
          </p>
        </div>
        <div className="field" style={{ maxWidth: 360 }}>
          <label className="lbl" htmlFor="device-label">
            Device name
          </label>
          <input id="device-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} />
        </div>
        <div className="role-grid">
          {roles.map((r) => (
            <button key={r} type="button" className="tile role-tile" disabled={busy} onClick={() => pick(r)}>
              <span className="t-title">{ROLE_INFO[r].label}</span>
              <span className="muted small">{ROLE_INFO[r].desc}</span>
            </button>
          ))}
        </div>
        <div>
          <button type="button" className="btn ghost" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
