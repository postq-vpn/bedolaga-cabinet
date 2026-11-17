import { describe, expect, it } from 'vitest';
import type { TariffDeviceQuote } from '@/api/subscription';
import type { TariffPeriod } from '@/types';
import { checkoutPrice } from './promoPrice';

const period = (over: Partial<TariffPeriod> = {}) =>
  ({ days: 360, months: 12, label: '12 месяцев', price_kopeks: 293200, ...over }) as TariffPeriod;

const quote = (over: Partial<TariffDeviceQuote>) =>
  ({
    tariff_cost_kopeks: 0,
    devices_cost_kopeks: 0,
    traffic_cost_kopeks: 0,
    discount_kopeks: 0,
    total_kopeks: 0,
    ...over,
  }) as TariffDeviceQuote;

describe('checkoutPrice', () => {
  it('splits the quote discount into the period part and the promo code part', () => {
    // 4188 ₽ list, −30% period → 2932 ₽, −15% promo → 2492.20 ₽.
    const price = checkoutPrice(
      quote({
        tariff_cost_kopeks: 293200,
        discount_kopeks: 125600 + 43980,
        total_kopeks: 249220,
      }),
      period({ original_price_kopeks: 418800, discount_percent: 30 }),
      15,
    );
    expect(price.total).toBe(249220);
    expect(price.original).toBe(418800);
    expect(price.groupDiscount).toBe(125600);
    expect(price.groupPercent).toBe(30);
    expect(price.promoDiscount).toBe(43980);
    expect(price.promoPercent).toBe(15);
    expect(price.discountPercent).toBe(40);
  });

  it('counts devices into the sum the promo code applies to', () => {
    const price = checkoutPrice(
      quote({
        tariff_cost_kopeks: 34900,
        devices_cost_kopeks: 11500,
        discount_kopeks: 6960,
        total_kopeks: 39440,
      }),
      period({ days: 30, price_kopeks: 34900 }),
      15,
    );
    expect(price.promoDiscount).toBe(6960);
    expect(price.groupDiscount).toBe(0);
  });

  it('lays the promo code on the period price before the quote arrives', () => {
    const price = checkoutPrice(undefined, period({ days: 30, price_kopeks: 34900 }), 15);
    expect(price.total).toBe(34900 - 5235);
    expect(price.promoDiscount).toBe(5235);
    expect(price.original).toBe(34900);
  });

  it('keeps the period percent when there is no promo code', () => {
    const price = checkoutPrice(
      quote({ tariff_cost_kopeks: 293200, discount_kopeks: 125600, total_kopeks: 293200 }),
      period({ original_price_kopeks: 418800, discount_percent: 30 }),
      0,
    );
    expect(price.promoDiscount).toBe(0);
    expect(price.discountPercent).toBe(30);
    expect(price.groupDiscount).toBe(125600);
  });
});
