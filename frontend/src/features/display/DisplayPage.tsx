import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { subscribeBoard } from '../../api/realtime';
import type { BoardRow } from '../../api/types';
import { PlateChip } from '../../components/PlateChip';
import { STATUS_INFO } from '../../components/StatusPill';
import { fmtTime } from '../../lib/format';
import { useApp } from '../../session/AppContext';
import { useReady } from '../../session/SessionProvider';

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function Row({ w }: { w: BoardRow }) {
  const st = STATUS_INFO[w.status];
  return (
    <div className={`d-row tone-${st.tone}${w.status === 'ready' ? ' is-ready' : ''}`} data-testid="board-row">
      <span>
        <PlateChip plate={w.plate} size="lg" />
      </span>
      <span className="d-who">
        <b>{w.masked_name}</b>
        <span>{[w.make, w.model].filter(Boolean).join(' ')}</span>
      </span>
      <span className="d-status">
        <span className={`pill t-${st.tone}`}>{st.display}</span>
      </span>
      <span className="d-time">
        <span className="lbl">Checked in</span>
        {fmtTime(w.created_at)}
      </span>
      <span className="d-time">
        <span className="lbl">Estimated ready</span>
        <span className="soon">Coming soon</span>
      </span>
    </div>
  );
}

export function DisplayPage() {
  const { api } = useApp();
  const { me } = useReady();
  const { data, refetch } = useQuery({ queryKey: ['display'], queryFn: () => api.displayBoard(), refetchInterval: 60_000 });
  const [fullscreen, setFullscreen] = useState(() => !!document.fullscreenElement);
  const list = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const rows = data ?? [];

  useEffect(() => subscribeBoard(api.db, me.shop.id, () => void refetch(), () => undefined), [api, me.shop.id, refetch]);

  // Keep the TV awake while the board is visible.
  useEffect(() => {
    type Sentinel = { release(): Promise<void> };
    let lock: Sentinel | null = null;
    const wl = (navigator as unknown as { wakeLock?: { request(t: 'screen'): Promise<Sentinel> } }).wakeLock;
    const acquire = () => {
      if (document.visibilityState === 'visible' && wl) wl.request('screen').then((l) => (lock = l)).catch(() => undefined);
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      document.removeEventListener('visibilitychange', acquire);
      document.removeEventListener('fullscreenchange', onFs);
      void lock?.release().catch(() => undefined);
    };
  }, []);

  // Slow auto-scroll when rows overflow (pause 5 s at top and bottom); paginate every 10 s with reduced motion.
  useEffect(() => {
    if (reducedMotion()) {
      const t = setInterval(() => setPage((p) => p + 1), 10_000);
      return () => clearInterval(t);
    }
    let raf = 0;
    let pauseUntil = performance.now() + 5000;
    let dir = 1;
    const step = (t: number) => {
      const el = document.scrollingElement!;
      const max = el.scrollHeight - el.clientHeight;
      if (max > 4 && t > pauseUntil) {
        el.scrollTop += dir * 0.6;
        if ((dir > 0 && el.scrollTop >= max - 1) || (dir < 0 && el.scrollTop <= 0)) {
          dir = -dir;
          pauseUntil = t + 5000;
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  const perPage = Math.max(1, Math.floor((window.innerHeight - 320) / 110));
  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  const visible = reducedMotion() ? rows.slice((page % pages) * perPage, (page % pages) * perPage + perPage) : rows;
  const count = (s: BoardRow['status'][]) => rows.filter((w) => s.includes(w.status)).length;

  return (
    <section className="display">
      <div className="d-head">
        <div>
          <h1>Vehicle status</h1>
          <p>Find your licence plate. We'll call you when your vehicle is ready.</p>
        </div>
        <div className="d-counts">
          <span className="pill t-ok">Ready: {count(['ready'])}</span>
          <span className="pill t-accent">Being worked on: {count(['in_progress', 'waiting_parts'])}</span>
          <span className="pill t-queue">In the queue: {count(['accepted', 'checked_in'])}</span>
        </div>
      </div>
      {rows.length ? (
        <div className="d-list" ref={list}>
          {visible.map((w) => (
            <Row key={w.id} w={w} />
          ))}
        </div>
      ) : (
        <div className="d-empty">No vehicles in the shop right now.</div>
      )}
      <p className="d-foot">
        Wait-time estimates are coming soon. We now record when each job is checked in, started and finished, so estimates can be worked out from real data.
      </p>
      {!fullscreen && document.fullscreenEnabled && (
        <button type="button" className="btn board-fs" onClick={() => void document.documentElement.requestFullscreen().catch(() => undefined)}>
          Full screen
        </button>
      )}
    </section>
  );
}
