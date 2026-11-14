import { useState } from 'react';
import { SMS_KINDS, type Job, type SmsKind, type SmsMessage, type SmsStatus } from '../../api/types';
import { Chip } from '../../components/Chip';
import { Dialog } from '../../components/Dialog';
import { firstName, fmtDateTime, fmtPhone } from '../../lib/format';
import { SMS_KIND_LABELS, SMS_MAX, smsSegments, smsTemplate } from '../../lib/sms';
import { useApp } from '../../session/AppContext';
import { useReady } from '../../session/SessionProvider';
import { useAction } from './useAction';
import { useDrawerNav } from './useDrawerNav';

const STATUS: Record<SmsStatus, { label: string; tone: string }> = {
  queued: { label: 'Sending', tone: 't-info' },
  sent: { label: 'Sent', tone: 't-ok' },
  simulated: { label: 'Not sent (demo)', tone: 't-muted' },
  failed: { label: 'Failed', tone: 't-crit' },
};

const FAILURES: Record<string, string> = {
  opted_out: 'The customer replied STOP, so texts are now off for them.',
  not_verified: "SMS is still in test mode and this number isn't on the verified list.",
  spend_limit: 'The monthly SMS spending limit was reached.',
  throttled: 'Too many texts at once. Try again in a minute.',
  provider_error: 'The SMS service refused the message.',
};

const SENT_TOAST: Record<SmsStatus, string> = {
  sent: 'Text sent to the customer.',
  simulated: "Text recorded. It wasn't sent because SMS isn't set up yet.",
  failed: "The text wasn't sent.",
  queued: 'Text queued.',
};

/** Which message fits the job right now, for the default choice in the dialog. */
function suggestedKind(job: Job): SmsKind {
  if (job.approval_needed) return 'approval';
  if (job.status === 'ready') return 'ready';
  if (job.status === 'waiting_parts') return 'waiting_parts';
  return 'custom';
}

function MessageRow({ m }: { m: SmsMessage }) {
  const s = STATUS[m.status];
  return (
    <li className="sms-row">
      <div className="spread">
        <span className="small">
          <b>{SMS_KIND_LABELS[m.kind]}</b> · {fmtDateTime(m.created_at)}
          {m.sent_by_name ? ` · ${m.sent_by_name}` : ''}
        </span>
        <span className={`pill ${s.tone}`}>{s.label}</span>
      </div>
      <p className="sms-body">{m.body}</p>
      {m.status === 'failed' && <p className="err small">{FAILURES[m.error ?? ''] ?? FAILURES.provider_error}</p>}
    </li>
  );
}

