import type { PreSignUpTriggerEvent } from 'aws-lambda';
import { log } from '../shared/log';
import { findActiveStaff } from '../shared/staff';

export const NOT_STAFF_MESSAGE = 'This Google account is not registered as staff. Ask the shop owner to add you.';

/** Only e-mails registered as active staff may create a (federated) Cognito user. */
export async function handler(event: PreSignUpTriggerEvent): Promise<PreSignUpTriggerEvent> {
  const email = event.request.userAttributes.email?.trim().toLowerCase();
  const staff = email ? await findActiveStaff(email) : null;
  if (!staff) {
    log('warn', 'pre-signup denied', { trigger: event.triggerSource });
    throw new Error(NOT_STAFF_MESSAGE);
  }
  event.response.autoConfirmUser = true;
  event.response.autoVerifyEmail = true;
  log('info', 'pre-signup allowed', { staff_id: staff.id, trigger: event.triggerSource });
  return event;
}
