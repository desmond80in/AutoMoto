import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { errorMessage } from '../../api/errors';
import type { VehicleDetail } from '../../api/types';
import { Drawer } from '../../components/Drawer';
import { PlateChip } from '../../components/PlateChip';
import { VehicleFields, type VehicleDraft } from '../../components/YearMakeModel';
import { fmtDate, fmtPhone, fmtPlate, km, vehicleName } from '../../lib/format';
import { isValidPhone, normPhone } from '../../lib/normalize';
import { useApp } from '../../session/AppContext';
import { MSG, toVehicleInput, validateVehicle } from '../kiosk/RegisterSteps';
import { useAction } from './useAction';
import { useDrawerNav } from './useDrawerNav';
import { VisitRow } from './VisitRow';

const roleTag = (r: string) => (r === 'co_owner' ? 'Co-owner' : 'Owner');

export function VehicleDrawer({ id }: { id: string }) {
  const { api } = useApp();
  const qc = useQueryClient();
  const nav = useDrawerNav();
  const { busy, run } = useAction();
  const { data, error } = useQuery({ queryKey: ['vehicle', id], queryFn: () => api.getVehicle(id) });
  const [add, setAdd] = useState({ phone: '', name: '', mode: 'co_owner' as 'co_owner' | 'transfer' });
  const [addErr, setAddErr] = useState<string | null>(null);
  const [startFor, setStartFor] = useState<string>('');
  const [startConcern, setStartConcern] = useState('');
  const [edit, setEdit] = useState<VehicleDraft | null>(null);
  const [editErr, setEditErr] = useState<string[]>([]);

  if (error)
    return (
      <Drawer crumb="Vehicle" onClose={nav.close} onBack={nav.back}>
        <p className="err">{errorMessage(error)}</p>
      </Drawer>
    );
  if (!data) return null;
  const v = data.vehicle;
  const cur = data.current_owners;
  const openJob = data.history.find((w) => w.status !== 'picked_up' && w.status !== 'cancelled');

  const apply = (d: VehicleDetail | undefined) => {
    if (!d) return;
    qc.setQueryData(['vehicle', id], d);
    void qc.invalidateQueries({ queryKey: ['vehicles'] });
    void qc.invalidateQueries({ queryKey: ['customers'] });
    void qc.invalidateQueries({ queryKey: ['jobs'] });
    void qc.invalidateQueries({ queryKey: ['customer'] });
  };

  const addOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidPhone(add.phone)) return setAddErr(MSG.phone);
    setAddErr(null);
    try {
      apply(await run('add', () => api.ownerAdd(id, normPhone(add.phone), add.name.trim(), add.mode), 'Owner updated.'));
      setAdd({ phone: '', name: '', mode: 'co_owner' });
    } catch (x) {
      setAddErr(errorMessage(x).includes('name field') ? 'No customer has that number yet. Add their name.' : null);
    }
  };

  const startWorkOrder = async () => {
    const customer = startFor || cur[0]?.customer_id;
    if (!customer || !startConcern.trim()) return;
    const j = await run('start', () => api.createWorkOrder({ vehicle_id: id, customer_id: customer, reasons: ['mechanical'], concerns: [startConcern.trim()] }), (r) => `Work order #${r.order_no} created.`).catch(() => undefined);
    if (j) {
      setStartConcern('');
      void qc.invalidateQueries({ queryKey: ['jobs'] });
      nav.open('job', j.id);
    }
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!edit) return;
    const errs = Object.values(validateVehicle(edit));
    setEditErr(errs);
    if (errs.length) return;
    const d = await run('edit', () => api.updateVehicle(id, toVehicleInput(edit)), 'Vehicle details saved.', { plate: edit.plate }).catch(() => undefined);
    if (d) {
      apply(d);
      setEdit(null);
    }
  };

  const curIds = new Set(cur.map((o) => o.customer_id));
  return (
    <Drawer crumb={`${fmtPlate(v.plate)} · ${vehicleName(v)}`} onClose={nav.close} onBack={nav.back} labelledBy="veh-title" dirty={!!edit}>
      <div className="row" style={{ gap: 18 }}>
        <PlateChip plate={v.plate} size="lg" />
        <div>
          <span className="eyebrow">Vehicle</span>
          <h2 id="veh-title">{vehicleName(v)}</h2>
          <p className="muted small">
            {v.engine || 'Engine size not recorded'} · VIN <span className="mono">{v.vin || 'not recorded'}</span> · {km(data.last_odometer_km)}
          </p>
        </div>
      </div>

      {openJob ? (
        <div className="panel row">
          <span className="grow">
            <b>In the shop</b> on work order <span className="mono">#{openJob.order_no}</span>. Add new concerns to that job.
          </span>
          <button type="button" className="btn primary" onClick={() => nav.open('job', openJob.id)}>
            Open job #{openJob.order_no}
          </button>
        </div>
      ) : (
        <form
          className="row"
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault();
            void startWorkOrder();
          }}
        >
          {cur.length > 0 && (
            <>
              <label className="sr" htmlFor="wo-concern">
                Customer concern for the new work order
              </label>
              <input id="wo-concern" style={{ maxWidth: 340 }} placeholder="Customer concern, e.g. Oil change" value={startConcern} onChange={(e) => setStartConcern(e.target.value)} />
            </>
          )}
          {cur.length > 1 && (
            <>
              <label className="sr" htmlFor="wo-for">
                Customer for the new work order
              </label>
              <select id="wo-for" style={{ width: 'auto' }} value={startFor || cur[0]!.customer_id} onChange={(e) => setStartFor(e.target.value)}>
                {cur.map((o) => (
                  <option key={o.customer_id} value={o.customer_id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </>
          )}
          <button className="btn primary" disabled={!cur.length || !startConcern.trim() || busy === 'start'}>
            + Start work order
          </button>
          {!cur.length && <span className="hint">Add an owner first.</span>}
        </form>
      )}

      <div className="sec">
        <h3>Current owners</h3>
        {cur.length ? (
          cur.map((o) => (
            <div className="owner" key={o.id}>
              <div className="grow">
                <button type="button" className="link" onClick={() => nav.open('customer', o.customer_id)}>
                  {o.name}
                </button>
                <div className="muted small">
                  {fmtPhone(o.phone)} · since {fmtDate(o.since)}
                </div>
              </div>
              <span className="tag">{roleTag(o.role)}</span>
              {!o.verified && (
                <>
                  <span className="pill t-warn">Added at kiosk</span>
                  <button type="button" className="btn sm" disabled={!!busy} onClick={() => run('verify', () => api.ownerVerify(o.id), 'Owner verified.').then(apply, () => undefined)}>
                    Mark verified
                  </button>
                </>
              )}
              <button type="button" className="btn sm ghost" disabled={!!busy} onClick={() => run('end', () => api.ownerEnd(o.id), 'Ownership ended.').then(apply, () => undefined)}>
                End ownership
              </button>
            </div>
          ))
        ) : (
          <p className="muted">No current owner on file.</p>
        )}
        <form className="panel inline-form" onSubmit={addOwner} autoComplete="off" noValidate>
          <div className="field">
            <label className="lbl" htmlFor="ao-phone">
              Phone
            </label>
            <input id="ao-phone" inputMode="tel" placeholder="Existing or new customer" value={add.phone} onChange={(e) => setAdd({ ...add, phone: e.target.value })} />
          </div>
          <div className="field">
            <label className="lbl" htmlFor="ao-name">
              Name (if new)
            </label>
            <input id="ao-name" value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} />
          </div>
          <div className="field">
            <label className="lbl" htmlFor="ao-mode">
              Change
            </label>
            <select id="ao-mode" value={add.mode} onChange={(e) => setAdd({ ...add, mode: e.target.value as 'co_owner' | 'transfer' })}>
              <option value="co_owner">Add as co-owner</option>
              <option value="transfer">Sold to this person</option>
            </select>
          </div>
          <button className="btn" disabled={busy === 'add'}>
            Apply
          </button>
          {addErr && (
            <p className="err small" role="alert" style={{ gridColumn: '1 / -1' }}>
              {addErr}
            </p>
          )}
        </form>
      </div>

      {data.previous_owners.length > 0 && (
        <div className="sec">
          <h3>Previous owners</h3>
          {data.previous_owners.map((o) => (
            <div className="owner" key={o.id}>
              <div className="grow">
                <button type="button" className="link" onClick={() => nav.open('customer', o.customer_id)}>
                  {o.name}
                </button>
                <div className="muted small">
                  {fmtDate(o.from_at)} – {fmtDate(o.to_at)}
                  {o.ended_reason ? ` · ${o.ended_reason}` : ''}
                </div>
              </div>
              <span className="tag">{roleTag(o.role)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="sec">
        <h3>
          Service history{' '}
          <span className="mono" style={{ fontSize: 14 }}>
            ({data.history.length})
          </span>
        </h3>
        {data.history.length ? (
          <div className="timeline">
            {data.history.map((w) => (
              <VisitRow key={w.id} w={w} prevOwner={!curIds.has(w.customer_id ?? '')} onOpen={() => nav.open('job', w.id)} />
            ))}
          </div>
        ) : (
          <p className="muted">No visits yet.</p>
        )}
      </div>

      <details className="edit" open={!!edit} onToggle={(e) => {
        const isOpen = (e.target as HTMLDetailsElement).open;
        if (isOpen && !edit) setEdit({ plate: fmtPlate(v.plate), year: v.year ? String(v.year) : '', make: v.make, model: v.model, engine: v.engine ?? '', vin: v.vin ?? '' });
        if (!isOpen) setEdit(null);
      }}>
        <summary>Edit vehicle details</summary>
        {edit && (
          <form className="inner" onSubmit={saveEdit} autoComplete="off" noValidate>
            <VehicleFields value={edit} onChange={setEdit} idPrefix="ve" />
            {editErr.length > 0 && <p className="err" role="alert">{editErr.join(' ')}</p>}
            <div>
              <button className="btn primary" disabled={busy === 'edit'}>
                Save vehicle details
              </button>
            </div>
          </form>
        )}
      </details>
    </Drawer>
  );
}
