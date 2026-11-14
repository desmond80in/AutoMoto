import { useQuery } from '@tanstack/react-query';
import { Navigate, useParams } from 'react-router-dom';
import { Tabs } from '../../components/Tabs';
import { useApp } from '../../session/AppContext';
import { DrawerHost } from '../shared/DrawerHost';
import { Arrivals } from './Arrivals';
import { FindTab } from './FindTab';
import { JobsBoard } from './JobsBoard';
import { CustomersTab, VehiclesTab } from './RecordTables';

const TABS = ['arrivals', 'jobs', 'find', 'customers', 'vehicles'];

export function DeskPage() {
  const { tab } = useParams();
  const { api } = useApp();
  const arrivals = useQuery({ queryKey: ['jobs', 'arrivals'], queryFn: () => api.listJobs('arrivals') });
  const active = useQuery({ queryKey: ['jobs', 'active'], queryFn: () => api.listJobs('active') });
  if (!tab || !TABS.includes(tab)) return <Navigate to="/desk/arrivals" replace />;
  const waiting = arrivals.data?.length ?? null;
  return (
    <section className="ws">
      <Tabs
        base="/desk"
        active={tab}
        tabs={[
          { id: 'arrivals', label: 'Arrivals', count: waiting, hot: true },
          { id: 'jobs', label: 'Jobs', count: active.data?.length ?? null },
          { id: 'find', label: 'Find' },
          { id: 'customers', label: 'Customers' },
          { id: 'vehicles', label: 'Vehicles' },
        ]}
      />
      {tab === 'arrivals' && <Arrivals />}
      {tab === 'jobs' && <JobsBoard />}
      {tab === 'find' && <FindTab />}
      {tab === 'customers' && <CustomersTab />}
      {tab === 'vehicles' && <VehiclesTab />}
      <DrawerHost />
    </section>
  );
}
