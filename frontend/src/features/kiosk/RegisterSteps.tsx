import { useState } from 'react';
import { errorMessage } from '../../api/errors';
import type { VehicleInput } from '../../api/rpc';
import { PlateChip } from '../../components/PlateChip';
import { useToast } from '../../components/Toast';
import { blankVehicle, VehicleFields, type VehicleDraft } from '../../components/YearMakeModel';
import { VoiceBox } from '../../components/VoiceBox';
import { canonMake, canonModel } from '../../data/catalog';
import { fmtPhone, fmtPlate, vehicleName } from '../../lib/format';
import { isValidEmail, isValidPhone, isValidPlate, isValidVin, normPhone, normPlate } from '../../lib/normalize';
import { useApp } from '../../session/AppContext';
import type { Dispatch } from './KioskPage';
import type { KioskState, KioskVehicleRef } from './reducer';

export const MSG = {
  phone: 'Enter a 10-digit phone number.',
  plate: 'Enter the licence plate (2 to 8 letters and numbers).',
  vin: 'A VIN has 17 characters. Leave it blank if unsure.',
  name: 'Enter your full name.',
  email: 'Check the email address, or leave it blank.',
  make: 'Choose the make.',
  model: 'Choose the model.',
};

type VehErrors = Partial<Record<keyof VehicleDraft, string>>;

export function validateVehicle(v: VehicleDraft): VehErrors {
  const e: VehErrors = {};
  if (!isValidPlate(v.plate)) e.plate = MSG.plate;
  if (!v.make.trim()) e.make = MSG.make;
  if (!v.model.trim()) e.model = MSG.model;
  if (!isValidVin(v.vin)) e.vin = MSG.vin;
  return e;
}

export function toVehicleInput(v: VehicleDraft): VehicleInput {
  return {
    plate: normPlate(v.plate),
    year: v.year ? Number(v.year) : null,
    make: v.make.trim(),
    model: v.model.trim(),
    engine: v.engine.trim() || undefined,
    vin: normPlate(v.vin) || undefined,
  };
}

const vehicleRef = (id: string, v: VehicleDraft): KioskVehicleRef => ({
  id,
  plate: normPlate(v.plate),
  year: v.year ? Number(v.year) : null,
  make: v.make.trim(),
  model: v.model.trim(),
  last_odometer_km: null,
});

function ErrorList({ errors }: { errors: string[] }) {
  if (!errors.length) return null;
  return (
    <ul className="err" role="alert" style={{ margin: 0, paddingLeft: 20 }}>
      {errors.map((e) => (
        <li key={e}>{e}</li>
      ))}
    </ul>
  );
}

export function RegisterStep({ dispatch }: { dispatch: Dispatch }) {
  const { api, intake } = useApp();
  const toast = useToast();
  const [c, setC] = useState({ name: '', phone: '', email: '' });
  const [v, setV] = useState<VehicleDraft>(blankVehicle);
  const [vKey, setVKey] = useState(0);
  const [story, setStory] = useState('');
  const [ai, setAi] = useState<{ busy: boolean; msg: string | null; filled: boolean }>({ busy: false, msg: null, filled: false });
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const fill = async () => {
    if (story.trim().length < 8) return setAi({ ...ai, msg: 'Tell us your name, phone number and car first.' });
    setAi({ busy: true, msg: null, filled: false });
    try {
      const r = await intake.registration(story.trim());
      setC((p) => ({
        name: r.name || p.name,
        phone: r.phone ? fmtPhone(r.phone) : p.phone,
        email: r.email || p.email,
      }));
      const make = canonMake(r.make) ?? r.make;
      setV((p) => ({
        plate: r.plate ? fmtPlate(r.plate) : p.plate,
        year: r.year || p.year,
        make: make || p.make,
        model: (make && canonModel(make, r.model)) || r.model || p.model,
        engine: r.engine || p.engine,
        vin: r.vin || p.vin,
      }));
      setVKey((k) => k + 1);
      setAi({ busy: false, msg: null, filled: true });
    } catch (e) {
      setAi({ busy: false, msg: errorMessage(e), filled: false });
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: string[] = [];
    if (!c.name.trim()) errs.push(MSG.name);
    if (!isValidPhone(c.phone)) errs.push(MSG.phone);
    if (c.email.trim() && !isValidEmail(c.email)) errs.push(MSG.email);
    errs.push(...Object.values(validateVehicle(v)));
    setErrors(errs);
    if (errs.length) return;
    setBusy(true);
    try {
      const r = await api.kioskRegister({ name: c.name.trim(), phone: normPhone(c.phone), email: c.email.trim() || undefined }, toVehicleInput(v));
      dispatch({
        type: 'vehicleSaved',
        customer: { id: r.customer_id, firstName: r.first_name, phoneLast4: normPhone(c.phone).slice(-4) },
        vehicle: vehicleRef(r.vehicle_id, v),
        next: r.next,
      });
    } catch (x) {
      toast(errorMessage(x), 'err');
      setBusy(false);
    }
  };

  return (
    <form className="card stack" onSubmit={submit} autoComplete="off" noValidate>
      <div>
        <h1>New customer</h1>
        <p className="lede">We'll use your phone number or plate to find your records next time.</p>
      </div>
      <VoiceBox
        mode="registration"
        text={story}
        onText={setStory}
        onFill={fill}
        busy={ai.busy}
        message={ai.msg}
        result={
          ai.filled ? (
            <div className="understood">
              <b>We filled in what we heard.</b>
              <p className="hint">Check each field below before you continue.</p>
            </div>
          ) : null
        }
      />
      <h3>Your details</h3>
      <div className="grid3">
        <div className="field">
          <label className="lbl" htmlFor="rg-name">
            Full name
          </label>
          <input id="rg-name" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} autoComplete="name" />
        </div>
        <div className="field">
          <label className="lbl" htmlFor="rg-phone">
            Phone number
          </label>
          <input id="rg-phone" value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} inputMode="tel" placeholder="416 555 0100" />
        </div>
        <div className="field">
          <label className="lbl" htmlFor="rg-email">
            Email <span style={{ textTransform: 'none' }}>(optional)</span>
          </label>
          <input id="rg-email" type="email" inputMode="email" value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} />
        </div>
      </div>
      <h3>Your vehicle</h3>
      <VehicleFields key={vKey} value={v} onChange={setV} idPrefix="rg" />
      <ErrorList errors={errors} />
      <div className="row">
        <button className="btn primary big" disabled={busy}>
          Continue
        </button>
        <button type="button" className="btn big" onClick={() => dispatch({ type: 'reset' })}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function AddVehicleStep({ s, dispatch }: { s: KioskState; dispatch: Dispatch }) {
  const { api } = useApp();
  const toast = useToast();
  const [v, setV] = useState<VehicleDraft>(blankVehicle);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = Object.values(validateVehicle(v));
    setErrors(errs);
    if (errs.length || !s.customer) return;
    setBusy(true);
    try {
      const r = await api.kioskAddVehicle(s.customer.id, toVehicleInput(v));
      dispatch({ type: 'vehicleSaved', customer: s.customer, vehicle: vehicleRef(r.vehicle_id, v), next: r.next });
    } catch (x) {
      toast(errorMessage(x), 'err');
      setBusy(false);
    }
  };

  return (
    <form className="card stack" onSubmit={submit} autoComplete="off" noValidate>
      <div>
        <h1>Add a vehicle</h1>
        <p className="lede">If this vehicle has been here before under someone else, we'll link it to you.</p>
      </div>
      <VehicleFields value={v} onChange={setV} idPrefix="av" />
      <ErrorList errors={errors} />
      <div className="row">
        <button className="btn primary big" disabled={busy}>
          Continue
        </button>
        <button type="button" className="btn big" onClick={() => dispatch({ type: 'backToVehicles' })}>
          Back
        </button>
      </div>
    </form>
  );
}

