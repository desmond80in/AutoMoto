import { useEffect, useState } from 'react';
import { fmtTime } from '../lib/format';

export function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  return (
    <time className="clock" dateTime={now.toISOString()}>
      {fmtTime(now)}
    </time>
  );
}
