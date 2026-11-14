import { CustomerDrawer } from './CustomerDrawer';
import { JobDrawer } from './JobDrawer';
import { JobTagDrawer } from './JobTagDrawer';
import { useDrawerNav } from './useDrawerNav';
import { VehicleDrawer } from './VehicleDrawer';

/** Renders whichever drawer the URL asks for. */
export function DrawerHost() {
  const { current } = useDrawerNav();
  if (!current) return null;
  switch (current.kind) {
    case 'job':
      return <JobDrawer key={current.id} id={current.id} />;
    case 'vehicle':
      return <VehicleDrawer key={current.id} id={current.id} />;
    case 'customer':
      return <CustomerDrawer key={current.id} id={current.id} />;
    case 'tag':
      return <JobTagDrawer key={current.id} id={current.id} />;
    default:
      return null;
  }
}