export function LinkOwnerStep({ s, dispatch }: { s: KioskState; dispatch: Dispatch }) {
  const { api } = useApp();
  const toast = useToast();
  const v = s.vehicle!;
  const known = s.customer;
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'transfer' | 'co_owner'>('transfer');
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const ownerNames = s.owners.map((o) => o.masked_name).join(' and ');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: string[] = [];
    if (!known && !isValidPhone(phone)) errs.push(MSG.phone);
    setErrors(errs);
    if (errs.length) return;
    setBusy(true);
    try {
      const r = await api.kioskLinkOwner(v.id, known ? { customer_id: known.id } : { phone: normPhone(phone), name: name.trim() }, mode);
      dispatch({
        type: 'linked',
        customer: { id: r.customer_id, firstName: r.first_name, phoneLast4: known ? known.phoneLast4 : normPhone(phone).slice(-4) },
      });
    } catch (x) {
      const msg = errorMessage(x);
      toast(msg.includes('name field') ? "We don't have that number yet. Add your full name." : msg, 'err');
      setBusy(false);
    }
  };

  return (
    <form className="card stack" onSubmit={submit} autoComplete="off" noValidate>
      <div className="row" style={{ gap: 16 }}>
        <PlateChip plate={v.plate} size="lg" />
        <div>
          <h2>{vehicleName(v)}</h2>
          <p className="muted">{s.owners.length ? `On file with ${ownerNames}.` : s.othersOwn ? 'This vehicle is on file with another customer.' : 'No current owner on file.'}</p>
        </div>
      </div>
      {known ? (
        <p className="lede">Thanks, {known.firstName}. How are you connected to this vehicle?</p>
      ) : (
        <>
          <div>
            <h1 style={{ fontSize: 30 }}>Tell us who you are</h1>
            <p className="lede">If you've visited before with another vehicle, use the same phone number.</p>
          </div>
          <div className="grid2">
            <div className="field">
              <label className="lbl" htmlFor="lk-phone">
                Phone number
              </label>
              <input id="lk-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="416 555 0100" autoFocus />
            </div>
            <div className="field">
              <label className="lbl" htmlFor="lk-name">
                Full name
              </label>
              <input id="lk-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Only needed if you're new" />
            </div>
          </div>
        </>
      )}
      {s.othersOwn && (
        <div className="radio-list" role="radiogroup" aria-label="Your connection to this vehicle">
          <label className="radio">
            <input type="radio" name="lkmode" value="transfer" checked={mode === 'transfer'} onChange={() => setMode('transfer')} />
            <span>
              <b>I bought this vehicle</b>
              <span className="muted">The previous owner no longer has it. The service desk will confirm the change.</span>
            </span>
          </label>
          <label className="radio">
            <input type="radio" name="lkmode" value="co_owner" checked={mode === 'co_owner'} onChange={() => setMode('co_owner')} />
            <span>
              <b>I share it with the owner</b>
              <span className="muted">For example a spouse, family member or business partner.</span>
            </span>
          </label>
        </div>
      )}
      <ErrorList errors={errors} />
      <div className="row">
        <button className="btn primary big" disabled={busy}>
          Continue
        </button>
        <button type="button" className="btn big" onClick={() => dispatch({ type: 'reset' })}>
          Start over
        </button>
      </div>
    </form>
  );
}