function SendDialog({ job, onClose, onSent }: { job: Job; onClose: () => void; onSent: () => void }) {
  const { sms } = useApp();
  const { me, session } = useReady();
  const { busy, run } = useAction();
  const ctx = {
    shopName: me.shop.name,
    shopPhone: me.shop.phone,
    customerName: job.customer.name,
    vehicle: job.vehicle,
    total: job.totals.total,
    approvalNote: job.approval_note,
  };
  const [kind, setKind] = useState<SmsKind>(suggestedKind(job));
  const [body, setBody] = useState(() => smsTemplate(suggestedKind(job), ctx));
  const pick = (k: SmsKind) => {
    setKind(k);
    setBody(smsTemplate(k, ctx));
  };
  const text = body.trim();
  const { segments, unicode } = smsSegments(text);

  const send = async () => {
    const r = await run('sms', () => sms.send({ session_id: session.id, work_order_id: job.id, kind, body: text }), (x) => SENT_TOAST[x.status], {
      sms: true,
    }).catch(() => undefined);
    onSent();
    if (r) onClose();
  };

  return (
    <Dialog title={`Text ${firstName(job.customer.name)} at ${fmtPhone(job.customer.phone)}`} onClose={onClose}>
      <form
        className="stack-sm"
        onSubmit={(e) => {
          e.preventDefault();
          if (text && !busy) void send();
        }}
      >
        <div className="chips" role="group" aria-label="Message type">
          {SMS_KINDS.map((k) => (
            <Chip key={k} small on={kind === k} onClick={() => pick(k)}>
              {SMS_KIND_LABELS[k]}
            </Chip>
          ))}
        </div>
        <div className="field">
          <label className="lbl" htmlFor="sms-body">
            Message
          </label>
          <textarea id="sms-body" rows={5} maxLength={SMS_MAX} value={body} onChange={(e) => setBody(e.target.value)} />
          <span className="hint">
            {text.length}/{SMS_MAX} characters · {segments} {segments === 1 ? 'text' : 'texts'}
            {unicode ? ' (special characters make each text shorter)' : ''}
          </span>
        </div>
        <div className="row">
          <button className="btn primary" disabled={!!busy || !text}>
            {busy ? 'Sending…' : 'Send text'}
          </button>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function ApprovalDialog({ onClose, onConfirm, busy }: { onClose: () => void; onConfirm: (note: string) => void; busy: boolean }) {
  const [note, setNote] = useState('');
  return (
    <Dialog title="Customer approval needed" onClose={onClose}>
      <form
        className="stack-sm"
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm(note.trim());
        }}
      >
        <p className="muted">The job is flagged on every board until the customer approves. Add what they need to approve.</p>
        <div className="field">
          <label className="lbl" htmlFor="approval-note">
            What needs approval (optional)
          </label>
          <input id="approval-note" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Rear rotors are worn too, about $320 more" />
        </div>
        <div className="row">
          <button className="btn primary" disabled={busy}>
            Flag for approval
          </button>
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/**
 * "Customer messages" section of the job drawer: the approval flag, texts sent so far and the Text customer button.
 * `dirty`: the drawer has unsaved edits, so changes that bump the job version wait until they are saved.
 */
export function CustomerMessages({ job, dirty, onJob, onRefresh }: { job: Job; dirty: boolean; onJob: (j: Job) => void; onRefresh: () => void }) {
  const { api } = useApp();
  const { session } = useReady();
  const nav = useDrawerNav();
  const { busy, run } = useAction();
  const [sending, setSending] = useState(false);
  const [flagging, setFlagging] = useState(false);
  const role = session.role;
  const desk = role === 'frontdesk' || role === 'admin';
  const open = !['picked_up', 'cancelled'].includes(job.status);
  const canText = desk && job.status !== 'cancelled';
  const readySent = job.messages.some((m) => m.kind === 'ready' && (m.status === 'sent' || m.status === 'simulated'));

  const setApproval = async (on: boolean, note?: string) => {
    const j = await run('approval', () => api.setApprovalNeeded(job.id, on, job.version, note), on ? 'Flagged: customer approval needed.' : 'Approval received.').catch(
      () => undefined,
    );
    if (j) {
      onJob(j);
      setFlagging(false);
      // Front desk usually texts the customer straight away.
      if (on && desk && j.customer.sms_opt_in) setSending(true);
    }
  };

  if (!open && !job.messages.length) return null;
  return (
    <div className="sec">
      <div className="spread">
        <h3>Customer messages</h3>
        {desk && (
          <span className={`pill ${job.customer.sms_opt_in ? 't-ok' : 't-muted'}`}>{job.customer.sms_opt_in ? 'Texts on' : 'Texts off'}</span>
        )}
      </div>

      {job.approval_needed && (
        <div className="panel approval-note" role="status">
          <b>Waiting for the customer's approval.</b> {job.approval_note ?? ''}
        </div>
      )}

      {job.messages.length > 0 ? (
        <ul className="sms-list">
          {job.messages.map((m) => (
            <MessageRow key={m.id} m={m} />
          ))}
        </ul>
      ) : (
        desk && <p className="muted small">No texts sent for this job.</p>
      )}

      {desk && !job.customer.sms_opt_in && job.status !== 'cancelled' && (
        <p className="muted small">
          {firstName(job.customer.name)} hasn't agreed to text messages.{' '}
          <button type="button" className="link" onClick={() => nav.open('customer', job.customer.id)}>
            Open the customer record
          </button>{' '}
          to turn them on if the customer asks.
        </p>
      )}

      <div className="row">
        {canText && job.customer.sms_opt_in && (
          <button type="button" className={`btn${job.status === 'ready' && !readySent ? ' primary' : ''}`} onClick={() => setSending(true)}>
            {job.status === 'ready' && !readySent ? 'Text customer: ready for pickup' : 'Text customer'}
          </button>
        )}
        {open && !job.approval_needed && (
          <button type="button" className="btn" disabled={!!busy || dirty} onClick={() => setFlagging(true)}>
            Needs customer approval
          </button>
        )}
        {open && job.approval_needed && (
          <button type="button" className="btn" disabled={!!busy || dirty} onClick={() => void setApproval(false)}>
            Approval received
          </button>
        )}
        {open && dirty && <span className="hint">Save your changes to change the approval flag.</span>}
      </div>

      {sending && <SendDialog job={job} onClose={() => setSending(false)} onSent={onRefresh} />}
      {flagging && <ApprovalDialog busy={!!busy} onClose={() => setFlagging(false)} onConfirm={(note) => void setApproval(true, note || undefined)} />}
    </div>
  );
}
