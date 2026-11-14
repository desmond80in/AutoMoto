import type { QueryClient } from '@tanstack/react-query';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

export type ConnState = 'live' | 'reconnecting' | 'offline';

/** Watches a channel's status; reports "reconnecting" only after 5 s without SUBSCRIBED. */
function watch(channel: RealtimeChannel, onState: (s: ConnState) => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const set = (status: string) => {
    if (status === 'SUBSCRIBED') {
      clearTimeout(timer);
      timer = undefined;
      onState(navigator.onLine ? 'live' : 'offline');
    } else if (!timer) {
      timer = setTimeout(() => onState(navigator.onLine ? 'reconnecting' : 'offline'), 5000);
    }
  };
  channel.subscribe((status) => set(status));
  return () => clearTimeout(timer);
}

/** Staff roles: postgres_changes on jobs, events and owners -> invalidate queries. */
export function subscribeStaff(db: SupabaseClient, qc: QueryClient, shopId: string, onState: (s: ConnState) => void): () => void {
  const filter = `shop_id=eq.${shopId}`;
  const invalidate = (row: Record<string, unknown> | undefined) => {
    qc.invalidateQueries({ queryKey: ['jobs'] });
    qc.invalidateQueries({ queryKey: ['search'] });
    qc.invalidateQueries({ queryKey: ['customers'] });
    qc.invalidateQueries({ queryKey: ['vehicles'] });
    const jobId = (row?.work_order_id ?? row?.id) as string | undefined;
    if (jobId) qc.invalidateQueries({ queryKey: ['job', jobId] });
    if (row?.vehicle_id) qc.invalidateQueries({ queryKey: ['vehicle', row.vehicle_id] });
    if (row?.customer_id) qc.invalidateQueries({ queryKey: ['customer', row.customer_id] });
  };
  const ch = db.channel(`staff:${shopId}`);
  for (const table of ['work_orders', 'work_order_events', 'vehicle_owners']) {
    ch.on('postgres_changes', { event: '*', schema: 'public', table, filter }, (p) =>
      invalidate((p.new && Object.keys(p.new).length ? p.new : p.old) as Record<string, unknown>),
    );
  }
  const stop = watch(ch, onState);
  return () => {
    stop();
    void db.removeChannel(ch);
  };
}

/** Display role: private broadcast topic shop:<id>, event board_changed. */
export function subscribeBoard(db: SupabaseClient, shopId: string, onChange: () => void, onState: (s: ConnState) => void): () => void {
  const ch = db.channel(`shop:${shopId}`, { config: { private: true } });
  ch.on('broadcast', { event: 'board_changed' }, () => onChange());
  const stop = watch(ch, onState);
  return () => {
    stop();
    void db.removeChannel(ch);
  };
}
