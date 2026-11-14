import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { errorMessage } from '../../api/errors';
import type { JobStatus, JobSummary } from '../../api/types';
import { PlateChip } from '../../components/PlateChip';
import { decodeImageFile, QrScanner } from '../../components/QrScanner';
import { StatusPill, STATUS_INFO, UrgencyPill } from '../../components/StatusPill';
import { useToast } from '../../components/Toast';
import { ago, maskName, vehicleName } from '../../lib/format';
import { useApp } from '../../session/AppContext';
import { useReady } from '../../session/SessionProvider';
import { DrawerHost } from '../shared/DrawerHost';
import { useAction } from '../shared/useAction';
import { useDrawerNav } from '../shared/useDrawerNav';

const QR_ICON = (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <path
      fill="currentColor"
      d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm13-2h3v3h-3v-3zm-5 0h3v3h-3v-3zm3 3h3v3h-3v-3zm-3 3h3v2h-3v-2zm5 0h3v2h-3v-2z"
    />
  </svg>
);

function TechCard({ w, children }: { w: JobSummary; children: React.ReactNode }) {
  return (
    <div className={`tech-card tone-${STATUS_INFO[w.status].tone}`}>
      <div className="spread">
        <span className="mono">#{w.order_no}</span>
        <StatusPill status={w.status} />
      </div>
      <div className="row" style={{ gap: 10 }}>
        <PlateChip plate={w.plate} />
        <b>{vehicleName(w)}</b>
        {w.urgency === 'unsafe' && <UrgencyPill urgency="unsafe" />}
      </div>
      <ul className="concern-list">
        {w.concerns.slice(0, 3).map((c, i) => (
          <li key={i}>{c}</li>
        ))}
      </ul>
      <div className="spread small muted">
        <span>
          {maskName(w.customer_name)}
          {w.tech_name ? ` · Tech: ${w.tech_name}` : ''}
        </span>
        <span>{w.accepted_at ? `Queued ${ago(w.accepted_at)}` : `Checked in ${ago(w.created_at)}`}</span>
      </div>
      <div className="row">{children}</div>
    </div>
  );
}

