import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PlateChip } from '../../components/PlateChip';
import { fmtTime, vehicleName } from '../../lib/format';
import { useApp } from '../../session/AppContext';
import { useAction } from '../shared/useAction';
import { useDrawerNav } from '../shared/useDrawerNav';
import { ArrivalCard } from './JobCards';

export function Arrivals() {
  const { api } = useApp();
  const qc = useQueryClient();
  const nav = useDrawerNav();
  const { busy, run } = useAction();
  const arrivals = useQuery({ queryKey: ['jobs', 'arrivals'], queryFn: () => api.listJobs('arrivals') });
  const queue = useQuery({ queryKey: ['jobs', 'queue'], queryFn: () => api.listJobs('queue') });

  const accept = async (id: string, version: number, orderNo: string) => {
    const j = await run(id, () => api.jobTransition(id, 'accepted', version), `Job #${orderNo} accepted.`).catch(() => {
      void qc.invalidateQueries({ queryKey: ['jobs'] });
      return undefined;
    });
    if (j) {
      qc.setQueryData(['job', j.id], j);
      void qc.invalidateQueries({ queryKey: ['jobs'] });
      nav.open('tag', j.id);
    }
  };

  const waiting = arrivals.data ?? [];
  const accepted = [...(queue.data ?? [])].sort((a, b) => (b.accepted_at ?? '').localeCompare(a.accepted_at ?? ''));
  return (
    <div className="stack">
      <div>
        <h2>Waiting for keys</h2>
        <p className="muted">Customers who checked in at the kiosk. Take their keys, then accept the job.</p>
      </div>
      {arrivals.isLoading ? (
        <p className="muted">Loading…</p>
      ) : waiting.length ? (
        <div className="arrivals">
          {waiting.map((w) => (
            <ArrivalCard key={w.id} w={w} busy={busy === w.id} onAccept={() => accept(w.id, w.version, w.order_no)} onOpen={() => nav.open('job', w.id)} />
          ))}
        </div>
      ) : (
        <div className="panel">
          <b>No one is waiting.</b> <span className="muted">New kiosk check-ins appear here right away.</span>
        </div>
      )}
      {accepted.length > 0 && (
        <div className="sec">
          <h3>In the workshop queue ({accepted.length})</h3>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Vehicle</th>
                  <th>Customer</th>
                  <th>Keys received</th>
                  <th>
                    <span className="sr">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {accepted.map((w) => (
                  <tr key={w.id}>
                    <td className="mono">#{w.order_no}</td>
                    <td>
                      <span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                        <PlateChip plate={w.plate} />
                        {vehicleName(w)}
                      </span>
                    </td>
                    <td>{w.customer_name}</td>
                    <td>{w.accepted_at ? `${fmtTime(w.accepted_at)} · ${w.received_by_name ?? ''}` : '—'}</td>
                    <td className="r">
                      <button type="button" className="btn sm" onClick={() => nav.open('tag', w.id)}>
                        Job QR tag
                      </button>
                    </td>
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
