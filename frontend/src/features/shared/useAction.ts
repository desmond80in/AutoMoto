import { useCallback, useState } from 'react';
import { errorMessage, toAppError, type MessageContext } from '../../api/errors';
import { useToast } from '../../components/Toast';

/** Runs a mutation with a busy flag; shows a toast on success or a mapped error message on failure. */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const run = useCallback(
    async <T,>(key: string, fn: () => Promise<T>, success?: string | ((r: T) => string), ctx?: MessageContext): Promise<T | undefined> => {
      setBusy(key);
      try {
        const r = await fn();
        if (success) toast(typeof success === 'function' ? success(r) : success);
        return r;
      } catch (e) {
        const err = toAppError(e);
        if (err.code !== 'SESSION_EXPIRED' && err.code !== 'SESSION_INVALID') toast(errorMessage(err, ctx), 'err');
        throw err;
      } finally {
        setBusy(null);
      }
    },
    [toast],
  );
  return { busy, run };
}
