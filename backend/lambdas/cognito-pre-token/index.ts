import type { PreTokenGenerationV2TriggerEvent } from 'aws-lambda';
import { log } from '../shared/log';
import { findActiveStaff, linkCognitoSub, type StaffRow } from '../shared/staff';

export const ACCESS_REMOVED_MESSAGE = 'Staff access removed.';
const TTL_MS = 60_000;
const cache = new Map<string, { at: number; staff: StaffRow | null }>();

async function lookup(email: string): Promise<StaffRow | null> {
  const hit = cache.get(email);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.staff;
  const staff = await findActiveStaff(email);
  cache.set(email, { at: Date.now(), staff });
  return staff;
}

export function _clearCache(): void {
  cache.clear();
}

/** Adds the claims Supabase and RLS need (SPEC-BACKEND 7.1) to access and ID tokens. */
export async function handler(event: PreTokenGenerationV2TriggerEvent): Promise<PreTokenGenerationV2TriggerEvent> {
  const email = event.request.userAttributes.email?.trim().toLowerCase() ?? '';
  const staff = email ? await lookup(email) : null;
  if (!staff || !staff.active) {
    log('warn', 'pre-token denied', { trigger: event.triggerSource });
    throw new Error(ACCESS_REMOVED_MESSAGE);
  }
  const sub = event.request.userAttributes.sub;
  if (!staff.cognito_sub && sub) {
    await linkCognitoSub(staff.id, sub);
    staff.cognito_sub = sub;
  }
  const claims = {
    role: 'authenticated',
    staff_id: staff.id,
    shop_id: staff.shop_id,
    app_roles: staff.roles.join(' '),
    staff_email: staff.email,
  };
  event.response = {
    claimsAndScopeOverrideDetails: {
      accessTokenGeneration: { claimsToAddOrOverride: claims },
      idTokenGeneration: { claimsToAddOrOverride: claims },
    },
  };
  log('info', 'pre-token issued', { staff_id: staff.id, trigger: event.triggerSource });
  return event;
}
