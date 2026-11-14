import { useSession } from '../../session/SessionProvider';

export function NotStaffPage() {
  const { signOut } = useSession();
  return (
    <main className="center-page">
      <div className="card err-page stack-sm">
        <h1>Not set up as staff</h1>
        <p className="lede">This Google account isn't set up as staff. Ask the shop owner to add you.</p>
        <div>
          <button type="button" className="btn primary" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </div>
    </main>
  );
}
