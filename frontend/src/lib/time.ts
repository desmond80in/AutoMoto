const MAX_TIMEOUT = 2_147_483_647;

/** Calls fn at `at` (ISO). Long delays are chained because setTimeout caps at ~24.8 days. Returns a cancel function. */
export function scheduleAt(at: string | number | Date, fn: () => void, now: () => number = Date.now): () => void {
  const target = new Date(at).getTime();
  let handle: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    const delay = target - now();
    if (delay <= 0) {
      fn();
      return;
    }
    handle = setTimeout(arm, Math.min(delay, MAX_TIMEOUT));
  };
  arm();
  return () => {
    if (handle) clearTimeout(handle);
  };
}

/** Local date (YYYY-MM-DD) of an instant in the browser time zone. */
export function localDay(d: Date | string = new Date()): string {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
