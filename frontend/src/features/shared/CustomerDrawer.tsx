import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { errorMessage } from '../../api/errors';
import { Drawer } from '../../components/Drawer';
import { PlateChip } from '../../components/PlateChip';
import { fmtDate, fmtPhone, km, money, vehicleName } from '../../lib/format';
import { isValidEmail, isValidPhone, normPhone } from '../../lib/normalize';
import { useApp } from '../../session/AppContext';
import { MSG } from '../kiosk/RegisterSteps';
import { useAction } from './useAction';
import { useDrawerNav } from './useDrawerNav';
import { VisitRow } from './VisitRow';

export function CustomerDrawer({ id }: { id: string }) {
  const { api } = useApp();
  const qc = useQueryClient();
  const nav = useDrawerNav();
  const { busy, run } = useAction();
  const { data, error } = useQuery({ queryKey: ['customer', id], queryFn: () => api.getCustomer(id) });
  const [edit, setEdit] = useState<{ name: string; phone: string; email: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (error)
    return (
      <Drawer crumb="Customer" onClose={nav.close} onBack={nav.back}>
        <p className="err">{errorMessage(error)}</p>
      </Drawer>
    );
  if (!data) return null;
  const c = data.customer;

  const setTexts = async (on: boolean) => {
    const d = await run('sms', () => api.updateCustomer(id, { sms_opt_in: on }), on ? 'Texts turned on.' : 'Texts turned off.').catch(() => undefined);
    if (d) {
      qc.setQueryData(['customer', id], d);
      void qc.invalidateQueries({ queryKey: ['job'] });
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!edit) return;
    if (!edit.name.trim()) return setErr(MSG.name);
    if (!isValidPhone(edit.phone)) return setErr(MSG.phone);
    if (edit.email.trim() && !isValidEmail(edit.email)) return setErr(MSG.email);
    setErr(null);
    const d = await run('save', () => api.updateCustomer(id, { name: edit.name.trim(), phone: normPhone(edit.phone), email: edit.email.trim() }), 'Customer details saved.').catch(() => undefined);
    if (d) {
      qc.setQueryData(['customer', id], d);
      void qc.invalidateQueries({ queryKey: ['customers'] });
      void qc.invalidateQueries({ queryKey: ['jobs'] });
      setEdit(null);
    }
  };

  return (
    <Drawer crumb={c.name} onClose={nav.close} onBack={nav.back} labelledBy="cust-title" dirty={!!edit}>
      <div>
        <span className="eyebrow">Customer</span>
        <h2 id="cust-title">{c.name}</h2>
        <p className="muted">
          {fmtPhone(c.phone)}
          {c.email ? ` · ${c.email}` : ''} · customer since {fmtDate(c.created_at)}
        </p>
      </div>
      <div className="stats">
        <span className="pill t-accent">
          {data.visit_count} visit{data.visit_count === 1 ? '' : 's'}
        </span>
        <span className="pill t-muted">Lifetime {money(data.lifetime_total)}</span>
      </div>
      <div className="sec">
        <h3>Text messages</h3>
        <div className="row">
          {c.sms_opt_in ? (
            <span>
              <span className="pill t-ok">Texts on</span>{' '}
              <span className="muted small">
                {c.sms_opt_in_source === 'kiosk' ? 'Agreed at the kiosk' : 'Turned on by staff'}
                {c.sms_opt_in_at ? ` on ${fmtDate(c.sms_opt_in_at)}` : ''}.
              </span>
            </span>
          ) : (
            <span>
              <span className="pill t-muted">Texts off</span>{' '}
              <span className="muted small">
                {c.sms_opt_in_at ? `Turned off on ${fmtDate(c.sms_opt_in_at)}.` : "The customer hasn't agreed to texts."}
              </span>
            </span>
          )}
          <button type="button" className="btn sm" disabled={!!busy} onClick={() => void setTexts(!c.sms_opt_in)}>
            {c.sms_opt_in ? 'Turn texts off' : 'Turn texts on'}
          </button>
        </div>
        {!c.sms_opt_in && <p className="hint">Only turn texts on when the customer asks for them.</p>}
      </div>
      <div className="sec">
        <h3>Vehicles</h3>
        {data.vehicles.length ? (
          <div className="tiles" style={{ marginTop: 0 }}>
            {data.vehicles.map((v) => (
              <button key={v.id} type="button" className="tile" onClick={() => nav.open('vehicle', v.id)}>
                <PlateChip plate={v.plate} />
                <span className="t-title">{vehicleName(v)}</span>
                <span className="muted small">{km(v.last_odometer_km)}</span>
                <span className="tag">
                  {v.role === 'co_owner' ? 'Co-owner' : 'Owner'} since {fmtDate(v.since)}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="muted">No current vehicles.</p>
        )}
      </div>
      {data.previous_vehicles.length > 0 && (
        <div className="sec">
          <h3>Previous vehicles</h3>
          {data.previous_vehicles.map((v) => (
            <button key={`${v.id}-${v.to_at}`} type="button" className="res-item" onClick={() => nav.open('vehicle', v.id)}>
              <PlateChip plate={v.plate} />
              <div className="grow">
                <b>{vehicleName(v)}</b>
                <div className="muted small">
                  {fmtDate(v.from_at)} – {fmtDate(v.to_at)}
                  {v.ended_reason ? ` · ${v.ended_reason}` : ''}
                </div>
              </div>
              <span className="muted" aria-hidden="true">
                ›
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="sec">
        <h3>Visit history</h3>
        {data.visits.length ? (
          <div className="timeline">
            {data.visits.map((w) => (
              <VisitRow key={w.id} w={w} prevOwner={false} showVehicle onOpen={() => nav.open('job', w.id)} />
            ))}
          </div>
        ) : (
          <p className="muted">No visits yet.</p>
        )}
      </div>
      <details
        className="edit"
        open={!!edit}
        onToggle={(e) => {
          const isOpen = (e.target as HTMLDetailsElement).open;
          if (isOpen && !edit) setEdit({ name: c.name, phone: fmtPhone(c.phone), email: c.email ?? '' });
          if (!isOpen) setEdit(null);
        }}
      >
        <summary>Edit customer details</summary>
        {edit && (
          <form className="inner" onSubmit={save} autoComplete="off" noValidate>
            <div className="grid3">
              <div className="field">
                <label className="lbl" htmlFor="ce-name">
                  Full name
                </label>
                <input id="ce-name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
              </div>
              <div className="field">
                <label className="lbl" htmlFor="ce-phone">
                  Phone
                </label>
                <input id="ce-phone" inputMode="tel" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
              </div>
              <div className="field">
                <label className="lbl" htmlFor="ce-email">
                  Email
                </label>
                <input id="ce-email" type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
              </div>
            </div>
            {err && (
              <p className="err" role="alert">
                {err}
              </p>
            )}
            <div>
              <button className="btn primary" disabled={busy === 'save'}>
                Save customer details
              </button>
            </div>
          </form>
        )}
      </details>
    </Drawer>
  );
}
