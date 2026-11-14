// Response shapes of the backend RPCs (SPEC-BACKEND section 8), parsed with zod at the boundary.
import { z } from 'zod';

export const ROLES = ['kiosk', 'frontdesk', 'workshop', 'display', 'admin'] as const;
export const AppRole = z.enum(ROLES);
export type AppRole = z.infer<typeof AppRole>;

export const JOB_STATUSES = ['checked_in', 'accepted', 'in_progress', 'waiting_parts', 'ready', 'picked_up', 'cancelled'] as const;
export const JobStatus = z.enum(JOB_STATUSES);
export type JobStatus = z.infer<typeof JobStatus>;

export const REASONS = ['mechanical', 'body', 'accident'] as const;
export const Reason = z.enum(REASONS);
export type Reason = z.infer<typeof Reason>;

export const Urgency = z.enum(['routine', 'soon', 'unsafe']);
export type Urgency = z.infer<typeof Urgency>;

const ts = z.string();
const num = z.number();
const nstr = z.string().nullable().optional().transform((v) => v ?? null);
const nnum = z.number().nullable().optional().transform((v) => v ?? null);

export const Shop = z.object({ id: z.string(), name: z.string(), timezone: z.string(), hst_rate: num, labour_rate: num });
export type Shop = z.infer<typeof Shop>;

export const Staff = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  roles: z.array(AppRole),
  quick_switch: z.array(AppRole),
  is_owner: z.boolean(),
  has_pin: z.boolean(),
  active: z.boolean().optional(),
  created_at: ts.optional(),
});
export type Staff = z.infer<typeof Staff>;

export const Me = z.object({ staff: Staff, shop: Shop });
export type Me = z.infer<typeof Me>;

export const Session = z.object({ id: z.string(), role: AppRole, expires_at: ts, ended_at: nstr });
export type Session = z.infer<typeof Session>;

export const VerifyPin = z.object({ ok: z.literal(true), staff_id: z.string() });

// ---- kiosk
export const KioskVehicle = z.object({
  id: z.string(),
  plate: z.string(),
  year: nnum,
  make: z.string(),
  model: z.string(),
  role: z.enum(['owner', 'co_owner']).optional(),
  last_visit_at: nstr,
  last_odometer_km: nnum,
});
export type KioskVehicle = z.infer<typeof KioskVehicle>;

export const KioskCustomerMatch = z.object({
  match: z.literal('customer'),
  customer: z.object({ id: z.string(), first_name: z.string(), phone_last4: z.string() }),
  vehicles: z.array(KioskVehicle),
});
export type KioskCustomerMatch = z.infer<typeof KioskCustomerMatch>;

export const KioskOwner = z.object({
  customer_id: z.string(),
  masked_name: z.string(),
  phone_last4: z.string(),
  role: z.enum(['owner', 'co_owner']),
});
export type KioskOwner = z.infer<typeof KioskOwner>;

export const KioskLookup = z.discriminatedUnion('match', [
  KioskCustomerMatch,
  z.object({
    match: z.literal('customers'),
    customers: z.array(z.object({ id: z.string(), masked_name: z.string(), phone_last4: z.string() })),
  }),
  z.object({ match: z.literal('vehicle'), vehicle: KioskVehicle, owners: z.array(KioskOwner) }),
  z.object({ match: z.literal('none') }),
]);
export type KioskLookup = z.infer<typeof KioskLookup>;

export const KioskNext = z.enum(['visit', 'link_owner']);
export const KioskRegister = z.object({
  customer_id: z.string(),
  vehicle_id: z.string(),
  next: KioskNext,
  existing_customer: z.boolean(),
  first_name: z.string(),
});
export const KioskAddVehicle = z.object({ vehicle_id: z.string(), next: KioskNext });
export const KioskLinkOwner = z.object({ customer_id: z.string(), first_name: z.string() });
export const KioskCheckIn = z.object({
  work_order_id: z.string(),
  order_no: z.string(),
  first_name: z.string(),
  phone_masked: z.string(),
});
export type KioskCheckIn = z.infer<typeof KioskCheckIn>;

