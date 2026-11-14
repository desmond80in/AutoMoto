import type { JobSummary } from '../../api/types';
import { PlateChip } from '../../components/PlateChip';
import { StatusPill } from '../../components/StatusPill';
import { fmtDate, km, money, vehicleName } from '../../lib/format';

/** One visit in a history list. `showVehicle` adds the plate and year/make/model (customer history spans vehicles). */
export function VisitRow({
  w,
  prevOwner,
  showVehicle = false,
  onOpen,
}: {
  w: JobSummary;
  prevOwner: boolean;
  showVehicle?: boolean;
  onOpen: () => void;
}) {
  return (
    <button type="button" className="visit" onClick={onOpen}>
      <span className="d">
        {fmtDate(w.created_at)}
        <small className="mono">#{w.order_no}</small>
      </span>
      <span>
        {showVehicle && (
          <span className="visit-veh">
            <PlateChip plate={w.plate} size="sm" />
            <b>{vehicleName(w)}</b>
          </span>
        )}
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
