// @vitest-environment jsdom
/**
 * Money paths of the purchase wizard's SBP option: who sees it, and that a
 * retry can never turn into a second purchase (the idempotency key — the
 * checkout id — is reused exactly when it must be).
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Tariff } from '@/types';
import { PurchaseWizard } from './PurchaseWizard';

const api = vi.hoisted(() => ({
  preview: vi.fn(),
  sbpPreview: vi.fn(),
  sbpPurchase: vi.fn(),
  purchase: vi.fn(),
  open: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'ru' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));
vi.mock('@/hooks/useCurrency', () => ({
  useCurrency: () => ({ formatAmount: String, currencySymbol: 'RUB' }),
}));
vi.mock('@/platform', () => ({
  usePlatform: () => ({ platform: 'web', openLink: vi.fn(), capabilities: {} }),
}));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('@/utils/openPaymentUrl', () => ({ openPaymentUrl: api.open }));
vi.mock('@/api/balance', () => ({
  balanceApi: { getBalance: async () => ({ balance_kopeks: 100000 }) },
}));
vi.mock('@/api/subscription', () => ({
  subscriptionApi: {
    previewTariffPurchase: api.preview,
    previewRecurrentPurchase: api.sbpPreview,
    purchaseWithSbpRecurring: api.sbpPurchase,
    purchaseTariff: api.purchase,
    getSubscription: async () => ({ subscription: { id: 1, device_limit: 3 } }),
  },
}));

const tariff = {
  id: 1,
  name: 'PostqVPN',
  periods: [
    { days: 30, label: '1 месяц', price_kopeks: 34900 },
    { days: 90, label: '3 месяца', price_kopeks: 94200 },
    { days: 360, label: '12 месяцев', price_kopeks: 293200 },
  ],
  purchase_device_selection_supported: true,
  base_device_limit: 3,
  device_limit: 3,
  device_price_kopeks: 11500,
} as unknown as Tariff;

const inAnHour = () => new Date(Date.now() + 3_600_000).toISOString();
const network = () => Object.assign(new Error('Network Error'), { response: undefined });
const refused = (status: number) => Object.assign(new Error('refused'), { response: { status } });

let purchaseKind = 'new';
let sbpQuotes = 0;

beforeEach(() => {
  vi.clearAllMocks();
  purchaseKind = 'new';
  sbpQuotes = 0;
  api.preview.mockImplementation(async () => ({
    quote_id: 'q-balance',
    expires_at: inAnHour(),
    purchase_kind: purchaseKind,
    device_selection: {
      effective_limit: 3,
      included_limit: 3,
      selectable: true,
      min_limit: 3,
      max_limit: 10,
      reason: null,
    },
    total_kopeks: 34900,
    missing_kopeks: 0,
    devices_cost_kopeks: 0,
    discount_kopeks: 0,
  }));
  api.sbpPreview.mockImplementation(async (...args: unknown[]) => {
    sbpQuotes += 1;
    const yearly = args[4] === 360;
    return {
      amount_kopeks: yearly ? 293200 : 34900,
      charge_days: yearly ? 360 : 30,
      interval: yearly ? 4 : 3,
      selected_device_limit: 3,
      quote_id: `rq-${sbpQuotes}`,
      checkout_id: null,
      expires_at: inAnHour(),
    };
  });
});
afterEach(cleanup);

async function toConfirmation(sbpEnabled: boolean, periodLabel = '1 месяц') {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <PurchaseWizard tariff={tariff} subscriptionId={1} sbpEnabled={sbpEnabled} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole('radio', { name: new RegExp(periodLabel) }));
  fireEvent.click(await screen.findByRole('button', { name: 'postq.purchase.nextDevices' }));
  fireEvent.click(await screen.findByRole('button', { name: 'postq.purchase.nextConfirm' }));
  await screen.findByRole('button', { name: 'postq.purchase.pay' });
}

const SBP = /^postq\.sbp\.payButton/;
const sbpButton = () => screen.findByRole('button', { name: SBP });
async function clickWhenReady(name: string | RegExp) {
  const button = await screen.findByRole('button', { name });
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(button);
}

it('offers SBP only when the bot has it on', async () => {
  await toConfirmation(false);
  expect(screen.queryByRole('button', { name: SBP })).toBeNull();
  expect(api.sbpPreview).not.toHaveBeenCalled();
});

it('does not offer SBP for a trial conversion', async () => {
  purchaseKind = 'trial_conversion';
  await toConfirmation(true);
  await waitFor(() => expect(api.preview).toHaveBeenCalled());
  expect(screen.queryByRole('button', { name: SBP })).toBeNull();
});

it('one month: SBP pays exactly the month, monthly', async () => {
  await toConfirmation(true);
  await sbpButton();
  expect(await screen.findByText('postq.sbp.payHintMonth')).toBeTruthy();
  expect(api.sbpPreview).toHaveBeenCalledWith('platega', 1, 1, 3, 30);
});

it('twelve months: SBP pays the year at the yearly price, once a year', async () => {
  api.sbpPurchase.mockResolvedValue({ status: 'pending', redirect_url: null, subscription_id: 1 });
  await toConfirmation(true, '12 месяцев');
  expect(await screen.findByText('postq.sbp.payHintYear')).toBeTruthy();
  expect(api.sbpPreview).toHaveBeenCalledWith('platega', 1, 1, 3, 360);
  await clickWhenReady(SBP);
  await waitFor(() => expect(api.sbpPurchase).toHaveBeenCalledTimes(1));
  expect(api.sbpPurchase.mock.calls[0][3]).toBe(360);
});

it('three months: no SBP payment, only a way to a supported period', async () => {
  await toConfirmation(true, '3 месяца');
  expect(await screen.findByText(/postq\.sbp\.availableFor/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: SBP })).toBeNull();
  expect(api.sbpPreview).not.toHaveBeenCalled();

  // The supported periods are offered as links (1 and 12 months).
  const choices = [
    screen.getByRole('button', { name: '1 месяц' }),
    screen.getByRole('button', { name: '12 месяцев' }),
  ];
  fireEvent.click(choices[0]);
  // The choice moves the whole purchase to that period; SBP is offered then.
  await sbpButton();
  await waitFor(() => expect(api.sbpPreview).toHaveBeenCalledWith('platega', 1, 1, 3, 30));
});

it('replays the same checkout after an uncertain failure, a fresh one after a refusal', async () => {
  api.sbpPurchase
    .mockRejectedValueOnce(network())
    .mockRejectedValueOnce(refused(500))
    .mockRejectedValueOnce(refused(400))
    .mockResolvedValueOnce({
      status: 'pending',
      redirect_url: 'https://bank/1',
      subscription_id: 1,
    });
  await toConfirmation(true);

  await clickWhenReady(SBP);
  await waitFor(() => expect(api.sbpPurchase).toHaveBeenCalledTimes(1));
  await clickWhenReady(SBP);
  await waitFor(() => expect(api.sbpPurchase).toHaveBeenCalledTimes(2));
  await clickWhenReady(SBP);
  await waitFor(() => expect(api.sbpPurchase).toHaveBeenCalledTimes(3));
  // After the 400 the price is asked again before the next attempt.
  await waitFor(() => expect(api.sbpPreview).toHaveBeenCalledTimes(2));
  await clickWhenReady(SBP);
  await waitFor(() => expect(api.sbpPurchase).toHaveBeenCalledTimes(4));

  const selections = api.sbpPurchase.mock.calls.map((call) => call[2]);
  // The chosen period travels with every attempt.
  expect(api.sbpPurchase.mock.calls.every((call) => call[3] === 30)).toBe(true);
  // No answer / 5xx: exactly the same request, so the bot sees a replay.
  expect(selections[1]).toEqual(selections[0]);
  expect(selections[2]).toEqual(selections[0]);
  expect(selections[0]).toMatchObject({ selected_device_limit: 3, quote_id: 'rq-1' });
  expect(selections[0].checkout_id).toMatch(/^[0-9a-f-]{36}$/);
  // 4xx: a definite «no» — new price, new checkout.
  expect(selections[3].quote_id).toBe('rq-2');
  expect(selections[3].checkout_id).not.toBe(selections[0].checkout_id);

  await waitFor(() =>
    expect(api.open).toHaveBeenCalledWith('https://bank/1', 'web', expect.any(Function)),
  );
});

it('an SBP attempt never changes the balance purchase key', async () => {
  api.purchase.mockRejectedValue(network());
  api.sbpPurchase.mockRejectedValue(network());
  await toConfirmation(true);

  await clickWhenReady('postq.purchase.pay');
  await waitFor(() => expect(api.purchase).toHaveBeenCalledTimes(1));
  await clickWhenReady(SBP);
  await waitFor(() => expect(api.sbpPurchase).toHaveBeenCalledTimes(1));
  await clickWhenReady('postq.purchase.pay');
  await waitFor(() => expect(api.purchase).toHaveBeenCalledTimes(2));

  const balanceKeys = api.purchase.mock.calls.map((call) => call[4]);
  expect(balanceKeys[1]).toBe(balanceKeys[0]);
  expect(api.sbpPurchase.mock.calls[0][2].checkout_id).not.toBe(balanceKeys[0]);
});
