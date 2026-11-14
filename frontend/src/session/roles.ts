import type { AppRole, Staff } from '../api/types';

export const ROLE_INFO: Record<AppRole, { label: string; desc: string; home: string }> = {
  kiosk: { label: 'Kiosk', desc: 'Customer self check-in screen. Stays locked until a staff PIN is entered.', home: '/kiosk' },
  frontdesk: { label: 'Front desk', desc: 'Receive keys, accept jobs, print job QR tags, estimates and pickup.', home: '/desk' },
  workshop: { label: 'Workshop', desc: 'Scan a job QR code, take up the job, add repair details and complete it.', home: '/workshop' },
  display: { label: 'Display panel', desc: 'Waiting-room screen that shows customers the progress of their vehicle.', home: '/display' },
  admin: { label: 'Administrator', desc: 'Staff, roles, role switching and all records.', home: '/admin' },
};
export const ROLE_ORDER: AppRole[] = ['kiosk', 'frontdesk', 'workshop', 'display', 'admin'];

export const roleLabel = (r: AppRole) => ROLE_INFO[r].label;
export const homeFor = (r: AppRole) => ROLE_INFO[r].home;

export type SwitchOption = 'current' | 'switch' | 'signout';

/** Quick switch is allowed only when both the current role and the target are in quick_switch (SPEC-BACKEND 7.3). */
export function switchOption(staff: Pick<Staff, 'roles' | 'quick_switch'>, current: AppRole, target: AppRole): SwitchOption {
  if (target === current) return 'current';
  if (staff.roles.includes(target) && staff.quick_switch.includes(current) && staff.quick_switch.includes(target)) return 'switch';
  return 'signout';
}

/** Roles that need a PIN before their session starts. */
export const needsPin = (r: AppRole) => r === 'kiosk' || r === 'display';
