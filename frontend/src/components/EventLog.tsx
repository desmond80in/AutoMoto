import { fmtDateTime } from '../lib/format';

export function EventLog({ events }: { events: { at: string; message: string }[] }) {
  if (!events.length) return <p className="muted">No history yet.</p>;
  return (
    <ul className="log">
      {events.map((e, i) => (
        <li key={`${e.at}-${i}`}>
          <time dateTime={e.at}>{fmtDateTime(e.at)}</time>
          {e.message}
        </li>
      ))}
    </ul>
  );
}
