import type { JobSummary } from '../../api/types';
import { PlateChip } from '../../components/PlateChip';
import { STATUS_INFO, UrgencyPill } from '../../components/StatusPill';
import { ago, fmtPhone, fmtTime, money, vehicleName } from '../../lib/format';

export function WoCard({ w, onOpen }: { w: JobSummary; onOpen: () => void }) {
  const st = STATUS_INFO[w.status];
  return (
    <button type="button" className={`wo-card tone-${st.tone}`} onClick={onOpen}>
      <div className="top">
        <span className="mono">#{w.order_no}</span>
        <span>{ago(w.started_at ?? w.accepted_at ?? w.created_at)}</span>
      </div>
      <div className="veh">
        <PlateChip plate={w.plate} />
        <span>{vehicleName(w)}</span>
      </div>
      <div>
        {w.customer_name}
        {w.owner_unverified && (
          <>
            {' '}
            <span className="pill t-warn">Owner to verify</span>
          </>
        )}
        {w.urgency === 'unsafe' && (
          <>
            {' '}
            <UrgencyPill urgency="unsafe" />
          </>
        )}
        {w.approval_needed && (
          <>
            {' '}
            <span className="pill t-warn">Approval needed</span>
          </>
        )}
        {w.status === 'ready' && w.ready_texted && (
          <>
            {' '}
            <span className="pill t-ok">Texted</span>
          </>
        )}
      </div>
      {w.first_concern && (
        <div className="concern-t">
          {w.first_concern}
          {w.concern_count > 1 ? ` (+${w.concern_count - 1} more)` : ''}
        </div>
      )}
      <div className="bot">
        <span className="muted">{w.tech_name ? `Tech: ${w.tech_name}` : w.status === 'checked_in' ? 'Keys not received' : 'No technician yet'}</span>
        <b className="num">{w.total ? money(w.total) : w.estimate ? `Est. ${money(w.estimate)}` : 'No estimate'}</b>
      </div>
    </button>
  );
}

export function ArrivalCard({ w, onAccept, onOpen, busy }: { w: JobSummary; onAccept: () => void; onOpen: () => void; busy: boolean }) {
  return (
    <div className={`arrival${w.urgency === 'unsafe' ? ' is-unsafe' : ''}`} data-testid="arrival">
      <div className="spread">
        <span className="mono">#{w.order_no}</span>
        <span className="muted small">
          Checked in {fmtTime(w.created_at)} · {ago(w.created_at)}
        </span>
      </div>
      <div className="row" style={{ gap: 12 }}>
        <PlateChip plate={w.plate} size="lg" />
        <div>
          <b className="t-title">{vehicleName(w)}</b>
          <div className="muted">
            {w.customer_name} · {fmtPhone(w.customer_phone)}
          </div>
        </div>
      </div>
      {w.owner_unverified && <span className="pill t-warn" style={{ justifySelf: 'start' }}>Owner to verify</span>}
      <ul className="concern-list">
        {w.concerns.map((c, i) => (
          <li key={i}>{c}</li>
        ))}
      </ul>
      {w.urgency && (
        <div className="row">
          <UrgencyPill urgency={w.urgency} />
          {w.safety_note && <span className="small safety">{w.safety_note}</span>}
        </div>
      )}
      <div className="row">
        <button type="button" className="btn primary" onClick={onAccept} disabled={busy}>
          Keys received, accept job
        </button>
        <button type="button" className="btn" onClick={onOpen}>
          Details
        </button>
      </div>
    </div>
  );
}
