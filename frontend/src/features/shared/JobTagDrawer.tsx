import { useQuery } from '@tanstack/react-query';
import { Drawer } from '../../components/Drawer';
import { PlateChip } from '../../components/PlateChip';
import { QrCode } from '../../components/QrCode';
import { fmtDateTime, maskName, vehicleName } from '../../lib/format';
import { useApp } from '../../session/AppContext';
import { useDrawerNav } from './useDrawerNav';

/** Printable key tag with the job QR (payload WO:<uuid>). */
export function JobTagDrawer({ id }: { id: string }) {
  const { api } = useApp();
  const nav = useDrawerNav();
  const { data: job } = useQuery({ queryKey: ['job', id], queryFn: () => api.getWorkOrder(id) });
  if (!job) return null;
  return (
    <Drawer
      crumb={`Job tag · #${job.order_no}`}
      onClose={nav.close}
      onBack={nav.back}
      labelledBy="tag-title"
      footer={
        <>
          <button type="button" className="btn" onClick={() => window.print()}>
            Print tag
          </button>
          <button type="button" className="btn primary" onClick={nav.close}>
            Done
          </button>
        </>
      }
    >
      <div className="tagwrap">
        <div className="keytag print-tag" data-testid="job-tag">
          <QrCode value={`WO:${job.id}`} label={`QR code for job ${job.order_no}`} />
          <div className="kt-info">
            <span className="eyebrow">Job</span>
            <div className="kt-no mono">#{job.order_no}</div>
            <PlateChip plate={job.vehicle.plate} />
            <b>{vehicleName(job.vehicle)}</b>
            <span>{maskName(job.customer.name)}</span>
            <span className="small" style={{ color: '#5b6573' }}>
              Keys received {fmtDateTime(job.accepted_at)}
            </span>
          </div>
        </div>
        <h2 id="tag-title">Attach the tag to the keys</h2>
        <p className="muted">
          Attach the tag to the keys. The technician scans it to open and take up the job. If you can't print, write the job number{' '}
          <b className="mono">#{job.order_no}</b> on the key tag.
        </p>
      </div>
    </Drawer>
  );
}
