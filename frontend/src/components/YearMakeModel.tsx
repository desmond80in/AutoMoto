import { useRef, useState } from 'react';
import { canonMake, canonModel, MAKE_NAMES, MAKES, yearOptions } from '../data/catalog';

export interface VehicleDraft {
  plate: string;
  year: string;
  make: string;
  model: string;
  engine: string;
  vin: string;
}
export const blankVehicle = (): VehicleDraft => ({ plate: '', year: '', make: '', model: '', engine: '', vin: '' });

const OTHER = '__other';

/** Year / Make / Model selects from the catalog, with "Not listed" free text (SPEC-FRONTEND 7.4). */
export function YearMakeModel({ value, onChange, idPrefix }: { value: VehicleDraft; onChange: (v: VehicleDraft) => void; idPrefix: string }) {
  const mk = canonMake(value.make);
  const [makeOther, setMakeOther] = useState(() => !!value.make && !mk);
  const models = !makeOther && mk ? MAKES[mk] : undefined;
  const md = models ? canonModel(mk, value.model) : null;
  const [modelOther, setModelOther] = useState(() => !!value.model && !!models && !md);
  const modelRef = useRef<HTMLSelectElement>(null);
  const makeOtherRef = useRef<HTMLInputElement>(null);
  const modelOtherRef = useRef<HTMLInputElement>(null);
  const years = yearOptions();
  const yearList = !value.year || years.includes(Number(value.year)) ? years : [Number(value.year), ...years];

  const onMake = (v: string) => {
    setModelOther(false);
    if (v === OTHER) {
      setMakeOther(true);
      onChange({ ...value, make: '', model: '' });
      setTimeout(() => makeOtherRef.current?.focus());
    } else {
      setMakeOther(false);
      onChange({ ...value, make: v, model: '' });
      setTimeout(() => modelRef.current?.focus());
    }
  };
  const onModel = (v: string) => {
    if (v === OTHER) {
      setModelOther(true);
      onChange({ ...value, model: '' });
      setTimeout(() => modelOtherRef.current?.focus());
    } else {
      setModelOther(false);
      onChange({ ...value, model: v });
    }
  };

  return (
    <>
      <div className="field">
        <label className="lbl" htmlFor={`${idPrefix}-year`}>
          Year
        </label>
        <select id={`${idPrefix}-year`} value={value.year} onChange={(e) => onChange({ ...value, year: e.target.value })}>
          <option value="">Choose year</option>
          {yearList.map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="lbl" htmlFor={`${idPrefix}-make`}>
          Make
        </label>
        <select id={`${idPrefix}-make`} value={makeOther ? OTHER : (mk ?? '')} onChange={(e) => onMake(e.target.value)}>
          <option value="">Choose make</option>
          {MAKE_NAMES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
          <option value={OTHER}>Not listed</option>
        </select>
        {makeOther && (
          <input
            ref={makeOtherRef}
            id={`${idPrefix}-make-other`}
            aria-label="Make (not listed)"
            placeholder="Type the make"
            value={value.make}
            onChange={(e) => onChange({ ...value, make: e.target.value })}
          />
        )}
      </div>
      <div className="field">
        <label className="lbl" htmlFor={`${idPrefix}-model`}>
          Model
        </label>
        {makeOther ? (
          <input id={`${idPrefix}-model`} placeholder="Type the model" value={value.model} onChange={(e) => onChange({ ...value, model: e.target.value })} />
        ) : !models ? (
          <select id={`${idPrefix}-model`} disabled>
            <option>Choose a make first</option>
          </select>
        ) : (
          <>
            <select ref={modelRef} id={`${idPrefix}-model`} value={modelOther ? OTHER : (md ?? '')} onChange={(e) => onModel(e.target.value)}>
              <option value="">Choose model</option>
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
              <option value={OTHER}>Not listed</option>
            </select>
            {modelOther && (
              <input
                ref={modelOtherRef}
                id={`${idPrefix}-model-other`}
                aria-label="Model (not listed)"
                placeholder="Type the model"
                value={value.model}
                onChange={(e) => onChange({ ...value, model: e.target.value })}
              />
            )}
          </>
        )}
      </div>
    </>
  );
}

/** Plate, year/make/model, engine and VIN, as in the prototype. */
export function VehicleFields({ value, onChange, idPrefix, errors = {} }: { value: VehicleDraft; onChange: (v: VehicleDraft) => void; idPrefix: string; errors?: Partial<Record<keyof VehicleDraft, string>> }) {
  return (
    <div className="grid3">
      <div className="field">
        <label className="lbl" htmlFor={`${idPrefix}-plate`}>
          Licence plate
        </label>
        <input
          id={`${idPrefix}-plate`}
          className="mono"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="ABCD 123"
          value={value.plate}
          onChange={(e) => onChange({ ...value, plate: e.target.value.toUpperCase() })}
          aria-invalid={!!errors.plate}
        />
        {errors.plate && <span className="err small">{errors.plate}</span>}
      </div>
      <YearMakeModel value={value} onChange={onChange} idPrefix={idPrefix} />
      <div className="field">
        <label className="lbl" htmlFor={`${idPrefix}-engine`}>
          Engine size <span style={{ textTransform: 'none' }}>(optional)</span>
        </label>
        <input id={`${idPrefix}-engine`} placeholder="1.5L" value={value.engine} onChange={(e) => onChange({ ...value, engine: e.target.value })} />
      </div>
      <div className="field">
        <label className="lbl" htmlFor={`${idPrefix}-vin`}>
          VIN <span style={{ textTransform: 'none' }}>(optional)</span>
        </label>
        <input
          id={`${idPrefix}-vin`}
          className="mono"
          maxLength={17}
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="17 characters"
          value={value.vin}
          onChange={(e) => onChange({ ...value, vin: e.target.value.toUpperCase() })}
          aria-invalid={!!errors.vin}
        />
        {errors.vin && <span className="err small">{errors.vin}</span>}
      </div>
    </div>
  );
}
