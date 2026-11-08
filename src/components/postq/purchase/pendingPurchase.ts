import { safeLocal } from '@/utils/safeStorage';

/**
 * A subscription purchase the user started but couldn't pay from the balance.
 * Saved right before leaving for the payment page; usePendingPurchase()
 * completes it once the top-up lands. The checkout id is the purchase's
 * idempotency key, so a repeated attempt can't charge twice.
 */
export interface PendingPurchase {
  tariffId: number;
  days: number;
  devices?: number;
  subscriptionId?: number;
  checkoutId: string;
  totalKopeks: number;
  createdAt: number;
}

const KEY = 'postq-pending-purchase';
/** A top-up older than this is not tied to the purchase any more. */
export const PENDING_PURCHASE_TTL_MS = 24 * 60 * 60 * 1000;

export const PENDING_PURCHASE_EVENT = 'postq-pending-purchase';

export function savePendingPurchase(p: PendingPurchase) {
  safeLocal.setJson(KEY, p);
  // The payment may open in another tab/app while this one stays open.
  window.dispatchEvent(new Event(PENDING_PURCHASE_EVENT));
}

export function loadPendingPurchase(): PendingPurchase | null {
  const p = safeLocal.getJson<PendingPurchase | null>(KEY, null);
  if (!p || typeof p.tariffId !== 'number' || typeof p.checkoutId !== 'string') return null;
  if (Date.now() - p.createdAt > PENDING_PURCHASE_TTL_MS) {
    clearPendingPurchase();
    return null;
  }
  return p;
}

export function clearPendingPurchase() {
  safeLocal.removeItem(KEY);
}
