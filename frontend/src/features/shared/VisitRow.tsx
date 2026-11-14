import type { JobSummary } from '../../api/types';
import { StatusPill } from '../../components/StatusPill';
import { fmtDate, km, money } from '../../lib/format';

export function VisitRow({ w, prevOwner, onOpen }: { w: JobSummary; prevOwner: boolean; onOpen: () => void }) {
  return (
    <button type="button" className="visit" onClick={onOpen}>
      <span className="d">
        {fmtDate(w.created_at)}
        <small className="mono">#{w.order_no}</small>
      </span>
      <span>
        <span>{w.concerns.join(' · ') || w.first_concern || 'No concern recorded'}</span>
        <span className="muted small" style={{ display: 'block' }}>
          {km(w.odometer_km)} · {w.customer_name}
          {prevOwner ? ' (previous owner)' : ''}
        </span>
      </span>
      <span style={{ display: 'grid', gap: 4, justifyItems: 'end' }}>
        <StatusPill status={w.status} />
        <b className="num">{w.total ? money(w.total) : ''}</b>
      </span>
    </button>
  );
}
