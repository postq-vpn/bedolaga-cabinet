// @vitest-environment jsdom
/**
 * A promo code discount in the purchase wizard: the period tiles carry it, the
 * confirmation names it as its own line, and the SBP offer says it doesn't
 * apply there (the bot charges auto-renewal at the plain price).
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Tariff } from '@/types';
import { PurchaseWizard } from './PurchaseWizard';

const state = vi.hoisted(() => ({ percent: 15 }));
const api = vi.hoisted(() => ({ deactivate: vi.fn(async () => ({ success: true })) }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: unknown) =>
      opts && typeof opts === 'object' && 'percent' in opts
        ? `${key}:${(opts as { code?: string }).code ?? ''}:${(opts as { percent: number }).percent}`
        : key,
    i18n: { language: 'ru' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));
vi.mock('@/hooks/useCurrency', () => ({
  useCurrency: () => ({ formatAmount: String, currencySymbol: 'RUB' }),
}));
vi.mock('@/platform', () => ({
  usePlatform: () => ({ platform: 'web', openLink: vi.fn(), capabilities: {} }),
}));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('@/api/balance', () => ({
  balanceApi: { getBalance: async () => ({ balance_kopeks: 100000 }) },
}));
vi.mock('@/api/promo', () => ({
  promoApi: {
    deactivateDiscount: api.deactivate,
    getActiveDiscount: async () => ({
      discount_percent: state.percent,
      source: 'promocode:SALE',
      expires_at: null,
      is_active: state.percent > 0,
    }),
  },
}));
vi.mock('@/api/subscription', () => ({
  subscriptionApi: {
    // As the bot: cost lines before the promo code, the total after it.
    previewTariffPurchase: async () => ({
      quote_id: 'q',
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      purchase_kind: 'paid_renewal',
      device_selection: {
        effective_limit: 3,
        included_limit: 3,
        selectable: true,
        min_limit: 3,
        max_limit: 10,
        reason: null,
      },
      tariff_cost_kopeks: 34900,
      devices_cost_kopeks: 0,
      traffic_cost_kopeks: 0,
      discount_kopeks: state.percent ? 5235 : 0,
      total_kopeks: state.percent ? 29665 : 34900,
      missing_kopeks: 0,
    }),
    previewRecurrentPurchase: async () => ({
      amount_kopeks: 34900,
      charge_days: 30,
      interval: 3,
      selected_device_limit: 3,
      quote_id: 'rq',
      checkout_id: null,
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    }),
    getSubscription: async () => ({ subscription: { id: 1, device_limit: 3 } }),
  },
}));

const tariff = {
  id: 1,
  name: 'PostqVPN',
  periods: [
    { days: 30, label: '1 месяц', price_kopeks: 34900 },
    { days: 360, label: '12 месяцев', price_kopeks: 293200 },
  ],
  purchase_device_selection_supported: true,
  base_device_limit: 3,
  device_limit: 3,
  device_price_kopeks: 11500,
} as unknown as Tariff;

beforeEach(() => {
  state.percent = 15;
});
afterEach(cleanup);

function renderWizard() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <PurchaseWizard tariff={tariff} subscriptionId={1} sbpEnabled />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it('shows the period prices with the promo code taken off', async () => {
  renderWizard();
  const tile = await screen.findByRole('radio', { name: /1 месяц/ });
  // 349 ₽ − 15% = 296.65 ₽, the old price crossed out.
  expect(await within(tile).findAllByText('296.65 RUB')).not.toHaveLength(0);
  expect(within(tile).getAllByText('349 RUB')[0].tagName).toBe('S');
});

it('names the promo code as its own line at confirmation and warns about SBP', async () => {
  renderWizard();
  fireEvent.click(await screen.findByRole('radio', { name: /1 месяц/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'postq.purchase.nextDevices' }));
  fireEvent.click(await screen.findByRole('button', { name: 'postq.purchase.nextConfirm' }));

  const line = await screen.findByText('postq.promo.line:SALE:15');
  expect(line.nextElementSibling?.textContent).toContain('52.35');
  // The period itself has no discount: no «Скидка за срок» line.
  expect(screen.queryByText(/postq\.purchase\.discountFor/)).toBeNull();
  expect(screen.getByText(/postq\.promo\.notForSbp/)).toBeTruthy();
  // The applied code is a chip under the promo field, with a way to take it off.
  expect(screen.getByText('SALE')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'postq.promo.remove' }));
  await waitFor(() => expect(api.deactivate).toHaveBeenCalled());
});

it('offers to enter a promo code right at confirmation', async () => {
  state.percent = 0;
  renderWizard();
  fireEvent.click(await screen.findByRole('radio', { name: /1 месяц/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'postq.purchase.nextDevices' }));
  fireEvent.click(await screen.findByRole('button', { name: 'postq.purchase.nextConfirm' }));

  fireEvent.click(await screen.findByRole('button', { name: 'postq.promo.have' }));
  expect(screen.getByRole('textbox', { name: 'postq.payment.promoTitle' })).toBeTruthy();
  expect(screen.queryByText(/postq\.promo\.line/)).toBeNull();
  expect(screen.queryByText(/postq\.promo\.notForSbp/)).toBeNull();
});
