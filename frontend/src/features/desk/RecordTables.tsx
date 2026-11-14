import { useQuery } from '@tanstack/react-query';
import { PlateChip } from '../../components/PlateChip';
import { fmtDate, fmtPhone, km, vehicleName } from '../../lib/format';
import { useApp } from '../../session/AppContext';
import { useDrawerNav } from '../shared/useDrawerNav';

const rowKeys = (open: () => void) => ({
  tabIndex: 0,
  onClick: open,
  onKeyDown: (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  },
});

export function CustomersTab() {
  const { api } = useApp();
  const nav = useDrawerNav();
  const { data } = useQuery({ queryKey: ['customers'], queryFn: api.listCustomers });
  if (!data) return <p className="muted">Loading…</p>;
  if (!data.length) return <p className="muted">No customers yet.</p>;
  return (
    <div className="tbl-wrap" tabIndex={0} role="region" aria-label="Customers">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Phone</th>
            <th>Vehicles</th>
            <th>Visits</th>
            <th>Last visit</th>
          </tr>
        </thead>
        <tbody>
          {data.map((c) => (
            <tr key={c.id} className="click" {...rowKeys(() => nav.open('customer', c.id))}>
              <td>
                <b>{c.name}</b>
              </td>
              <td className="num">{fmtPhone(c.phone)}</td>
              <td>
                <span className="row" style={{ gap: 6 }}>
                  {c.plates.length ? c.plates.map((p) => <PlateChip key={p} plate={p} />) : <span className="muted">None</span>}
                </span>
              </td>
              <td className="num">{c.visit_count}</td>
              <td>{fmtDate(c.last_visit_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function VehiclesTab() {
  const { api } = useApp();
  const nav = useDrawerNav();
  const { data } = useQuery({ queryKey: ['vehicles'], queryFn: api.listVehicles });
  if (!data) return <p className="muted">Loading…</p>;
  if (!data.length) return <p className="muted">No vehicles yet.</p>;
  return (
    <div className="tbl-wrap" tabIndex={0} role="region" aria-label="Vehicles">
      <table>
        <thead>
          <tr>
            <th>Plate</th>
            <th>Vehicle</th>
            <th>Current owner(s)</th>
            <th>Owners on record</th>
            <th>Visits</th>
            <th className="r">Last odometer</th>
          </tr>
        </thead>
        <tbody>
          {data.map((v) => (
            <tr key={v.id} className="click" {...rowKeys(() => nav.open('vehicle', v.id))}>
              <td>
                <PlateChip plate={v.plate} />
              </td>
              <td>
                <b>{vehicleName(v)}</b>
              </td>
              <td>{v.current_owners.join(', ') || '—'}</td>
              <td className="num">{v.owners_on_record}</td>
              <td className="num">{v.visit_count}</td>
              <td className="r num">{km(v.last_odometer_km)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