export function WorkshopPage() {
  const { api } = useApp();
  const { me } = useReady();
  const qc = useQueryClient();
  const nav = useDrawerNav();
  const toast = useToast();
  const { busy, run } = useAction();
  const [scanning, setScanning] = useState(false);
  const [jobNo, setJobNo] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const mine = useQuery({ queryKey: ['jobs', 'mine'], queryFn: () => api.listJobs('mine') });
  const queue = useQuery({ queryKey: ['jobs', 'queue'], queryFn: () => api.listJobs('queue') });
  const active = useQuery({ queryKey: ['jobs', 'active'], queryFn: () => api.listJobs('active') });

  const openCode = useCallback(
    async (code: string) => {
      setScanning(false);
      try {
        const { id } = await api.findJobByCode(code.trim());
        nav.open('job', id);
      } catch (e) {
        toast(errorMessage(e, { query: code.trim() }), 'err');
      }
    },
    [api, nav, toast],
  );

  const onPhoto = async (f: File | undefined) => {
    if (!f) return;
    const code = await decodeImageFile(f).catch(() => null);
    if (file.current) file.current.value = '';
    if (!code) return toast("Couldn't find a QR code in that photo. Move closer and try again, or type the job number.", 'err');
    void openCode(code);
  };

  const move = async (w: JobSummary, to: JobStatus, msg: string, openAfter = false) => {
    const j = await run(w.id, () => api.jobTransition(w.id, to, w.version), msg).catch(() => {
      void qc.invalidateQueries({ queryKey: ['jobs'] });
      return undefined;
    });
    if (j) {
      qc.setQueryData(['job', j.id], j);
      void qc.invalidateQueries({ queryKey: ['jobs'] });
      if (openAfter) nav.open('job', j.id);
    }
  };

  const others = (active.data ?? []).filter((w) => (w.status === 'in_progress' || w.status === 'waiting_parts') && w.tech_name !== me.staff.name);
  const waitingKeys = (active.data ?? []).filter((w) => w.status === 'checked_in').length;
  const myJobs = mine.data ?? [];
  const ready = queue.data ?? [];

  return (
    <section className="ws ws-phone">
      <div className="scan">
        <div>
          <h2>Start a job</h2>
          <p className="muted">Scan the QR code on the key tag.</p>
        </div>
        <div className="row">
          <button type="button" className="btn primary big" onClick={() => setScanning(true)}>
            {QR_ICON} Scan job QR
          </button>
          <button type="button" className="btn" onClick={() => file.current?.click()}>
            Take a photo instead
          </button>
          <input
            ref={file}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr"
            aria-label="Photo of the job QR code"
            data-testid="qr-file"
            tabIndex={-1}
            onChange={(e) => void onPhoto(e.target.files?.[0])}
          />
          <form
            className="row"
            autoComplete="off"
            onSubmit={(e) => {
              e.preventDefault();
              if (jobNo.trim()) void openCode(jobNo.trim().replace(/^#/, ''));
            }}
          >
            <label className="sr" htmlFor="job-no">
              Job number
            </label>
            <input id="job-no" value={jobNo} onChange={(e) => setJobNo(e.target.value)} placeholder="or type job number" className="mono" inputMode="numeric" style={{ width: 220 }} />
            <button className="btn">Open</button>
          </form>
        </div>
        {scanning && (
          <div style={{ width: '100%' }}>
            <QrScanner onCode={openCode} onClose={() => setScanning(false)} />
          </div>
        )}
      </div>

      <div className="sec">
        <h3>My jobs ({myJobs.length})</h3>
        {myJobs.length ? (
          <div className="tech-grid">
            {myJobs.map((w) => (
              <TechCard key={w.id} w={w}>
                <button type="button" className="btn primary" onClick={() => nav.open('job', w.id)}>
                  Open job
                </button>
                {w.status === 'in_progress' ? (
                  <button type="button" className="btn" disabled={busy === w.id} onClick={() => move(w, 'ready', `Job #${w.order_no} is ready for pickup.`)}>
                    Work complete
                  </button>
                ) : (
                  <button type="button" className="btn" disabled={busy === w.id} onClick={() => move(w, 'in_progress', `Job #${w.order_no} resumed.`)}>
                    Resume
                  </button>
                )}
              </TechCard>
            ))}
          </div>
        ) : (
          <p className="muted">You have no jobs in progress. Scan a key tag or take one from the queue.</p>
        )}
      </div>

      <div className="sec">
        <h3>Ready to start ({ready.length})</h3>
        {ready.length ? (
          <div className="tech-grid">
            {ready.map((w) => (
              <TechCard key={w.id} w={w}>
                <button type="button" className="btn primary" disabled={busy === w.id} onClick={() => move(w, 'in_progress', `You took job #${w.order_no}.`, true)}>
                  Take job
                </button>
                <button type="button" className="btn" onClick={() => nav.open('job', w.id)}>
                  Details
                </button>
              </TechCard>
            ))}
          </div>
        ) : (
          <p className="muted">
            The queue is empty.
            {waitingKeys ? ` ${waitingKeys} customer${waitingKeys === 1 ? ' is' : 's are'} waiting at the front desk.` : ''}
          </p>
        )}
      </div>

      {others.length > 0 && (
        <div className="sec">
          <h3>Other jobs in the workshop ({others.length})</h3>
          <div className="tech-grid">
            {others.map((w) => (
              <TechCard key={w.id} w={w}>
                <button type="button" className="btn sm" onClick={() => nav.open('job', w.id)}>
                  View
                </button>
              </TechCard>
            ))}
          </div>
        </div>
      )}
      <DrawerHost />
    </section>
  );
}
