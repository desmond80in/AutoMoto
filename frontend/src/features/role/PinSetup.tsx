import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorMessage } from '../../api/errors';
import { useSession } from '../../session/SessionProvider';
import { homeFor, roleLabel } from '../../session/roles';

export function PinSetup() {
  const { state, completePinSetup } = useSession();
  const navigate = useNavigate();
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (state.status !== 'pinSetup') return null;
  const { role, required } = state;

  const finish = async (value: string | null) => {
    setBusy(true);
    setErr(null);
    try {
      await completePinSetup(value);
      navigate(homeFor(role));
    } catch (e) {
      setErr(errorMessage(e));
      setBusy(false);
    }
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4,6}$/.test(pin)) return setErr('Enter 4 to 6 digits.');
    if (pin !== pin2) return setErr("The PINs don't match.");
    void finish(pin);
  };

  return (
    <div className="auth-wrap">
      <form className="card stack" onSubmit={submit} autoComplete="off">
        <div>
          <span className="eyebrow">{roleLabel(role)}</span>
          <h1>Choose a staff PIN</h1>
          <p className="lede">
            {required
              ? `A PIN is needed to unlock the ${roleLabel(role).toLowerCase()} screen. Use 4 to 6 digits.`
              : 'Your PIN unlocks the kiosk and display screens. Use 4 to 6 digits.'}
          </p>
        </div>
        <div className="grid2">
          <div className="field">
            <label className="lbl" htmlFor="pin1">
              PIN
            </label>
            <input id="pin1" type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} autoComplete="new-password" />
          </div>
          <div className="field">
            <label className="lbl" htmlFor="pin2">
              Repeat the PIN
            </label>
            <input id="pin2" type="password" inputMode="numeric" maxLength={6} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))} autoComplete="new-password" />
          </div>
        </div>
        {err && (
          <p className="err" role="alert">
            {err}
          </p>
        )}
        <div className="row">
          <button className="btn primary big" disabled={busy}>
            Save PIN
          </button>
          {!required && (
            <button type="button" className="btn big ghost" disabled={busy} onClick={() => void finish(null)}>
              Later
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
