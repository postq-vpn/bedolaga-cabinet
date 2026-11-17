import type { TariffDeviceQuote } from '@/api/subscription';
import type { TariffPeriod } from '@/types';
import { combinePromoDiscount } from '@/hooks/usePromoDiscount';

export interface CheckoutPrice {
  /** What the purchase costs, every discount off. */
  total: number;
  /** Price before any discount, or null when there is none. */
  original: number | null;
  /** All discounts together (period/group + promo code). */
  discount: number;
  /** Percent of `discount` against `original`, for the badges. */
  discountPercent: number;
  /** The period (promo group) part of the discount. */
  groupDiscount: number;
  groupPercent: number;
  /** The promo code part of the discount. */
  promoDiscount: number;
  promoPercent: number;
}

/**
 * Split a checkout price into the period discount and the promo code discount.
 *
 * The server quote already has the promo code taken off `total_kopeks`, but
 * reports both discounts as one `discount_kopeks`. Its cost lines are after
 * the group discount and before the promo code, so the promo part is what's
 * between their sum and the total. Before the quote arrives (or when it's
 * refused) the period's own prices are used, and the promo code — which
 * the server leaves out of them — is laid on top here.
 */
export function checkoutPrice(
  quote: TariffDeviceQuote | undefined,
  period: TariffPeriod | null,
  activePercent: number,
): CheckoutPrice {
  let total: number;
  let discount: number;
  let promoDiscount: number;
  if (quote) {
    total = quote.total_kopeks;
    discount = quote.discount_kopeks ?? 0;
    const beforePromo =
      (quote.tariff_cost_kopeks ?? 0) +
      (quote.devices_cost_kopeks ?? 0) +
      (quote.traffic_cost_kopeks ?? 0);
    // No cost lines (an older bot): nothing to split, it all reads as one discount.
    promoDiscount = beforePromo > 0 ? Math.min(discount, Math.max(0, beforePromo - total)) : 0;
  } else if (period) {
    const priced = combinePromoDiscount(
      period.price_kopeks,
      period.original_price_kopeks,
      activePercent,
    );
    total = priced.price;
    discount = priced.original ? priced.original - priced.price : 0;
    promoDiscount = period.price_kopeks - priced.price;
  } else {
    return {
      total: 0,
      original: null,
      discount: 0,
      discountPercent: 0,
      groupDiscount: 0,
      groupPercent: 0,
      promoDiscount: 0,
      promoPercent: 0,
    };
  }

  const groupDiscount = Math.max(0, discount - promoDiscount);
  const original = discount > 0 ? total + discount : null;
  const pct = (part: number, of: number) => (of > 0 ? Math.round((part / of) * 100) : 0);
  return {
    total,
    original,
    discount,
    discountPercent: original
      ? promoDiscount > 0
        ? pct(discount, original)
        : (period?.discount_percent ?? pct(discount, original))
      : 0,
    groupDiscount,
    groupPercent:
      groupDiscount > 0 ? (period?.discount_percent ?? pct(groupDiscount, total + discount)) : 0,
    promoDiscount,
    promoPercent:
      promoDiscount > 0 ? activePercent || pct(promoDiscount, total + promoDiscount) : 0,
  };
}
