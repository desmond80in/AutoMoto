import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { AppRole, Staff } from '../../api/types';
import { Chip } from '../../components/Chip';
import { Drawer } from '../../components/Drawer';
import { isValidEmail } from '../../lib/normalize';
import { useApp } from '../../session/AppContext';
import { useReady, useSession } from '../../session/SessionProvider';
import { ROLE_INFO, ROLE_ORDER, roleLabel } from '../../session/roles';
import { useAction } from '../shared/useAction';
import { useDrawerNav } from '../shared/useDrawerNav';
import { PinInput } from '../../components/PinInput';

interface Draft {
  name: string;
  email: string;
  pin: string;
  active: boolean;
  roles: AppRole[];
  quick_switch: AppRole[];
}

const fromStaff = (s?: Staff): Draft => ({
  name: s?.name ?? '',
  email: s?.email ?? '',
  pin: '',
  active: s?.active ?? true,
  roles: s?.roles ?? [],
  quick_switch: s?.quick_switch ?? [],
});

export function StaffDrawer({ id }: { id: string }) {
  const { api } = useApp();
  const qc = useQueryClient();
  const nav = useDrawerNav();
  const { me } = useReady();
  const { refreshMe } = useSession();
  const { busy, run } = useAction();
  const isNew = id === 'new';
  const { data } = useQuery({ queryKey: ['staff'], queryFn: api.listStaff });
  const existing = data?.find((s) => s.id === id);
  const [draft, setDraft] = useState<Draft | null>(isNew ? fromStaff() : null);
  const [err, setErr] = useState<string | null>(null);
  if (!draft && existing) setDraft(fromStaff(existing));
  if (!draft) return null;

  const orig = fromStaff(isNew ? undefined : existing);
  const dirty = JSON.stringify(draft) !== JSON.stringify(orig);
  const toggle = (list: AppRole[], r: AppRole) => (list.includes(r) ? list.filter((x) => x !== r) : [...list, r]);
  const risky = draft.quick_switch.filter((r) => r === 'kiosk' || r === 'display');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim()) return setErr('Enter a name.');
    if (!isValidEmail(draft.email)) return setErr('Enter a Gmail address.');
    if (!draft.roles.length) return setErr('Pick at least one role.');
    if (draft.pin && !/^\d{4,6}$/.test(draft.pin)) return setErr('The PIN must be 4 to 6 digits.');
    if (isNew && !draft.pin) return setErr('New staff need a PIN.');
    setErr(null);
    const s = await run(
      'save',
      () =>
        api.staffUpsert({
          id: isNew ? undefined : id,
          name: draft.name.trim(),
          email: draft.email.trim().toLowerCase(),
          roles: draft.roles,
          quick_switch: draft.quick_switch.filter((r) => draft.roles.includes(r)),
          active: draft.active,
          pin: draft.pin || undefined,
        }),
      isNew ? 'Staff member added.' : 'Staff member saved.',
    ).catch(() => undefined);
    if (s) {
      await qc.invalidateQueries({ queryKey: ['staff'] });
      if (s.id === me.staff.id) void refreshMe();
      nav.close();
    }
  };

  return (
    <Drawer crumb={`Staff · ${draft.name || 'New'}`} onClose={nav.close} onBack={nav.back} dirty={dirty} labelledBy="staff-title">
      <div>
        <span className="eyebrow">{isNew ? 'New staff member' : 'Staff member'}</span>
        <h2 id="staff-title">{draft.name || 'New staff member'}</h2>
      </div>
      <form className="stack" onSubmit={save} autoComplete="off" noValidate>
        <div className="grid2">
          <div className="field">
            <label className="lbl" htmlFor="st-name">
              Name
            </label>
            <input id="st-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <div className="field">
            <label className="lbl" htmlFor="st-email">
              Gmail address
            </label>
            <input id="st-email" type="email" inputMode="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
          </div>
          <div className="field">
            <label className="lbl" htmlFor="st-pin">
              {isNew ? 'PIN (4 to 6 digits)' : 'New PIN (leave blank to keep)'}
            </label>
            <PinInput id="st-pin" value={draft.pin} onChange={(pin) => setDraft({ ...draft, pin })} autoComplete="new-password" />
          </div>
          <div className="field">
            <span className="lbl">Status</span>
            <label className="check">
              <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
              <span>Active. Can sign in</span>
            </label>
          </div>
        </div>
        <p className="hint">New staff sign in with this Gmail address using Sign in with Google.</p>
        <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="lbl" style={{ marginBottom: 8 }}>
            Roles
          </legend>
          <div className="chips">
            {ROLE_ORDER.map((r) => (
              <Chip
                key={r}
                small
                on={draft.roles.includes(r)}
                onClick={() => {
                  const roles = toggle(draft.roles, r);
                  setDraft({ ...draft, roles, quick_switch: draft.quick_switch.filter((q) => roles.includes(q)) });
                }}
              >
                {ROLE_INFO[r].label}
              </Chip>
            ))}
          </div>
        </fieldset>
        <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="lbl" style={{ marginBottom: 8 }}>
            Switch without signing out
          </legend>
          <p className="hint">
            Pick two or more of this person's roles. They can then move between those roles from the Switch role button. Any other change needs a sign-out.
          </p>
          <div className="chips">
            {ROLE_ORDER.map((r) => (
              <Chip key={r} small on={draft.quick_switch.includes(r)} disabled={!draft.roles.includes(r)} onClick={() => setDraft({ ...draft, quick_switch: toggle(draft.quick_switch, r) })}>
                {ROLE_INFO[r].label}
              </Chip>
            ))}
          </div>
          {risky.length > 0 && (
            <p className="warn-note" role="status">
              {risky.map(roleLabel).join(' and ')} {risky.length > 1 ? 'are' : 'is'} included. Anyone at that screen could switch to staff roles after unlocking with a PIN.
            </p>
          )}
        </fieldset>
        {err && (
          <p className="err" role="alert">
            {err}
          </p>
        )}
        <div>
          <button className="btn primary" disabled={busy === 'save'}>
            {isNew ? 'Add staff member' : 'Save changes'}
          </button>
        </div>
      </form>
    </Drawer>
  );
}
