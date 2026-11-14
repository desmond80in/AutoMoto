import { useState } from 'react';
import { errorMessage } from '../api/errors';
import { useApp } from '../session/AppContext';
import { useReady } from '../session/SessionProvider';
import { roleLabel } from '../session/roles';
import { Dialog } from './Dialog';
import { PinInput } from './PinInput';

/** Kiosk/display lock: a staff PIN unlocks the switch-role dialog. */
export function PinDialog({ onClose, onUnlocked }: { onClose: () => void; onUnlocked: () => void }) {
  const { api } = useApp();
  const { session } = useReady();
  const [pin, setPin] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.verifyPin(pin);
      onUnlocked();
    } catch (x) {
      setErr(errorMessage(x));
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title="Staff only" onClose={onClose}>
      <form className="stack-sm" onSubmit={submit} autoComplete="off">
        <p className="muted">Enter your PIN to change role or sign out of this {roleLabel(session.role).toLowerCase()}.</p>
        <label className="sr" htmlFor="gate-pin">
          PIN
        </label>
        <PinInput id="gate-pin" value={pin} onChange={setPin} />
        {err && (
          <p className="err" role="alert">
            {err}
          </p>
        )}
        <div className="row">
          <button className="btn primary" disabled={busy || pin.length < 4}>
            Unlock
          </button>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Dialog>
  );
}