// ---- jobs
export const Intake = z.object({
  transcript: z.string().optional().default(''),
  summary: z.string().optional().default(''),
  when_it_happens: z.string().optional().default(''),
  warning_lights: z.array(z.string()).optional().default([]),
  urgency: Urgency.optional().default('routine'),
  safety_note: z.string().optional().default(''),
  questions: z.array(z.string()).optional().default([]),
});
export type Intake = z.infer<typeof Intake>;

export const JobTotals = z.object({ parts: num, labour: num, tax: num, total: num, estimate: num });

export const Job = z.object({
  id: z.string(),
  order_no: z.string(),
  status: JobStatus,
  version: num,
  reasons: z.array(Reason),
  odometer_km: nnum,
  notes: z.string(),
  pickup_date: nstr,
  source: z.enum(['kiosk', 'staff']),
  urgency: Urgency.nullable(),
  intake: Intake.nullable(),
  signed_name: nstr,
  signed_at: nstr,
  signature_path: nstr,
  created_at: ts,
  updated_at: ts.optional(),
  accepted_at: nstr,
  started_at: nstr,
  completed_at: nstr,
  picked_up_at: nstr,
  cancelled_at: nstr,
  cancel_reason: nstr.optional(),
  customer: z.object({ id: z.string(), name: z.string(), phone: z.string(), email: nstr }),
  vehicle: z.object({
    id: z.string(),
    plate: z.string(),
    year: nnum,
    make: z.string(),
    model: z.string(),
    engine: nstr,
    vin: nstr,
  }),
  received_by: z.object({ id: z.string(), name: z.string() }).nullable(),
  tech: z.object({ id: z.string(), name: z.string() }).nullable(),
  concerns: z.array(z.object({ text: z.string(), estimate: nnum })),
  items: z.array(z.object({ type: z.enum(['part', 'labour']), description: z.string(), qty: num, unit_price: num })),
  totals: JobTotals,
  events: z.array(z.object({ at: ts, message: z.string(), staff_name: nstr, kind: z.string().optional() })),
  owner_is_current: z.boolean(),
});
export type Job = z.infer<typeof Job>;

export const JobSummary = z.object({
  id: z.string(),
  order_no: z.string(),
  status: JobStatus,
  version: num,
  urgency: Urgency.nullable(),
  created_at: ts,
  accepted_at: nstr,
  started_at: nstr,
  completed_at: nstr.optional(),
  picked_up_at: nstr.optional(),
  odometer_km: nnum,
  vehicle_id: z.string().optional(),
  plate: z.string(),
  year: nnum,
  make: z.string(),
  model: z.string(),
  customer_id: z.string().optional(),
  customer_name: z.string(),
  customer_phone: z.string(),
  first_concern: nstr,
  concern_count: num,
  concerns: z.array(z.string()).optional().default([]),
  safety_note: nstr,
  tech_name: nstr,
  received_by_name: nstr,
  total: num,
  estimate: num,
  owner_unverified: z.boolean(),
  customer_was_owner_then: z.boolean().optional(),
  customer_is_current_owner: z.boolean().optional(),
});
export type JobSummary = z.infer<typeof JobSummary>;

export const JobScope = z.enum(['active', 'arrivals', 'queue', 'mine', 'recent_picked_up']);
export type JobScope = z.infer<typeof JobScope>;

// ---- records
export const SearchAll = z.object({
  customers: z.array(z.object({ id: z.string(), name: z.string(), phone: z.string(), vehicle_count: num })),
  vehicles: z.array(
    z.object({
      id: z.string(),
      plate: z.string(),
      year: nnum,
      make: z.string(),
      model: z.string(),
      current_owners: z.array(z.string()),
    }),
  ),
  jobs: z.array(JobSummary),
});
export type SearchAll = z.infer<typeof SearchAll>;

