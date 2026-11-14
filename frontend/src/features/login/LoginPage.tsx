import { useState } from 'react';
import { DevAuth } from '../../auth/DevAuth';
import { useApp } from '../../session/AppContext';
import { useSession } from '../../session/SessionProvider';
import { loginMessage } from '../../session/store';

export function LoginPage() {
  const { auth } = useApp();
  const { boot } = useSession();
  const [message] = useState(() => loginMessage.take());
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dev = auth instanceof DevAuth ? auth : null;

  const google = async () => {
    setBusy(true);
    setErr(null);
    try {
      await auth.signIn();
    } catch {
      setErr("Sign-in didn't start. Check the network and try again.");
      setBusy(false);
    }
  };
  const devSignIn = async (email: string) => {
    setBusy(true);
    setErr(null);
    try {
      await dev!.signInAs(email);
      await boot();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <main className="auth-wrap" id="main" style={{ padding: '0 16px' }}>
      <div className="card stack">
        <div>
          <span className="eyebrow">Start of day</span>
          <h1>Staff sign-in</h1>
          <p className="lede">Sign in at the start of the day. You stay signed in on this device until midnight.</p>
        </div>
        {message && (
          <p className="banner" role="status">
            {message}
          </p>
        )}
        {dev ? (
          <div className="stack-sm">
            <span className="lbl">Development sign-in</span>
            <div className="role-list">
              {dev.emails.map((email) => (
                <button key={email} type="button" className="role-row" disabled={busy} onClick={() => devSignIn(email)}>
                  <b>{email}</b>
                  <span className="small muted">Local test account</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <button type="button" className="btn primary big" onClick={google} disabled={busy}>
              Sign in with Google
            </button>
          </div>
        )}
        {err && (
          <p className="err" role="alert">
            {err}
          </p>
        )}
      </div>
    </main>
  );
}
