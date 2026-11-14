import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { errorMessage, toAppError } from '../../api/errors';
import type { JobPatch } from '../../api/rpc';
import { REASONS, type Job, type JobStatus, type Reason } from '../../api/types';
import { Chip } from '../../components/Chip';
import { Drawer } from '../../components/Drawer';
import { EventLog } from '../../components/EventLog';
import { PlateChip } from '../../components/PlateChip';
import { STATUS_INFO, StatusPill, UrgencyPill } from '../../components/StatusPill';
import { useToast } from '../../components/Toast';
import { TotalsBox } from '../../components/TotalsBox';
import { fmtDateTime, fmtPhone, fmtPlate, money, vehicleName } from '../../lib/format';
import { parseNumber } from '../../lib/normalize';
import { computeTotals } from '../../lib/totals';
import { useApp } from '../../session/AppContext';
import { useReady } from '../../session/SessionProvider';
import { REASON_LABELS } from '../kiosk/VisitStep';
import { CancelJobDialog } from './CancelJobDialog';
import { CustomerMessages } from './CustomerMessages';
import { useAction } from './useAction';
import { useDrawerNav } from './useDrawerNav';

interface Draft {
  reasons: Reason[];
  odometer: string;
  notes: string;
  pickup_date: string;
  received_by: string | null;
  received_by_name: string | null;
  concerns: { text: string; estimate: string }[];
  items: { type: 'part' | 'labour'; description: string; qty: string; unit_price: string }[];
}

const toDraft = (j: Job): Draft => ({
  reasons: j.reasons,
  odometer: j.odometer_km == null ? '' : String(j.odometer_km),
  notes: j.notes,
  pickup_date: j.pickup_date ?? '',
  received_by: j.received_by?.id ?? null,
  received_by_name: j.received_by?.name ?? null,
  concerns: j.concerns.map((c) => ({ text: c.text, estimate: c.estimate == null ? '' : String(c.estimate) })),
  items: j.items.map((i) => ({ type: i.type, description: i.description, qty: String(i.qty), unit_price: String(i.unit_price) })),
});

/** Canonical form for dirty checks and the save patch. */
function toPatch(d: Draft): Required<JobPatch> {
  return {
    reasons: [...d.reasons].sort(),
    odometer_km: parseNumber(d.odometer) == null ? null : Math.round(parseNumber(d.odometer)!),
    notes: d.notes,
    pickup_date: d.pickup_date || null,
    received_by: d.received_by,
    concerns: d.concerns.map((c) => ({ text: c.text.trim(), estimate: parseNumber(c.estimate) })).filter((c) => c.text),
    items: d.items.map((i) => ({ type: i.type, description: i.description.trim(), qty: parseNumber(i.qty) ?? 0, unit_price: parseNumber(i.unit_price) ?? 0 })),
  };
}

const TOASTS: Partial<Record<JobStatus, (no: string) => string>> = {
  accepted: (no) => `Job #${no} accepted.`,
  in_progress: (no) => `You took job #${no}.`,
  waiting_parts: (no) => `Job #${no} is waiting on parts.`,
  ready: (no) => `Job #${no} is ready for pickup.`,
  picked_up: (no) => `Job #${no} picked up.`,
  cancelled: (no) => `Job #${no} cancelled.`,
};

