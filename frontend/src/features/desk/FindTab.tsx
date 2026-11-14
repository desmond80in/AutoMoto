import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { PlateChip } from '../../components/PlateChip';
import { StatusPill } from '../../components/StatusPill';
import { fmtDate, fmtPhone, vehicleName } from '../../lib/format';
import { useDebounced } from '../../lib/useDebounced';
import { useApp } from '../../session/AppContext';
import { useDrawerNav } from '../shared/useDrawerNav';

export function FindTab() {
  const { api } = useApp();
  const nav = useDrawerNav();
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 250);
  const { data, isFetching } = useQuery({ queryKey: ['search', dq], queryFn: () => api.searchAll(dq), enabled: dq.length >= 2 });

  return (
    <div className="stack">
      <div className="field" style={{ maxWidth: 560 }}>
        <label className="lbl" htmlFor="find-q">
          Search by name, phone, plate, VIN or order number
        </label>
        <input id="find-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Okafor, 647 555, DKPL 870, 261107-01" spellCheck={false} autoFocus />
      </div>
      <div aria-live="polite">
        {dq.length < 2 ? (
          <p className="muted">Type at least two characters.</p>
        ) : !data ? (
          <p className="muted">{isFetching ? 'Searching…' : ''}</p>
        ) : !data.customers.length && !data.vehicles.length && !data.jobs.length ? (
          <div className="panel stack-sm">
            <b>No matches for “{dq}”.</b>
            <span className="muted">New customers register themselves at the kiosk.</span>
          </div>
        ) : (
          <div className="results">
            {data.customers.length > 0 && (
              <div className="res-group">
                <h3>Customers</h3>
                {data.customers.map((c) => (
                  <button key={c.id} type="button" className="res-item" onClick={() => nav.open('customer', c.id)}>
                    <div className="grow">
                      <b>{c.name}</b>
                      <div className="muted small">
                        {fmtPhone(c.phone)} · {c.vehicle_count} vehicle{c.vehicle_count === 1 ? '' : 's'}
                      </div>
                    </div>
                    <span className="muted" aria-hidden="true">›</span>
                  </button>
                ))}
              </div>
            )}
            {data.vehicles.length > 0 && (
              <div className="res-group">
                <h3>Vehicles</h3>
                {data.vehicles.map((v) => (
                  <button key={v.id} type="button" className="res-item" onClick={() => nav.open('vehicle', v.id)}>
                    <PlateChip plate={v.plate} />
                    <div className="grow">
                      <b>{vehicleName(v)}</b>
                      <div className="muted small">{v.current_owners.join(', ') || 'No current owner'}</div>
                    </div>
                    <span className="muted" aria-hidden="true">›</span>
                  </button>
                ))}
              </div>
            )}
            {data.jobs.length > 0 && (
              <div className="res-group">
                <h3>Work orders</h3>
                {data.jobs.map((w) => (
                  <button key={w.id} type="button" className="res-item" onClick={() => nav.open('job', w.id)}>
                    <span className="mono">#{w.order_no}</span>
                    <div className="grow">
                      <b>{vehicleName(w)}</b>
                      <div className="muted small">
                        {fmtDate(w.created_at)} · {w.first_concern ?? ''}
                      </div>
                    </div>
                    <StatusPill status={w.status} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
