import { useQuery } from '@tanstack/react-query';
import type { JobStatus } from '../../api/types';
import { PlateChip } from '../../components/PlateChip';
import { STATUS_INFO } from '../../components/StatusPill';
import { fmtDate, money, vehicleName } from '../../lib/format';
import { localDay } from '../../lib/time';
import { useApp } from '../../session/AppContext';
import { useDrawerNav } from '../shared/useDrawerNav';
import { WoCard } from './JobCards';

const COLS: JobStatus[] = ['checked_in', 'accepted', 'in_progress', 'waiting_parts', 'ready'];

export function JobsBoard() {
  const { api } = useApp();
  const nav = useDrawerNav();
  const active = useQuery({ queryKey: ['jobs', 'active'], queryFn: () => api.listJobs('active') });
  const picked = useQuery({ queryKey: ['jobs', 'recent_picked_up'], queryFn: () => api.listJobs('recent_picked_up') });
  const all = active.data ?? [];
  const recent = picked.data ?? [];
  const today = localDay();
  const pickedToday = recent.filter((w) => w.picked_up_at && localDay(w.picked_up_at) === today).length;

  return (
    <div className="stack">
      <div className="stats">
        {COLS.map((s) => (
          <span key={s} className={`pill t-${STATUS_INFO[s].tone}`}>
            {STATUS_INFO[s].staff}: {all.filter((w) => w.status === s).length}
          </span>
        ))}
        <span className="pill t-muted">Picked up today: {pickedToday}</span>
      </div>
      <div className="board">
        {COLS.map((s) => {
          const ws = all.filter((w) => w.status === s);
          return (
            <section className="col" key={s} aria-label={STATUS_INFO[s].staff}>
              <div className="col-h">
                <b>{STATUS_INFO[s].staff}</b>
                <span className="mono muted">{ws.length}</span>
              </div>
              {ws.length ? ws.map((w) => <WoCard key={w.id} w={w} onOpen={() => nav.open('job', w.id)} />) : <div className="col-empty">Nothing here.</div>}
            </section>
          );
        })}
      </div>
      {recent.length > 0 && (
        <div className="stack-sm">
          <h3>Recently picked up</h3>
          <div className="tbl-wrap" tabIndex={0} role="region" aria-label="Recently picked up">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Date</th>
                  <th>Vehicle</th>
                  <th>Customer</th>
                  <th className="r">Total</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((w) => (
                  <tr key={w.id} className="click" tabIndex={0} onClick={() => nav.open('job', w.id)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && nav.open('job', w.id)}>
                    <td className="mono">#{w.order_no}</td>
                    <td>{fmtDate(w.picked_up_at ?? w.created_at)}</td>
                    <td>
                      <span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                        <PlateChip plate={w.plate} />
                        {vehicleName(w)}
                      </span>
                    </td>
                    <td>{w.customer_name}</td>
                    <td className="r num">{money(w.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
