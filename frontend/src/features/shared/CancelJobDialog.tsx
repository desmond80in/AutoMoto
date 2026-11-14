import { useState } from 'react';
import { Dialog } from '../../components/Dialog';

export const CANCEL_REASONS = ['Customer left without repairs', 'Customer declined the estimate'] as const;
const OTHER = 'other';

/** Close an open job at any stage, e.g. when the customer takes the vehicle away. A reason is required. */
export function CancelJobDialog({
  orderNo,
  busy,
  onConfirm,
  onClose,
}: {
  orderNo: string;
  busy: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [choice, setChoice] = useState<string>(CANCEL_REASONS[0]);
  const [other, setOther] = useState('');
  const reason = choice === OTHER ? other.trim() : choice;

  return (
    <Dialog title={`Cancel job #${orderNo}?`} onClose={onClose}>
      <form
        className="stack-sm"
        onSubmit={(e) => {
          e.preventDefault();
          if (reason) onConfirm(reason);
        }}
      >
        <p className="muted">The vehicle leaves without further work. The job closes and comes off the boards. Work recorded so far stays on the job.</p>
        <fieldset className="radio-list">
          <legend className="lbl">Reason</legend>
          {[...CANCEL_REASONS, OTHER].map((r) => (
            <label key={r} className="radio">
              <input type="radio" name="cancel-reason" value={r} checked={choice === r} onChange={() => setChoice(r)} />
              <b>{r === OTHER ? 'Other reason' : r}</b>
            </label>
          ))}
        </fieldset>
        {choice === OTHER && (
          <div className="field">
            <label className="lbl" htmlFor="cancel-other">
              Describe the reason
            </label>
            <input id="cancel-other" value={other} maxLength={200} onChange={(e) => setOther(e.target.value)} autoFocus />
          </div>
        )}
        <div className="row">
          <button className="btn danger" disabled={busy || !reason}>
            Cancel job
          </button>
          <button type="button" className="btn ghost" onClick={onClose}>
            Keep job
          </button>
        </div>
      </form>
    </Dialog>
  );
}
