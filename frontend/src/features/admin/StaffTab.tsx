import { useQuery } from '@tanstack/react-query';
import { useReady } from '../../session/SessionProvider';
import { ROLE_INFO, ROLE_ORDER } from '../../session/roles';
import { useApp } from '../../session/AppContext';
import { useDrawerNav } from '../shared/useDrawerNav';

export function StaffTab() {
  const { api } = useApp();
  const { me } = useReady();
  const nav = useDrawerNav();
  const { data } = useQuery({ queryKey: ['staff'], queryFn: api.listStaff });
  const staff = [...(data ?? [])].sort((a, b) => Number(b.is_owner) - Number(a.is_owner) || a.name.localeCompare(b.name));
  return (
    <div className="stack">
      <div className="spread">
        <div>
          <h2>Staff &amp; roles</h2>
          <p className="muted">Give each person the roles they need. By default, changing role means signing out and in again.</p>
        </div>
        <button type="button" className="btn primary" onClick={() => nav.open('staff', 'new')}>
          + Add staff member
        </button>
      </div>
      <div className="tbl-wrap" tabIndex={0} role="region" aria-label="Staff">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Gmail</th>
              <th>Roles</th>
              <th>Switch without signing out</th>
              <th>Status</th>
              <th>
                <span className="sr">Edit</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr
                key={s.id}
                className="click"
                tabIndex={0}
                onClick={() => nav.open('staff', s.id)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && nav.open('staff', s.id)}
              >
                <td>
                  <b>{s.name}</b>
                  {s.is_owner && <> <span className="tag">Owner</span></>}
                  {s.id === me.staff.id && <> <span className="tag">You</span></>}
                </td>
                <td className="small">{s.email}</td>
                <td>
                  <span className="row" style={{ gap: 4 }}>
                    {ROLE_ORDER.filter((r) => s.roles.includes(r)).map((r) => (
                      <span key={r} className="tag">
                        {ROLE_INFO[r].label}
                      </span>
                    ))}
                  </span>
                </td>
                <td>
                  <span className="row" style={{ gap: 4 }}>
                    {s.quick_switch.length > 1 ? (
                      ROLE_ORDER.filter((r) => s.quick_switch.includes(r)).map((r) => (
                        <span key={r} className="tag t-accent">
                          {ROLE_INFO[r].label}
                        </span>
                      ))
                    ) : (
                      <span className="muted small">Sign out to switch</span>
                    )}
                  </span>
                </td>
                <td>{s.active === false ? <span className="pill t-muted">Inactive</span> : <span className="pill t-ok">Active</span>}</td>
                <td className="r">
                  <span className="muted">Edit ›</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel small muted">
        Tip: keep Kiosk and Display panel out of "switch without signing out". Then a customer at the kiosk or the waiting-room screen can't open staff
        screens, even if the device is left signed in.
      </div>
    </div>
  );
}
