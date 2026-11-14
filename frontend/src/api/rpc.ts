// Typed wrappers for every backend RPC (SPEC-BACKEND section 8). Responses are parsed with zod.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError, toAppError } from './errors';
import {
  type AppRole, BoardRow, CustomerDetail, CustomerRow, Job, type JobScope, type JobStatus, JobSummary, KioskAddVehicle,
  KioskCheckIn, KioskCustomerMatch, KioskLinkOwner, KioskLookup, KioskRegister, Me, SearchAll, Session, Shop, Staff,
  VehicleDetail, VehicleRow, VerifyPin, page, PAGE_SIZE,
} from './types';

export interface VehicleInput { plate: string; year?: number | null; make: string; model: string; engine?: string; vin?: string }
export interface CustomerInput { name: string; phone: string; email?: string }
export interface CheckInInput {
  customer_id: string; vehicle_id: string; reasons: string[]; odometer_km?: number | null; concerns: string[];
  intake?: unknown; signed_name: string; signature_path: string;
}
export interface JobPatch {
  reasons?: string[]; odometer_km?: number | null; notes?: string; pickup_date?: string | null; received_by?: string | null;
  concerns?: { text: string; estimate: number | null }[];
  items?: { type: 'part' | 'labour'; description: string; qty: number; unit_price: number }[];
}
export interface StaffInput {
  id?: string; name: string; email: string; roles: AppRole[]; quick_switch: AppRole[]; active: boolean; pin?: string;
}

type Listener = (e: AppError) => void;

export class Api {
  private sessionListeners = new Set<Listener>();

  constructor(
    readonly db: SupabaseClient,
    private readonly sessionId: () => string | null,
  ) {}

  /** Called when any RPC reports SESSION_EXPIRED or SESSION_INVALID. */
  onSessionError(fn: Listener): () => void {
    this.sessionListeners.add(fn);
    return () => this.sessionListeners.delete(fn);
  }

  private session(): string {
    const id = this.sessionId();
    if (!id) throw new AppError('SESSION_INVALID');
    return id;
  }

