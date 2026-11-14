import { useCallback, useRef, useState } from 'react';
import { errorMessage } from '../../api/errors';
import { REASONS, type Intake, type Reason } from '../../api/types';
import { Chip } from '../../components/Chip';
import { PlateChip } from '../../components/PlateChip';
import { SignaturePad, type SignaturePadHandle } from '../../components/SignaturePad';
import { UrgencyPill } from '../../components/StatusPill';
import { useToast } from '../../components/Toast';
import { VoiceBox } from '../../components/VoiceBox';
import { vehicleName } from '../../lib/format';
import { parseNumber } from '../../lib/normalize';
import { useApp } from '../../session/AppContext';
import { useReady } from '../../session/SessionProvider';
import type { Dispatch } from './KioskPage';
import type { KioskState } from './reducer';

export const REASON_LABELS: Record<Reason, string> = {
  mechanical: 'Mechanical',
  body: 'Body work',
  accident: 'Accident / tow',
};

export function VisitStep({
  s,
  dispatch,
  setDrawing,
}: {
  s: KioskState;
  dispatch: Dispatch;
  setDrawing: (d: boolean) => void;
}) {
  const { api, intake, cfg } = useApp();
  const { me } = useReady();
  const toast = useToast();
  const v = s.vehicle!;
  const c = s.customer!;
  const [reasons, setReasons] = useState<Reason[]>(['mechanical']);
  const [odometer, setOdometer] = useState('');
  const [concerns, setConcerns] = useState<string[]>(['']);
  const [signedName, setSignedName] = useState('');
  const [agree, setAgree] = useState(false);
  const [hasSig, setHasSig] = useState(false);
  const [story, setStory] = useState('');
  const [understood, setUnderstood] = useState<Intake | null>(null);
  const [ai, setAi] = useState<{ busy: boolean; msg: string | null }>({ busy: false, msg: null });
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const pad = useRef<SignaturePadHandle>(null);
  const onSigChange = useCallback((has: boolean) => setHasSig(has), []);

  const fill = async () => {
    if (story.trim().length < 8)
      return setAi({ busy: false, msg: 'Describe the problem first, by typing or talking.' });
    setAi({ busy: true, msg: null });
    try {
      const r = await intake.visit(story.trim(), vehicleName(v), v.last_odometer_km);
      setConcerns(r.concerns.length ? r.concerns : ['']);
      if (r.reasons.length) setReasons(r.reasons);
      if (r.odometer_km && !odometer.trim()) setOdometer(String(Math.round(r.odometer_km)));
      setUnderstood({
        transcript: story.trim(),
        summary: r.summary,
        when_it_happens: r.when_it_happens,
        warning_lights: r.warning_lights,
        urgency: r.urgency,
        safety_note: r.safety_note,
        questions: r.questions,
      });
      setAi({ busy: false, msg: null });
    } catch (e) {
      setAi({ busy: false, msg: errorMessage(e) });
    }
  };

  const toggleReason = (r: Reason) =>
    setReasons((p) => (p.includes(r) ? (p.length > 1 ? p.filter((x) => x !== r) : p) : [...p, r]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const list = concerns.map((x) => x.trim()).filter(Boolean);
    const odo = parseNumber(odometer);
    const errs: string[] = [];
    if (!list.length) errs.push("Tell us what's going on with the vehicle.");
    if (odometer.trim() && (odo == null || odo < 0)) errs.push('Enter the odometer in kilometres, or leave it blank.');
    if (!signedName.trim()) errs.push('Print your name.');
    if (!hasSig) errs.push('Sign in the box.');
    if (!agree) errs.push('Tick the box to agree to the authorization.');
    setErrors(errs);
    if (errs.length) return;
    setBusy(true);
    try {
      const png = await pad.current!.toBlob();
      const path = await api.uploadSignature(me.shop.id, png);
      const result = await api.kioskCheckIn({
        customer_id: c.id,
        vehicle_id: v.id,
        reasons,
        odometer_km: odo == null ? null : Math.round(odo),
        concerns: list,
        intake: understood ? { ...understood, transcript: story.trim() } : undefined,
        signed_name: signedName.trim(),
        signature_path: path,
      });
      dispatch({ type: 'done', result });
    } catch (x) {
      toast(errorMessage(x), 'err');
      setBusy(false);
    }
  };

  return (
    <form className="card stack" onSubmit={submit} autoComplete="off" noValidate>
      <div className="summary">
        <PlateChip plate={v.plate} size="lg" />
        <div className="who">
          <b>{vehicleName(v)}</b>
          <span className="muted">
            {c.firstName} · Phone ending {c.phoneLast4}
          </span>
        </div>
        <button
          type="button"
          className="btn sm ghost"
          style={{ marginLeft: 'auto' }}
          onClick={() => dispatch({ type: 'changeVehicle' })}
        >
          Change
        </button>
      </div>

      <VoiceBox
        mode="visit"
        text={story}
        onText={setStory}
        onFill={fill}
        busy={ai.busy}
        message={ai.msg}
        result={
          understood ? (
            <div className="understood">
              <div className="spread">
                <b>Here's what we understood</b>
                <UrgencyPill urgency={understood.urgency} />
              </div>
              <p>{understood.summary}</p>
              {understood.safety_note && <p className="safety">{understood.safety_note}</p>}
              <p className="hint">We filled in the form below. Check it and fix anything we got wrong.</p>
            </div>
          ) : null
        }
      />

      <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="lbl" style={{ marginBottom: 10 }}>
          Reason for visit
        </legend>
        <div className="chips">
          {REASONS.map((r) => (
            <Chip key={r} on={reasons.includes(r)} onClick={() => toggleReason(r)}>
              {REASON_LABELS[r]}
            </Chip>
          ))}
        </div>
      </fieldset>

      <div className="field" style={{ maxWidth: 320 }}>
        <label className="lbl" htmlFor="odo">
          Odometer reading (km)
        </label>
        <input
          id="odo"
          value={odometer}
          onChange={(e) => setOdometer(e.target.value)}
          inputMode="numeric"
          placeholder={
            v.last_odometer_km ? `Last recorded ${v.last_odometer_km.toLocaleString('en-CA')}` : 'e.g. 52 870'
          }
          aria-describedby="odo-hint"
        />
        <span className="hint" id="odo-hint">
          Optional. The technician will confirm it.
        </span>
      </div>

      <div className="stack-sm">
        <span className="lbl" id="cc-lbl">
          What's going on with the vehicle?
        </span>
        {concerns.map((t, i) => (
          <div className="concern" key={i}>
            <span className="n">{i + 1}</span>
            <textarea
              aria-label={`Concern ${i + 1}`}
              rows={2}
              value={t}
              placeholder={i === 0 ? 'e.g. Grinding noise from the front when I brake' : 'Another concern'}
              onChange={(e) => setConcerns((p) => p.map((x, j) => (j === i ? e.target.value : x)))}
            />
            {concerns.length > 1 ? (
              <button
                type="button"
                className="x"
                aria-label={`Remove concern ${i + 1}`}
                onClick={() => setConcerns((p) => p.filter((_, j) => j !== i))}
              >
                ×
              </button>
            ) : (
              <span style={{ width: 36 }} />
            )}
          </div>
        ))}
        {concerns.length < 8 && (
          <div>
            <button type="button" className="btn sm" onClick={() => setConcerns((p) => [...p, ''])}>
              + Add another concern
            </button>
          </div>
        )}
      </div>

      <div className="stack-sm">
        <span className="lbl">Authorization</span>
        <p className="auth">
          By signing, I authorize the shop to inspect and repair this vehicle with the necessary parts and materials,
          and to drive it for testing, inspection or delivery at my risk. I understand a mechanic's lien applies to the
          vehicle for the cost of repairs, that storage charges may apply if it is not collected within 24 hours of
          being told the work is done, and that the shop may keep the vehicle until the bill is paid in full.
          {cfg.stage !== 'prod' && (
            <>
              {' '}
              <em>Demo wording. Use your shop's own legal text.</em>
            </>
          )}
        </p>
        <div className="field" style={{ maxWidth: 420 }}>
          <label className="lbl" htmlFor="sg-name">
            Printed name
          </label>
          <input id="sg-name" value={signedName} onChange={(e) => setSignedName(e.target.value)} autoComplete="name" />
        </div>
        <div className="sigwrap">
          <div className="spread">
            <span className="lbl">Sign below</span>
            <button type="button" className="btn sm ghost" onClick={() => pad.current?.clear()}>
              Clear signature
            </button>
          </div>
          <SignaturePad ref={pad} onDrawingChange={setDrawing} onChange={onSigChange} />
          <span className="hint">{hasSig ? 'Signature captured.' : 'Use your finger, stylus or mouse.'}</span>
        </div>
        <label className="check">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>I've read the authorization above and agree to it.</span>
        </label>
      </div>
      {errors.length > 0 && (
        <div role="alert">
          <ul className="err" style={{ margin: 0, paddingLeft: 20 }}>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="row">
        <button className="btn primary big" disabled={busy}>
          {busy ? 'Checking in…' : 'Check in my vehicle'}
        </button>
        <button type="button" className="btn big ghost" onClick={() => dispatch({ type: 'reset' })}>
          Cancel
        </button>
      </div>
    </form>
  );
}