const OwnerRole = z.enum(['owner', 'co_owner']);

export const CustomerDetail = z.object({
  customer: z.object({ id: z.string(), name: z.string(), phone: z.string(), email: nstr, created_at: ts }),
  vehicles: z.array(
    z.object({
      id: z.string(),
      owner_id: z.string(),
      plate: z.string(),
      year: nnum,
      make: z.string(),
      model: z.string(),
      role: OwnerRole,
      since: ts,
      verified: z.boolean(),
      last_odometer_km: nnum,
    }),
  ),
  previous_vehicles: z.array(
    z.object({
      id: z.string(),
      plate: z.string(),
      year: nnum,
      make: z.string(),
      model: z.string(),
      role: OwnerRole,
      from_at: ts,
      to_at: ts,
      ended_reason: nstr,
    }),
  ),
  visits: z.array(JobSummary),
  visit_count: num,
  lifetime_total: num,
});
export type CustomerDetail = z.infer<typeof CustomerDetail>;

export const VehicleDetail = z.object({
  vehicle: z.object({
    id: z.string(),
    plate: z.string(),
    province: z.string(),
    year: nnum,
    make: z.string(),
    model: z.string(),
    engine: nstr,
    vin: nstr,
    created_at: ts,
  }),
  current_owners: z.array(
    z.object({
      id: z.string(),
      customer_id: z.string(),
      name: z.string(),
      phone: z.string(),
      role: OwnerRole,
      since: ts,
      verified: z.boolean(),
      source: z.enum(['kiosk', 'staff']),
    }),
  ),
  previous_owners: z.array(
    z.object({
      id: z.string(),
      customer_id: z.string(),
      name: z.string(),
      phone: z.string(),
      role: OwnerRole,
      from_at: ts,
      to_at: ts,
      ended_reason: nstr,
    }),
  ),
  history: z.array(JobSummary),
  last_odometer_km: nnum,
});
export type VehicleDetail = z.infer<typeof VehicleDetail>;

export const CustomerRow = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string(),
  email: nstr,
  plates: z.array(z.string()),
  visit_count: num,
  last_visit_at: nstr,
});
export type CustomerRow = z.infer<typeof CustomerRow>;

export const VehicleRow = z.object({
  id: z.string(),
  plate: z.string(),
  year: nnum,
  make: z.string(),
  model: z.string(),
  current_owners: z.array(z.string()),
  owners_on_record: num,
  visit_count: num,
  last_visit_at: nstr,
  last_odometer_km: nnum,
});
export type VehicleRow = z.infer<typeof VehicleRow>;

/** One page of a searchable list: `total` counts every match, `items` holds this page. */
export const page = <T extends z.ZodTypeAny>(item: T) => z.object({ total: num, items: z.array(item) });
export const PAGE_SIZE = 25;

export const BoardRow = z.object({
  id: z.string(),
  order_no: z.string(),
  status: JobStatus,
  plate: z.string(),
  make: z.string(),
  model: z.string(),
  masked_name: z.string(),
  created_at: ts,
  accepted_at: nstr,
  started_at: nstr,
  estimated_ready_at: nstr,
});
export type BoardRow = z.infer<typeof BoardRow>;

// ---- intake API (SPEC-BACKEND 11.1)
export const VisitIntake = z.object({
  concerns: z.array(z.string()),
  reasons: z.array(Reason),
  odometer_km: nnum,
  warning_lights: z.array(z.string()),
  when_it_happens: z.string(),
  urgency: Urgency,
  safety_note: z.string(),
  summary: z.string(),
  questions: z.array(z.string()),
});
export type VisitIntake = z.infer<typeof VisitIntake>;

export const RegistrationIntake = z.object({
  name: z.string(),
  phone: z.string(),
  email: z.string(),
  plate: z.string(),
  year: z.string(),
  make: z.string(),
  model: z.string(),
  engine: z.string(),
  vin: z.string(),
});
export type RegistrationIntake = z.infer<typeof RegistrationIntake>;