  async call<T>(name: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
    const { data, error } = await this.db.rpc(name, args);
    if (error) {
      const e = toAppError(error);
      if (e.code === 'SESSION_EXPIRED' || e.code === 'SESSION_INVALID') this.sessionListeners.forEach((l) => l(e));
      throw e;
    }
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      console.error(`RPC ${name}: unexpected response`, parsed.error, data);
      throw new AppError('UNKNOWN', null, parsed.error);
    }
    return parsed.data;
  }

  private s(args: Record<string, unknown> = {}) {
    return { p_session: this.session(), ...args };
  }

  // 8.1 identity and sessions
  me = () => this.call('me', {}, Me);
  startSession = (role: AppRole, deviceLabel: string) => this.call('start_session', { p_role: role, p_device_label: deviceLabel }, Session);
  getSession = (id: string) => this.call('get_session', { p_session: id }, Session);
  switchRole = (role: AppRole) => this.call('switch_role', this.s({ p_role: role }), Session);
  endSession = (id: string) => this.call('end_session', { p_session: id }, z.unknown());
  setMyPin = (pin: string) => this.call('set_my_pin', { p_pin: pin }, z.unknown());
  verifyPin = (pin: string) => this.call('verify_pin', this.s({ p_pin: pin }), VerifyPin);

  // 8.2 kiosk
  kioskLookup = (q: string) => this.call('kiosk_lookup', this.s({ p_query: q }), KioskLookup);
  kioskCustomerVehicles = (customerId: string) =>
    this.call('kiosk_customer_vehicles', this.s({ p_customer_id: customerId }), KioskCustomerMatch);
  kioskRegister = (c: CustomerInput, v: VehicleInput) => this.call('kiosk_register', this.s({ p_customer: c, p_vehicle: v }), KioskRegister);
  kioskAddVehicle = (customerId: string, v: VehicleInput) =>
    this.call('kiosk_add_vehicle', this.s({ p_customer_id: customerId, p_vehicle: v }), KioskAddVehicle);
  kioskLinkOwner = (vehicleId: string, customer: { customer_id: string } | { phone: string; name: string }, mode: 'transfer' | 'co_owner') =>
    this.call('kiosk_link_owner', this.s({ p_vehicle_id: vehicleId, p_customer: customer, p_mode: mode }), KioskLinkOwner);
  kioskCheckIn = (p: CheckInInput) => this.call('kiosk_check_in', this.s({ p }), KioskCheckIn);

  // 8.3 jobs
  createWorkOrder = (p: { vehicle_id: string; customer_id: string; reasons: string[]; odometer_km?: number | null; concerns: string[] }) =>
    this.call('create_work_order', this.s({ p }), Job);
  saveWorkOrder = (id: string, version: number, patch: JobPatch) =>
    this.call('save_work_order', this.s({ p_id: id, p_expected_version: version, p_patch: patch }), Job);
  jobTransition = (id: string, to: JobStatus, version: number, reason?: string) =>
    this.call('job_transition', this.s({ p_id: id, p_to: to, p_expected_version: version, ...(reason ? { p_reason: reason } : {}) }), Job);
  getWorkOrder = (id: string) => this.call('get_work_order', { p_id: id }, Job);
  listJobs = (scope: JobScope) => this.call('list_jobs', { p_scope: scope }, z.array(JobSummary));
  findJobByCode = (code: string) => this.call('find_job_by_code', { p_code: code }, z.object({ id: z.string() }));

  // 8.4 records
  searchAll = (q: string) => this.call('search_all', { p_query: q }, SearchAll);
  getCustomer = (id: string) => this.call('get_customer', { p_id: id }, CustomerDetail);
  getVehicle = (id: string) => this.call('get_vehicle', { p_id: id }, VehicleDetail);
  updateCustomer = (id: string, p: Partial<CustomerInput>) => this.call('update_customer', this.s({ p_id: id, p }), CustomerDetail);
  updateVehicle = (id: string, p: Partial<VehicleInput>) => this.call('update_vehicle', this.s({ p_id: id, p }), VehicleDetail);
  ownerAdd = (vehicleId: string, phone: string, name: string, mode: 'transfer' | 'co_owner') =>
    this.call('owner_add', this.s({ p_vehicle_id: vehicleId, p_phone: phone, p_name: name, p_mode: mode }), VehicleDetail);
  ownerEnd = (ownerId: string) => this.call('owner_end', this.s({ p_owner_id: ownerId }), VehicleDetail);
  ownerVerify = (ownerId: string) => this.call('owner_verify', this.s({ p_owner_id: ownerId }), VehicleDetail);
  listCustomers = (query: string, pageNo: number) =>
    this.call('list_customers', { p_query: query, p_limit: PAGE_SIZE, p_offset: pageNo * PAGE_SIZE }, page(CustomerRow));
  listVehicles = (query: string, pageNo: number) =>
    this.call('list_vehicles', { p_query: query, p_limit: PAGE_SIZE, p_offset: pageNo * PAGE_SIZE }, page(VehicleRow));

  // 8.5 admin
  listStaff = () => this.call('list_staff', {}, z.array(Staff));
  staffUpsert = (p: StaffInput) => this.call('staff_upsert', this.s({ p }), Staff);
  updateShop = (p: { name?: string; hst_rate?: number; labour_rate?: number }) => this.call('update_shop', this.s({ p }), Shop);

  // views
  async displayBoard(): Promise<BoardRow[]> {
    const { data, error } = await this.db.from('v_display_board').select('*');
    if (error) throw toAppError(error);
    return z.array(BoardRow).parse(data);
  }

  // storage
  async uploadSignature(shopId: string, png: Blob): Promise<string> {
    const now = new Date();
    const path = `${shopId}/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}.png`;
    const { error } = await this.db.storage.from('signatures').upload(path, png, { contentType: 'image/png', upsert: false });
    if (error) throw new AppError('UNKNOWN', error.message, error);
    return path;
  }

  async signatureUrl(path: string): Promise<string | null> {
    const { data, error } = await this.db.storage.from('signatures').createSignedUrl(path, 300);
    return error ? null : data.signedUrl;
  }
}
