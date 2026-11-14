import type { JobStatus, Urgency } from '../api/types';

export const STATUS_INFO: Record<JobStatus, { staff: string; display: string; tone: string }> = {
  checked_in: { staff: 'Waiting for keys', display: 'Checked in', tone: 'info' },
  accepted: { staff: 'In queue', display: 'In the queue', tone: 'queue' },
  in_progress: { staff: 'In progress', display: 'Being worked on', tone: 'accent' },
  waiting_parts: { staff: 'Waiting on parts', display: 'Waiting on parts', tone: 'warn' },
  ready: { staff: 'Ready for pickup', display: 'Ready for pickup', tone: 'ok' },
  picked_up: { staff: 'Picked up', display: 'Picked up', tone: 'muted' },
  cancelled: { staff: 'Cancelled', display: 'Cancelled', tone: 'muted' },
};

export function StatusPill({ status, audience = 'staff' }: { status: JobStatus; audience?: 'staff' | 'display' }) {
  const s = STATUS_INFO[status];
  return <span className={`pill t-${s.tone}`}>{audience === 'display' ? s.display : s.staff}</span>;
}

const URGENCY: Record<Urgency, { label: string; tone: string }> = {
  unsafe: { label: 'Safety concern', tone: 'crit' },
  soon: { label: 'Needs attention soon', tone: 'warn' },
  routine: { label: 'Routine', tone: 'ok' },
};

export function UrgencyPill({ urgency }: { urgency: Urgency | null | undefined }) {
  if (!urgency) return null;
  const u = URGENCY[urgency];
  return <span className={`pill t-${u.tone}`}>{u.label}</span>;
}
