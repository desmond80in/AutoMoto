import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spinner } from '../../components/Spinner';
import { useApp } from '../../session/AppContext';
import { useSession } from '../../session/SessionProvider';

export function CallbackPage() {
  const { auth } = useApp();
  const { boot } = useSession();
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);
  const once = useRef(false);

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    auth
      .handleCallback()
      .then(() => boot())
      .then(() => navigate('/', { replace: true }))
      .catch(() => setFailed(true));
  }, [auth, boot, navigate]);

  if (failed)
    return (
      <main className="center-page">
        <div className="card err-page stack-sm">
          <h1>Sign-in didn't finish.</h1>
          <p className="lede">This Google account may not be registered as staff. Ask the shop owner to add you, then try again.</p>
          <div>
            <a className="btn primary" href="/login">
              Back to sign-in
            </a>
          </div>
        </div>
      </main>
    );
  return <Spinner label="Signing you in…" />;
}
