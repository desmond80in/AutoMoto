import { useCallback } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

export const DRAWER_KINDS = ['job', 'vehicle', 'customer', 'tag', 'staff'] as const;
export type DrawerKind = (typeof DRAWER_KINDS)[number];

/** Drawers live in the URL (?job=<id> etc.); each opened drawer is a history entry so Back works. */
export function useDrawerNav() {
  const [params] = useSearchParams();
  const loc = useLocation();
  const navigate = useNavigate();
  const depth = (loc.state as { drawerDepth?: number } | null)?.drawerDepth ?? 0;
  const kind = DRAWER_KINDS.find((k) => params.has(k)) ?? null;
  const current = kind ? { kind, id: params.get(kind)! } : null;

  const open = useCallback(
    (k: DrawerKind, id: string, opts: { replace?: boolean } = {}) => {
      const p = new URLSearchParams();
      p.set(k, id);
      navigate({ pathname: loc.pathname, search: p.toString() }, { state: { drawerDepth: opts.replace ? Math.max(depth, 1) : depth + 1 }, replace: opts.replace });
    },
    [navigate, loc.pathname, depth],
  );

  const close = useCallback(() => {
    if (depth > 0) navigate(-depth);
    else navigate({ pathname: loc.pathname, search: '' }, { replace: true });
  }, [navigate, depth, loc.pathname]);

  const back = useCallback(() => navigate(-1), [navigate]);

  return { current, open, close, back: depth > 1 ? back : undefined };
}
