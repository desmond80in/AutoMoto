import { useCallback, useEffect, useReducer, useState } from 'react';
import { errorMessage } from '../../api/errors';
import type { KioskVehicle } from '../../api/types';
import { Dialog } from '../../components/Dialog';
import { PlateChip } from '../../components/PlateChip';
import { useToast } from '../../components/Toast';
import { fmtDate, km, vehicleName } from '../../lib/format';
import { useApp } from '../../session/AppContext';
import { initialKiosk, kioskReducer, STEP_INDEX, type KioskState } from './reducer';
import { LinkOwnerStep, RegisterStep, AddVehicleStep } from './RegisterSteps';
import { useInactivity } from './useInactivity';
import { VisitStep } from './VisitStep';

export type Dispatch = React.Dispatch<Parameters<typeof kioskReducer>[1]>;

const LABELS = ['Find your records', 'Choose your vehicle', 'Describe the problem & sign'];

export function KioskPage() {
  const [s, dispatch] = useReducer(kioskReducer, undefined, () => initialKiosk());
  const [drawing, setDrawing] = useState(false);
  const reset = useCallback(() => dispatch({ type: 'reset' }), []);
  const { countdown, stillHere } = useInactivity(s.step !== 'search' && s.step !== 'done', drawing, reset);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [s.step]);

  useEffect(() => {
    if (s.step !== 'done') return;
    const t = setTimeout(reset, 30_000);
    return () => clearTimeout(t);
  }, [s.step, reset]);

  const idx = STEP_INDEX[s.step];
  return (
    <section className="kiosk" key={s.run}>
      {s.step !== 'done' && (
        <ol className="steps" aria-label="Check-in progress">
          {LABELS.map((l, i) => (
            <li
              key={l}
              className={i < idx ? 'done' : i === idx ? 'on' : ''}
              aria-current={i === idx ? 'step' : undefined}
            >
              {l}
            </li>
          ))}
        </ol>
      )}
      <Body s={s} dispatch={dispatch} setDrawing={setDrawing} />
      {countdown !== null && (
        <Dialog title="Are you still there?" onClose={stillHere}>
          <div className="stack-sm">
            <p className="muted">For your privacy, this screen will start over in</p>
            <div className="inactive-count" aria-live="assertive">
              {countdown}
            </div>
            <button type="button" className="btn primary big" onClick={stillHere}>
              I'm still here
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}

function Body({ s, dispatch, setDrawing }: { s: KioskState; dispatch: Dispatch; setDrawing: (d: boolean) => void }) {
  switch (s.step) {
    case 'search':
      return <SearchStep s={s} dispatch={dispatch} />;
    case 'notFound':
      return (
        <div className="card stack">
          <div>
            <h1>We couldn't find “{s.query.trim()}”.</h1>
            <p className="lede">Check the number or plate, or register now. It takes about a minute.</p>
          </div>
          <div className="row">
            <button
              type="button"
              className="btn primary big"
              onClick={() => dispatch({ type: 'startRegister' })}
              autoFocus
            >
              Register as a new customer
            </button>
            <button type="button" className="btn big" onClick={() => dispatch({ type: 'reset' })}>
              Try again
            </button>
          </div>
        </div>
      );
    case 'pickCustomer':
      return <PickCustomerStep s={s} dispatch={dispatch} />;
    case 'pickVehicle':
      return <PickVehicleStep s={s} dispatch={dispatch} />;
    case 'whoAreYou':
      return <WhoStep s={s} dispatch={dispatch} />;
    case 'register':
      return <RegisterStep dispatch={dispatch} />;
    case 'addVehicle':
      return <AddVehicleStep s={s} dispatch={dispatch} />;
    case 'linkOwner':
      return <LinkOwnerStep s={s} dispatch={dispatch} />;
    case 'visit':
      return <VisitStep s={s} dispatch={dispatch} setDrawing={setDrawing} />;
    case 'done':
      return <DoneStep s={s} dispatch={dispatch} />;
  }
}

function SearchStep({ s, dispatch }: { s: KioskState; dispatch: Dispatch }) {
  const { api } = useApp();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (s.query.trim().length < 2) return;
    setBusy(true);
    try {
      dispatch({ type: 'lookup', result: await api.kioskLookup(s.query) });
    } catch (x) {
      toast(errorMessage(x), 'err');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card">
      <h1>Welcome. Let's check in your vehicle.</h1>
      <p className="lede">Enter your phone number or licence plate and we'll pull up your records.</p>
      <form className="bigsearch" onSubmit={submit} autoComplete="off">
        <label htmlFor="q" className="sr">
          Phone number or licence plate
        </label>
        <input
          id="q"
          value={s.query}
          onChange={(e) => dispatch({ type: 'query', query: e.target.value })}
          placeholder="Phone or plate"
          autoCapitalize="characters"
          spellCheck={false}
          autoFocus
        />
        <button className="btn primary big" disabled={busy}>
          Find my records
        </button>
      </form>
      <p className="small" style={{ marginTop: 14 }}>
        First visit?{' '}
        <button type="button" className="link" onClick={() => dispatch({ type: 'startRegister' })}>
          Register as a new customer
        </button>
      </p>
    </div>
  );
}

function PickCustomerStep({ s, dispatch }: { s: KioskState; dispatch: Dispatch }) {
  const { api } = useApp();
  const toast = useToast();
  const choose = async (id: string, maskedName: string) => {
    try {
      const r = await api.kioskCustomerVehicles(id);
      dispatch({
        type: 'customerVehicles',
        customer: {
          id: r.customer.id,
          firstName: r.customer.first_name || maskedName.split(' ')[0]!,
          phoneLast4: r.customer.phone_last4,
        },
        vehicles: r.vehicles,
      });
    } catch (e) {
      toast(errorMessage(e), 'err');
    }
  };
  return (
    <div className="card">
      <h1>Who's checking in?</h1>
      <p className="lede">More than one customer uses this phone number.</p>
      <div className="tiles">
        {s.customers.map((c) => (
          <button key={c.id} type="button" className="tile" onClick={() => choose(c.id, c.masked_name)}>
            <span className="t-title">{c.masked_name}</span>
            <span className="muted">Phone ending {c.phone_last4}</span>
          </button>
        ))}
      </div>
      <div className="row" style={{ marginTop: 18 }}>
        <button type="button" className="btn ghost" onClick={() => dispatch({ type: 'reset' })}>
          Start over
        </button>
      </div>
    </div>
  );
}

function VehicleTile({ v, onClick }: { v: KioskVehicle; onClick: () => void }) {
  if (v.in_shop)
    return (
      <button type="button" className="tile" disabled aria-describedby={`in-shop-${v.id}`}>
        <PlateChip plate={v.plate} />
        <span className="t-title">{vehicleName(v)}</span>
        <span className="tag">Already checked in</span>
        <span className="muted small" id={`in-shop-${v.id}`}>
          This vehicle is already with us. Please see the front desk.
        </span>
      </button>
    );
  return (
    <button type="button" className="tile" onClick={onClick}>
      <PlateChip plate={v.plate} />
      <span className="t-title">{vehicleName(v)}</span>
      <span className="muted small">
        {v.last_visit_at
          ? `Last visit ${fmtDate(v.last_visit_at)}${v.last_odometer_km ? ` · ${km(v.last_odometer_km)}` : ''}`
          : 'No visits yet'}
      </span>
      {v.role === 'co_owner' && <span className="tag">Shared vehicle</span>}
    </button>
  );
}

function PickVehicleStep({ s, dispatch }: { s: KioskState; dispatch: Dispatch }) {
  return (
    <div className="card">
      <h1>Welcome back, {s.customer?.firstName}.</h1>
      <p className="lede">
        {s.vehicles.length
          ? 'Which vehicle are you bringing in today?'
          : 'Tell us about the vehicle you brought in today.'}
      </p>
      <div className="tiles">
        {s.vehicles.map((v) => (
          <VehicleTile key={v.id} v={v} onClick={() => dispatch({ type: 'chooseVehicle', vehicle: v })} />
        ))}
        <button type="button" className="tile add" onClick={() => dispatch({ type: 'startAddVehicle' })}>
          + A different vehicle
        </button>
      </div>
      <div className="row" style={{ marginTop: 18 }}>
        <button type="button" className="btn ghost" onClick={() => dispatch({ type: 'reset' })}>
          Not you? Start over
        </button>
      </div>
    </div>
  );
}

function WhoStep({ s, dispatch }: { s: KioskState; dispatch: Dispatch }) {
  const v = s.vehicle!;
  return (
    <div className="card">
      <div className="row" style={{ gap: 16 }}>
        <PlateChip plate={v.plate} size="lg" />
        <div>
          <h2>{vehicleName(v)}</h2>
          <p className="muted">We found this vehicle.</p>
        </div>
      </div>
      {v.in_shop ? (
        <p className="lede" style={{ marginTop: 18 }}>
          This vehicle is already checked in. Please see the front desk if you'd like to add something.
        </p>
      ) : (
        <>
          <p className="lede" style={{ marginTop: 18 }}>
            Who's checking it in today?
          </p>
          <div className="tiles">
            {s.owners.map((o) => (
              <button
                key={o.customer_id}
                type="button"
                className="tile"
                onClick={() => dispatch({ type: 'chooseOwner', owner: o })}
              >
                <span className="t-title">{o.masked_name}</span>
                <span className="muted">Phone ending {o.phone_last4}</span>
                {o.role === 'co_owner' && <span className="tag">Co-owner</span>}
              </button>
            ))}
            <button type="button" className="tile add" onClick={() => dispatch({ type: 'notListed' })}>
              I'm not listed
            </button>
          </div>
        </>
      )}
      <div className="row" style={{ marginTop: 18 }}>
        <button type="button" className="btn ghost" onClick={() => dispatch({ type: 'reset' })}>
          Start over
        </button>
      </div>
    </div>
  );
}

function DoneStep({ s, dispatch }: { s: KioskState; dispatch: Dispatch }) {
  const d = s.done!;
  return (
    <div className="card stack" style={{ textAlign: 'center', justifyItems: 'center' }}>
      <span className="eyebrow">Work order</span>
      <div className="done-num" data-testid="order-no">
        #{d.order_no}
      </div>
      <h1>You're checked in, {d.first_name}.</h1>
      <p className="lede" style={{ margin: '0 auto' }}>
        Please hand your keys to the front desk. We'll call {d.phone_masked} with an estimate before doing any work
        beyond the inspection.
      </p>
      {s.vehicle && (
        <div className="row" style={{ justifyContent: 'center' }}>
          <PlateChip plate={s.vehicle.plate} />
          <span>{vehicleName(s.vehicle)}</span>
        </div>
      )}
      <button type="button" className="btn primary big" onClick={() => dispatch({ type: 'reset' })} autoFocus>
        Done
      </button>
      <span className="hint">This screen resets in 30 seconds.</span>
    </div>
  );
}
