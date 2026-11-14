import { useEffect, useRef, useState } from 'react';

/**
 * After `idleMs` without touch/typing, shows a countdown of `graceS` seconds, then calls onTimeout.
 * Paused while `paused` is true (e.g. while the signature pad is being drawn).
 */
export function useInactivity(enabled: boolean, paused: boolean, onTimeout: () => void, idleMs = 90_000, graceS = 10) {
  const [countdown, setCountdown] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const tick = useRef<ReturnType<typeof setInterval>>();
  const cb = useRef(onTimeout);
  cb.current = onTimeout;

  useEffect(() => {
    const clear = () => {
      clearTimeout(timer.current);
      clearInterval(tick.current);
    };
    if (!enabled || paused) {
      clear();
      setCountdown(null);
      return clear;
    }
    const arm = () => {
      clear();
      setCountdown(null);
      timer.current = setTimeout(() => {
        let n = graceS;
        setCountdown(n);
        tick.current = setInterval(() => {
          n -= 1;
          if (n <= 0) {
            clear();
            setCountdown(null);
            cb.current();
          } else setCountdown(n);
        }, 1000);
      }, idleMs);
    };
    arm();
    const events = ['pointerdown', 'keydown', 'input', 'touchstart'] as const;
    events.forEach((e) => document.addEventListener(e, arm, { passive: true }));
    return () => {
      clear();
      events.forEach((e) => document.removeEventListener(e, arm));
    };
  }, [enabled, paused, idleMs, graceS]);

  return { countdown, stillHere: () => document.dispatchEvent(new Event('keydown')) };
}