export function JobDrawer({ id }: { id: string }) {
  const { api } = useApp();
  const qc = useQueryClient();
  const nav = useDrawerNav();
  const toast = useToast();
  const { me, session } = useReady();
  const role = session.role;
  const { busy, run } = useAction();
  const { data: job, error, refetch } = useQuery({ queryKey: ['job', id], queryFn: () => api.getWorkOrder(id) });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [base, setBase] = useState<Job | null>(null);
  const [conflict, setConflict] = useState(false);
  const [confirmReload, setConfirmReload] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const dirty = !!(draft && base && JSON.stringify(toPatch(draft)) !== JSON.stringify(toPatch(toDraft(base))));

  // Take server changes when there are no local edits.
  useEffect(() => {
    if (!job) return;
    if (!draft || !dirty) {
      setDraft(toDraft(job));
      setBase(job);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job]);

  const sig = useQuery({
    queryKey: ['signature', job?.signature_path],
    queryFn: () => api.signatureUrl(job!.signature_path!),
    enabled: !!job?.signature_path && role !== 'kiosk',
    staleTime: 4 * 60_000,
  });

  const totals = useMemo(() => computeTotals(draft?.items ?? [], draft?.concerns ?? [], me.shop.hst_rate), [draft, me.shop.hst_rate]);

  if (error)
    return (
      <Drawer crumb="Work order" onClose={nav.close} onBack={nav.back}>
        <p className="err">{errorMessage(error)}</p>
      </Drawer>
    );
  if (!job || !draft || !base) return null;

  const set = (p: Partial<Draft>) => setDraft({ ...draft, ...p });
  const applyJob = (j: Job) => {
    qc.setQueryData(['job', j.id], j);
    void qc.invalidateQueries({ queryKey: ['jobs'] });
    setDraft(toDraft(j));
    setBase(j);
    setConflict(false);
  };

  const handleConflict = (e: unknown) => {
    const err = toAppError(e);
    if (err.code === 'VERSION_CONFLICT') setConflict(true);
    if (err.code === 'INVALID_TRANSITION') void refetch().then((r) => r.data && !dirty && applyJob(r.data));
  };

  const save = async () => {
    const patch: JobPatch = toPatch(draft);
    if (role === 'workshop') {
      delete patch.received_by;
      delete patch.pickup_date;
    }
    try {
      const j = await run('save', () => api.saveWorkOrder(job.id, base.version, patch), `Work order #${job.order_no} saved.`);
      if (j) applyJob(j);
    } catch (e) {
      handleConflict(e);
    }
  };

  const go = async (to: JobStatus, reason?: string) => {
    try {
      // Unsaved edits go in first so the transition doesn't discard them.
      let version = base.version;
      if (dirty) {
        const patch: JobPatch = toPatch(draft);
        if (role === 'workshop') {
          delete patch.received_by;
          delete patch.pickup_date;
        }
        version = (await api.saveWorkOrder(job.id, version, patch)).version;
      }
      const j = await run(to, () => api.jobTransition(job.id, to, version, reason), TOASTS[to]?.(job.order_no));
      if (j) {
        applyJob(j);
        if (to === 'accepted') nav.open('tag', j.id);
      }
    } catch (e) {
      if (dirty) toast(errorMessage(e), 'err');
      handleConflict(e);
    }
  };

  const reload = async () => {
    const r = await refetch();
    if (r.data) applyJob(r.data);
    setConfirmReload(false);
  };

  const desk = role === 'frontdesk' || role === 'admin';
  const ws = role === 'workshop';
  const st = job.status;
  const open = !['picked_up', 'cancelled'].includes(st);

  const footer = (
    <>
      {ws && st === 'accepted' && (
        <button type="button" className="btn primary" disabled={!!busy} onClick={() => go('in_progress')}>
          Take job
        </button>
      )}
      {(ws || role === 'admin') && st === 'in_progress' && (
        <>
          <button type="button" className="btn" disabled={!!busy} onClick={() => go('waiting_parts')}>
            Waiting on parts
          </button>
          <button type="button" className="btn primary" disabled={!!busy} onClick={() => go('ready')}>
            Work complete
          </button>
        </>
      )}
      {(ws || role === 'admin') && st === 'waiting_parts' && (
        <button type="button" className="btn primary" disabled={!!busy} onClick={() => go('in_progress')}>
          Resume work
        </button>
      )}
      {desk && st === 'checked_in' && (
        <button type="button" className="btn primary" disabled={!!busy} onClick={() => go('accepted')}>
          Keys received, accept job
        </button>
      )}
      {desk && ['accepted', 'in_progress', 'waiting_parts', 'ready'].includes(st) && (
        <button type="button" className="btn" onClick={() => nav.open('tag', job.id)}>
          Job QR tag
        </button>
      )}
      {desk && st === 'ready' && (
        <button type="button" className="btn" disabled={!!busy} onClick={() => go('picked_up')}>
          Mark picked up
        </button>
      )}
      {desk && open && (
        <button type="button" className="btn danger" onClick={() => setConfirmCancel(true)}>
          Cancel job
        </button>
      )}
      {desk && open && confirmCancel && (
        <CancelJobDialog
          orderNo={job.order_no}
          busy={!!busy}
          onClose={() => setConfirmCancel(false)}
          onConfirm={(reason) => void go('cancelled', reason).then(() => setConfirmCancel(false))}
        />
      )}
      <button type="button" className={`btn${ws || st === 'checked_in' ? '' : ' primary'}`} disabled={!!busy || !dirty} onClick={save}>
        Save changes
      </button>
    </>
  );

  const banner = conflict ? (
    <div className="conflict" role="alert">
      <span>Someone else changed this job. Reload to see the latest version.</span>
      {confirmReload ? (
        <>
          <span>Discard your changes and reload?</span>
          <button type="button" className="btn sm danger" onClick={reload}>
            Discard and reload
          </button>
          <button type="button" className="btn sm" onClick={() => setConfirmReload(false)}>
            Keep my changes
          </button>
        </>
      ) : (
        <button type="button" className="btn sm" onClick={() => (dirty ? setConfirmReload(true) : void reload())}>
          Reload
        </button>
      )}
    </div>
  ) : null;

  const intake = job.intake;
  return (
    <Drawer
      crumb={`${fmtPlate(job.vehicle.plate)} · Work order #${job.order_no}`}
      dirty={dirty}
      onClose={nav.close}
      onBack={nav.back}
      banner={banner}
      footer={footer}
      labelledBy="job-title"
    >
      <div className="spread">
        <div>
          <span className="eyebrow">Work order</span>
          <h2 id="job-title" className="mono">
            #{job.order_no}
          </h2>
          <p className="muted small">
            Received {fmtDateTime(job.created_at)}
            {job.source === 'kiosk' ? ' at the check-in kiosk' : ' by the front desk'}
          </p>
        </div>
        <div className="status-stack">
          <StatusPill status={st} />
          {job.approval_needed && <span className="pill t-warn">Approval needed</span>}
        </div>
      </div>
      {st === 'cancelled' && (
        <div className="panel cancelled-note">
          <b>Cancelled{job.cancelled_at ? ` ${fmtDateTime(job.cancelled_at)}` : ''}.</b>{' '}
          {job.cancel_reason ? `Reason: ${job.cancel_reason}.` : ''}
        </div>
      )}

      <div className="ticket">
        <div className="cell">
          <span className="k">Client name</span>
          <span className="v">
            {desk ? (
              <button type="button" className="link" onClick={() => nav.open('customer', job.customer.id)}>
                {job.customer.name}
              </button>
            ) : (
              job.customer.name
            )}
            {!job.owner_is_current && <span className="tag">Previous owner</span>}
          </span>
        </div>
        <div className="cell">
          <span className="k">Client phone</span>
          <span className="v num">{fmtPhone(job.customer.phone)}</span>
        </div>
        <div className="cell">
          <span className="k">Year, make &amp; model</span>
          <span className="v">
            {desk ? (
              <button type="button" className="link" onClick={() => nav.open('vehicle', job.vehicle.id)}>
                {vehicleName(job.vehicle)}
              </button>
            ) : (
              vehicleName(job.vehicle)
            )}
          </span>
        </div>
        <div className="cell">
          <span className="k">Licence plate #</span>
          <span className="v">
            <PlateChip plate={job.vehicle.plate} />
          </span>
        </div>
        <div className="cell">
          <span className="k">VIN</span>
          <span className="v mono small">{job.vehicle.vin || '—'}</span>
        </div>
        <div className="cell">
          <span className="k">Engine size</span>
          <span className="v">{job.vehicle.engine || '—'}</span>
        </div>
        <div className="cell">
          <span className="k">
            <label htmlFor="wo-odo">Odometer (km)</label>
          </span>
          <span className="v">
            <input id="wo-odo" inputMode="numeric" value={draft.odometer} onChange={(e) => set({ odometer: e.target.value })} />
          </span>
        </div>
        <div className="cell">
          <span className="k">Order received by</span>
          <span className="v">
            <span className={ws ? 'ro' : ''}>{draft.received_by_name ?? '—'}</span>
            {desk && draft.received_by !== me.staff.id && (
              <button type="button" className="btn sm" onClick={() => set({ received_by: me.staff.id, received_by_name: me.staff.name })}>
                Set to me
              </button>
            )}
          </span>
        </div>
        <div className="cell">
          <span className="k">
            <label htmlFor="wo-pu">Pick-up date</label>
          </span>
          <span className="v">
            {ws ? (
              <span className="ro">{draft.pickup_date || '—'}</span>
            ) : (
              <input id="wo-pu" type="date" value={draft.pickup_date} onChange={(e) => set({ pickup_date: e.target.value })} />
            )}
          </span>
        </div>
        <div className="cell">
          <span className="k">Technician</span>
          <span className="v">{job.tech?.name ?? '—'}</span>
        </div>
      </div>

      {intake && (intake.transcript || intake.summary) && (
        <div className="sec">
          <div className="spread">
            <h3>In the customer's words</h3>
            <UrgencyPill urgency={intake.urgency} />
          </div>
          <div className="intake">
            {intake.transcript && <blockquote>{intake.transcript}</blockquote>}
            {intake.summary && (
              <p>
                <b>Summary:</b> {intake.summary}
              </p>
            )}
            {intake.safety_note && <p className="safety">{intake.safety_note}</p>}
            {intake.when_it_happens && (
              <p>
                <b>When it happens:</b> {intake.when_it_happens}
              </p>
            )}
            {intake.warning_lights.length > 0 && (
              <p>
                <b>Warning lights:</b> {intake.warning_lights.join(', ')}
              </p>
            )}
            {intake.questions.length > 0 && (
              <div>
                <b>Questions to ask the customer</b>
                <ul>
                  {intake.questions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="sec">
        <h3>Reason for visit</h3>
        <div className="chips">
          {REASONS.map((r) => (
            <Chip
              key={r}
              small
              on={draft.reasons.includes(r)}
              onClick={() =>
                set({ reasons: draft.reasons.includes(r) ? (draft.reasons.length > 1 ? draft.reasons.filter((x) => x !== r) : draft.reasons) : [...draft.reasons, r] })
              }
            >
              {REASON_LABELS[r]}
            </Chip>
          ))}
        </div>
      </div>

      <div className="sec">
        <h3>Customer concern</h3>
        <div className="tbl-wrap" tabIndex={0} role="region" aria-label="Customer concerns">
          <table className="lines">
            <thead>
              <tr>
                <th style={{ width: 36 }}>#</th>
                <th>Concern</th>
                <th className="r" style={{ width: 150 }}>
                  Estimate ($)
                </th>
                <th style={{ width: 44 }}>
                  <span className="sr">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {draft.concerns.map((c, i) => (
                <tr key={i}>
                  <td className="mono muted">{i + 1}</td>
                  <td>
                    <textarea
                      rows={1}
                      aria-label={`Concern ${i + 1}`}
                      value={c.text}
                      onChange={(e) => set({ concerns: draft.concerns.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })}
                    />
                  </td>
                  <td>
                    <input
                      className="amt-input"
                      inputMode="decimal"
                      aria-label={`Estimate for concern ${i + 1}`}
                      value={c.estimate}
                      onChange={(e) => set({ concerns: draft.concerns.map((x, j) => (j === i ? { ...x, estimate: e.target.value } : x)) })}
                    />
                  </td>
                  <td>
                    <button type="button" className="x" aria-label={`Remove concern ${i + 1}`} onClick={() => set({ concerns: draft.concerns.filter((_, j) => j !== i) })}>
                      ×
                    </button>
                  </td>
                </tr>
              ))}
              <tr>
                <td />
                <td>
                  <button type="button" className="btn sm" disabled={draft.concerns.length >= 8} onClick={() => set({ concerns: [...draft.concerns, { text: '', estimate: '' }] })}>
                    + Add concern
                  </button>
                </td>
                <td className="amt">Est. {money(totals.estimate)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="sec">
        <h3>Repair details</h3>
        <div className="tbl-wrap" tabIndex={0} role="region" aria-label="Repair details">
          <table className="lines">
            <thead>
              <tr>
                <th style={{ width: 120 }}>Type</th>
                <th>Description</th>
                <th className="r" style={{ width: 96 }}>
                  Qty / hrs
                </th>
                <th className="r" style={{ width: 120 }}>
                  Unit price
                </th>
                <th className="r" style={{ width: 110 }}>
                  Amount
                </th>
                <th style={{ width: 44 }}>
                  <span className="sr">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {draft.items.length ? (
                draft.items.map((it, i) => {
                  const upd = (p: Partial<Draft['items'][number]>) => set({ items: draft.items.map((x, j) => (j === i ? { ...x, ...p } : x)) });
                  return (
                    <tr key={i}>
                      <td>
                        <select aria-label={`Line ${i + 1} type`} value={it.type} onChange={(e) => upd({ type: e.target.value as 'part' | 'labour' })}>
                          <option value="part">Part</option>
                          <option value="labour">Labour</option>
                        </select>
                      </td>
                      <td>
                        <input
                          aria-label={`Line ${i + 1} description`}
                          value={it.description}
                          placeholder={it.type === 'labour' ? 'e.g. Replace front pads' : 'e.g. Ceramic brake pads'}
                          onChange={(e) => upd({ description: e.target.value })}
                        />
                      </td>
                      <td>
                        <input className="amt-input" inputMode="decimal" aria-label={`Line ${i + 1} quantity or hours`} value={it.qty} onChange={(e) => upd({ qty: e.target.value })} />
                      </td>
                      <td>
                        <input className="amt-input" inputMode="decimal" aria-label={`Line ${i + 1} unit price`} value={it.unit_price} onChange={(e) => upd({ unit_price: e.target.value })} />
                      </td>
                      <td className="amt">{money((parseNumber(it.qty) ?? 0) * (parseNumber(it.unit_price) ?? 0))}</td>
                      <td>
                        <button type="button" className="x" aria-label={`Remove line ${i + 1}`} onClick={() => set({ items: draft.items.filter((_, j) => j !== i) })}>
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="muted">
                    No parts or labour added yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="row">
          <button type="button" className="btn sm" onClick={() => set({ items: [...draft.items, { type: 'part', description: '', qty: '1', unit_price: '' }] })}>
            + Part
          </button>
          <button
            type="button"
            className="btn sm"
            onClick={() => set({ items: [...draft.items, { type: 'labour', description: '', qty: '1', unit_price: String(me.shop.labour_rate) }] })}
          >
            + Labour ({money(me.shop.labour_rate)}/hr)
          </button>
        </div>
        <TotalsBox totals={totals} hstRate={me.shop.hst_rate} />
      </div>

      <div className="sec">
        <h3>
          <label htmlFor="wo-notes">Technician notes</label>
        </h3>
        <textarea id="wo-notes" rows={3} placeholder="Findings, parts on order, call notes…" value={draft.notes} onChange={(e) => set({ notes: e.target.value })} />
      </div>

      <div className="sec">
        <h3>Customer authorization</h3>
        {job.signed_name ? (
          <>
            <p>
              Signed by <b>{job.signed_name}</b> on {fmtDateTime(job.signed_at)}.
            </p>
            {sig.data && <img className="sigimg" src={sig.data} alt={`Signature of ${job.signed_name}`} />}
          </>
        ) : (
          <p className="muted">Not signed at the kiosk. Get the customer's authorization before starting work.</p>
        )}
      </div>

      {role !== 'kiosk' && <CustomerMessages job={job} dirty={dirty} onJob={applyJob} onRefresh={() => void refetch()} />}

      <div className="sec">
        <h3>History</h3>
        <EventLog events={job.events} />
      </div>
      <p className="visually-hidden" aria-live="polite">
        Status {STATUS_INFO[st].staff}
      </p>
    </Drawer>
  );
}
