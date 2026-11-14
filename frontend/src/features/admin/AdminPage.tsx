import { useQuery } from '@tanstack/react-query';
import { Navigate, useParams } from 'react-router-dom';
import { Tabs } from '../../components/Tabs';
import { useApp } from '../../session/AppContext';
import { FindTab } from '../desk/FindTab';
import { JobsBoard } from '../desk/JobsBoard';
import { CustomersTab, VehiclesTab } from '../desk/RecordTables';
import { DrawerHost } from '../shared/DrawerHost';
import { useDrawerNav } from '../shared/useDrawerNav';
import { ShopSettings } from './ShopSettings';
import { StaffDrawer } from './StaffDrawer';
import { StaffTab } from './StaffTab';

const TABS = ['staff', 'jobs', 'find', 'customers', 'vehicles', 'settings'];

export function AdminPage() {
  const { tab } = useParams();
  const { api } = useApp();
  const nav = useDrawerNav();
  const staff = useQuery({ queryKey: ['staff'], queryFn: api.listStaff });
  const active = useQuery({ queryKey: ['jobs', 'active'], queryFn: () => api.listJobs('active') });
  if (!tab || !TABS.includes(tab)) return <Navigate to="/admin/staff" replace />;
  return (
    <section className="ws">
      <Tabs
        base="/admin"
        active={tab}
        tabs={[
          { id: 'staff', label: 'Staff & roles', count: staff.data?.length ?? null },
          { id: 'jobs', label: 'Jobs', count: active.data?.length ?? null },
          { id: 'find', label: 'Find' },
          { id: 'customers', label: 'Customers' },
          { id: 'vehicles', label: 'Vehicles' },
          { id: 'settings', label: 'Shop settings' },
        ]}
      />
      {tab === 'staff' && <StaffTab />}
      {tab === 'jobs' && <JobsBoard />}
      {tab === 'find' && <FindTab />}
      {tab === 'customers' && <CustomersTab />}
      {tab === 'vehicles' && <VehiclesTab />}
      {tab === 'settings' && <ShopSettings />}
      {nav.current?.kind === 'staff' ? <StaffDrawer key={nav.current.id} id={nav.current.id} /> : <DrawerHost />}
    </section>
  );
}
