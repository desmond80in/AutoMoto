import type { KioskCheckIn, KioskLookup, KioskOwner, KioskVehicle } from '../../api/types';

export type Step = 'search' | 'pickCustomer' | 'pickVehicle' | 'whoAreYou' | 'notFound' | 'register' | 'addVehicle' | 'linkOwner' | 'visit' | 'done';

export interface KioskCustomer {
  id: string;
  firstName: string;
  phoneLast4: string;
}
export interface KioskVehicleRef {
  id: string;
  plate: string;
  year: number | null;
  make: string;
  model: string;
  last_odometer_km: number | null;
}

export interface KioskState {
  step: Step;
  /** Bumped on every reset so step forms remount with empty state. */
  run: number;
  query: string;
  customers: { id: string; masked_name: string; phone_last4: string }[];
  customer: KioskCustomer | null;
  vehicles: KioskVehicle[];
  vehicle: KioskVehicleRef | null;
  owners: KioskOwner[];
  othersOwn: boolean;
  done: KioskCheckIn | null;
}

export type KioskAction =
  | { type: 'reset' }
  | { type: 'query'; query: string }
  | { type: 'lookup'; result: KioskLookup }
  | { type: 'customerVehicles'; customer: KioskCustomer; vehicles: KioskVehicle[] }
  | { type: 'chooseVehicle'; vehicle: KioskVehicle }
  | { type: 'chooseOwner'; owner: KioskOwner }
  | { type: 'notListed' }
  | { type: 'startRegister' }
  | { type: 'startAddVehicle' }
  | { type: 'backToVehicles' }
  | { type: 'vehicleSaved'; customer: KioskCustomer; vehicle: KioskVehicleRef; next: 'visit' | 'link_owner' }
  | { type: 'linked'; customer: KioskCustomer }
  | { type: 'changeVehicle' }
  | { type: 'done'; result: KioskCheckIn };

export const initialKiosk = (run = 0): KioskState => ({
  step: 'search',
  run,
  query: '',
  customers: [],
  customer: null,
  vehicles: [],
  vehicle: null,
  owners: [],
  othersOwn: false,
  done: null,
});

const ref = (v: KioskVehicle): KioskVehicleRef => ({
  id: v.id,
  plate: v.plate,
  year: v.year,
  make: v.make,
  model: v.model,
  last_odometer_km: v.last_odometer_km,
});

export const firstWord = (s: string) => s.trim().split(/\s+/)[0] ?? '';

export function kioskReducer(s: KioskState, a: KioskAction): KioskState {
  switch (a.type) {
    case 'reset':
      return initialKiosk(s.run + 1);
    case 'query':
      return { ...s, query: a.query };
    case 'lookup': {
      const r = a.result;
      if (r.match === 'customer')
        return {
          ...s,
          step: 'pickVehicle',
          customer: { id: r.customer.id, firstName: r.customer.first_name, phoneLast4: r.customer.phone_last4 },
          vehicles: r.vehicles,
        };
      if (r.match === 'customers') return { ...s, step: 'pickCustomer', customers: r.customers };
      if (r.match === 'vehicle')
        return { ...s, step: 'whoAreYou', vehicle: ref(r.vehicle), owners: r.owners, othersOwn: r.owners.length > 0 };
      return { ...s, step: 'notFound' };
    }
    case 'customerVehicles':
      return { ...s, step: 'pickVehicle', customer: a.customer, vehicles: a.vehicles };
    case 'chooseVehicle':
      return { ...s, step: 'visit', vehicle: ref(a.vehicle) };
    case 'chooseOwner':
      return {
        ...s,
        step: 'visit',
        customer: { id: a.owner.customer_id, firstName: firstWord(a.owner.masked_name), phoneLast4: a.owner.phone_last4 },
      };
    case 'notListed':
      return { ...s, step: 'linkOwner', customer: null };
    case 'startRegister':
      return { ...s, step: 'register' };
    case 'startAddVehicle':
      return { ...s, step: 'addVehicle' };
    case 'backToVehicles':
      return { ...s, step: s.customer && s.vehicles.length ? 'pickVehicle' : s.customer ? 'pickVehicle' : 'search' };
    case 'vehicleSaved':
      return a.next === 'visit'
        ? { ...s, step: 'visit', customer: a.customer, vehicle: a.vehicle }
        : { ...s, step: 'linkOwner', customer: a.customer, vehicle: a.vehicle, owners: [], othersOwn: true };
    case 'linked':
      return { ...s, step: 'visit', customer: a.customer };
    case 'changeVehicle':
      return s.vehicles.length ? { ...s, step: 'pickVehicle' } : initialKiosk(s.run + 1);
    case 'done':
      return { ...s, step: 'done', done: a.result };
  }
}

export const STEP_INDEX: Record<Step, number> = {
  search: 0,
  notFound: 0,
  pickCustomer: 0,
  register: 1,
  pickVehicle: 1,
  whoAreYou: 1,
  addVehicle: 1,
  linkOwner: 1,
  visit: 2,
  done: 3,
};
