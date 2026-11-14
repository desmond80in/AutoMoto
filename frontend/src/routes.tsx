import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ConnState } from './api/realtime';
import { subscribeStaff } from './api/realtime';
import type { AppRole } from './api/types';
import { Spinner } from './components/Spinner';
import { TopBar } from './components/TopBar';
import { AdminPage } from './features/admin/AdminPage';
import { DeskPage } from './features/desk/DeskPage';
import { DisplayPage } from './features/display/DisplayPage';
import { KioskPage } from './features/kiosk/KioskPage';
import { CallbackPage } from './features/login/CallbackPage';
import { LoginPage } from './features/login/LoginPage';
import { NotStaffPage } from './features/login/NotStaffPage';
import { RolePage } from './features/role/RolePage';
import { WorkshopPage } from './features/workshop/WorkshopPage';
import { useApp } from './session/AppContext';
import { useSession } from './session/SessionProvider';
import { homeFor } from './session/roles';

const STAFF_ROLES: AppRole[] = ['frontdesk', 'workshop', 'admin'];

/** Redirects to the session's home when the route's role isn't the active one. */
function RoleGuard({ need, children }: { need: AppRole; children: ReactNode }) {
  const { state } = useSession();
  if (state.status !== 'ready') return null;
  if (state.session.role !== need) return <Navigate to={homeFor(state.session.role)} replace />;
  return <>{children}</>;
}

function useStaffRealtime(): ConnState | null {
  const { api, qc } = useApp();
  const { state } = useSession();
  const [conn, setConn] = useState<ConnState | null>(null);
  const shopId = state.status === 'ready' && STAFF_ROLES.includes(state.session.role) ? state.me.shop.id : null;
  useEffect(() => {
    if (!shopId) {
      setConn(null);
      return;
    }
    setConn('live');
    const stop = subscribeStaff(api.db, qc, shopId, setConn);
    const offline = () => setConn('offline');
    const online = () => setConn('reconnecting');
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    return () => {
      stop();
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
    };
  }, [api, qc, shopId]);
  return conn;
}

export function AppRoutes() {
  const { state, boot } = useSession();
  const loc = useLocation();
  const conn = useStaffRealtime();
  const path = loc.pathname;

  useEffect(() => {
    document.body.dataset.role = state.status === 'ready' ? state.session.role : 'none';
  }, [state]);

  if (path === '/auth/callback') return <CallbackPage />;
  if (state.status === 'loading') return <Spinner />;
  if (state.status === 'error')
    return (
      <main className="center-page">
        <div className="card err-page stack-sm">
          <h1>Something went wrong.</h1>
          <p className="lede">{state.message}</p>
          <div>
            <button type="button" className="btn primary" onClick={() => void boot()}>
              Try again
            </button>
          </div>
        </div>
      </main>
    );
  if (state.status === 'notStaff') return <NotStaffPage />;
  if (state.status === 'signedOut') return path === '/login' ? <LoginPage /> : <Navigate to="/login" replace />;
  if (state.status === 'pickRole' || state.status === 'pinSetup') {
    if (path !== '/role') return <Navigate to="/role" replace />;
    return (
      <>
        <TopBar conn={null} />
        <main id="main">
          <RolePage />
        </main>
      </>
    );
  }

  const home = homeFor(state.session.role);
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <TopBar conn={conn} />
      <main id="main">
        <Routes>
          <Route path="/kiosk" element={<RoleGuard need="kiosk"><KioskPage /></RoleGuard>} />
          <Route path="/desk/:tab?" element={<RoleGuard need="frontdesk"><DeskPage /></RoleGuard>} />
          <Route path="/workshop" element={<RoleGuard need="workshop"><WorkshopPage /></RoleGuard>} />
          <Route path="/display" element={<RoleGuard need="display"><DisplayPage /></RoleGuard>} />
          <Route path="/admin/:tab?" element={<RoleGuard need="admin"><AdminPage /></RoleGuard>} />
          <Route path="*" element={<Navigate to={home} replace />} />
        </Routes>
      </main>
    </>
  );
}
