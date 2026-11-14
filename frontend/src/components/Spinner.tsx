export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="center-page" role="status">
      <div className="stack-sm" style={{ justifyItems: 'center' }}>
        <div className="spinner" aria-hidden="true" />
        <span className="muted">{label}</span>
      </div>
    </div>
  );
}
