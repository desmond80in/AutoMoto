import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { PAGE_SIZE } from '../../api/types';
import { PlateChip } from '../../components/PlateChip';
import { fmtDate, fmtPhone, km, vehicleName } from '../../lib/format';
import { useDebounced } from '../../lib/useDebounced';
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

/** Search text (debounced) and page number; a new search goes back to the first page. */
function useListSearch() {
  const [q, setQ] = useState('');
  const [pageNo, setPageNo] = useState(0);
  const dq = useDebounced(q.trim(), 250);
  return {
    q,
    dq,
    pageNo,
    setPageNo,
    setQ: (v: string) => {
      setQ(v);
      setPageNo(0);
    },
  };
}

function SearchBox({ id, label, placeholder, value, onChange }: { id: string; label: string; placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="field list-search">
      <label className="lbl" htmlFor={id}>
        {label}
      </label>
      <input id={id} type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} spellCheck={false} autoComplete="off" />
    </div>
  );
}

function Pager({ total, pageNo, onPage, noun }: { total: number; pageNo: number; onPage: (n: number) => void; noun: string }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total ? pageNo * PAGE_SIZE + 1 : 0;
  const to = Math.min(total, (pageNo + 1) * PAGE_SIZE);
  return (
    <nav className="pager" aria-label={`${noun} pages`}>
      <span className="muted" aria-live="polite">
        {total ? `Showing ${from}–${to} of ${total} ${noun}` : `No ${noun}`}
      </span>
      {pages > 1 && (
        <span className="row" style={{ gap: 8 }}>
          <button type="button" className="btn sm" disabled={pageNo === 0} onClick={() => onPage(pageNo - 1)}>
            ‹ Previous
          </button>
          <span className="small">
            Page {pageNo + 1} of {pages}
          </span>
          <button type="button" className="btn sm" disabled={pageNo + 1 >= pages} onClick={() => onPage(pageNo + 1)}>
            Next ›
          </button>
        </span>
      )}
    </nav>
  );
}

function ListBody({ loading, empty, emptyText, children }: { loading: boolean; empty: boolean; emptyText: ReactNode; children: ReactNode }) {
  if (loading) return <p className="muted">Loading…</p>;
  if (empty) return <div className="panel">{emptyText}</div>;
  return <>{children}</>;
}

export function CustomersTab() {
  const { api } = useApp();
  const nav = useDrawerNav();
  const s = useListSearch();
  const { data } = useQuery({
    queryKey: ['customers', s.dq, s.pageNo],
    queryFn: () => api.listCustomers(s.dq, s.pageNo),
    placeholderData: keepPreviousData,
  });
  return (
    <div className="stack">
      <SearchBox id="cust-q" label="Search customers by name, phone or plate" placeholder="e.g. Okafor, 647 555, DKPL 870" value={s.q} onChange={s.setQ} />
      <ListBody loading={!data} empty={!data?.items.length} emptyText={s.dq ? <b>No customers match “{s.dq}”.</b> : 'No customers yet.'}>
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
              {data?.items.map((c) => (
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
      </ListBody>
      {data && <Pager total={data.total} pageNo={s.pageNo} onPage={s.setPageNo} noun="customers" />}
    </div>
  );
}

export function VehiclesTab() {
  const { api } = useApp();
  const nav = useDrawerNav();
  const s = useListSearch();
  const { data } = useQuery({
    queryKey: ['vehicles', s.dq, s.pageNo],
    queryFn: () => api.listVehicles(s.dq, s.pageNo),
    placeholderData: keepPreviousData,
  });
  return (
    <div className="stack">
      <SearchBox id="veh-q" label="Search vehicles by licence plate or VIN" placeholder="e.g. DKPL 870" value={s.q} onChange={s.setQ} />
      <ListBody loading={!data} empty={!data?.items.length} emptyText={s.dq ? <b>No vehicles match “{s.dq}”.</b> : 'No vehicles yet.'}>
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
              {data?.items.map((v) => (
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
      </ListBody>
      {data && <Pager total={data.total} pageNo={s.pageNo} onPage={s.setPageNo} noun="vehicles" />}
    </div>
  );
}
