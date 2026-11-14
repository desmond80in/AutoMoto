import type { SmsKind } from '../api/types';
import { firstName, fmtPhone, money, vehicleName } from './format';

export const SMS_MAX = 480;

export const SMS_KIND_LABELS: Record<SmsKind, string> = {
  ready: 'Ready for pickup',
  approval: 'Approval needed',
  waiting_parts: 'Waiting on parts',
  custom: 'Message',
};

export interface SmsContext {
  shopName: string;
  shopPhone: string | null;
  customerName: string;
  vehicle: { year?: number | null; make?: string | null; model?: string | null };
  total: number;
  approvalNote?: string | null;
}

const STOP = 'Reply STOP to opt out.';

/** Starting text for each kind of message. Staff can edit it before sending. */
export function smsTemplate(kind: SmsKind, c: SmsContext): string {
  const hi = `${c.shopName}: Hi ${firstName(c.customerName) || 'there'},`;
  const car = vehicleName(c.vehicle) || 'vehicle';
  const call = c.shopPhone ? ` Questions? Call us at ${fmtPhone(c.shopPhone)}.` : '';
  switch (kind) {
    case 'ready':
      return `${hi} your ${car} is ready for pickup.${c.total > 0 ? ` Total: ${money(c.total)} incl. HST.` : ''}${call} ${STOP}`;
    case 'approval': {
      const note = c.approvalNote?.trim().replace(/[.\s]+$/, '');
      return `${hi} we found something on your ${car} that needs your OK before we continue${note ? `: ${note}` : ''}. Please call us${
        c.shopPhone ? ` at ${fmtPhone(c.shopPhone)}` : ''
      }. ${STOP}`;
    }
    case 'waiting_parts':
      return `${hi} your ${car} is waiting on parts. We'll text you when it's ready.${call} ${STOP}`;
    case 'custom':
      return `${hi} `;
  }
}

// GSM 03.38 basic set plus the extension table (counts as two characters).
const GSM = new Set(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà',
);
const GSM_EXT = new Set('^{}\\[~]|€');

/** How many SMS parts a message uses (carriers bill per part). */
export function smsSegments(body: string): { segments: number; unicode: boolean } {
  const chars = [...body];
  const unicode = chars.some((ch) => !GSM.has(ch) && !GSM_EXT.has(ch));
  const len = unicode ? chars.length : chars.reduce((n, ch) => n + (GSM_EXT.has(ch) ? 2 : 1), 0);
  if (len === 0) return { segments: 0, unicode };
  const [single, multi] = unicode ? [70, 67] : [160, 153];
  return { segments: len <= single ? 1 : Math.ceil(len / multi), unicode };
}
