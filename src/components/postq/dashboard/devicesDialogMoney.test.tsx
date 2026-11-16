// @vitest-environment jsdom
/**
 * Money in the devices dialog: the shortfall comes from the bot's kopeks
 * fields (it read «0 ₽» before), and a live SBP binding is announced before
 * the change and reported after it (the bot closes it — its amount was priced
 * for the old count).
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, type AxiosResponse } from 'axios';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DevicesDialog } from './DevicesDialog';

const api = vi.hoisted(() => ({
  purchase: vi.fn(),
  sbp: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts && 'amount' in opts ? `${key}:${opts.amount}` : key,
    i18n: { language: 'ru' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));
vi.mock('@/hooks/useCurrency', () => ({
  useCurrency: () => ({ formatAmount: (v: number) => String(v), currencySymbol: '₽' }),
}));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ showToast: api.toast }) }));
vi.mock('../payment/TopUpDialog', () => ({ TopUpDialog: () => null }));
vi.mock('@/api/subscription', () => ({
  subscriptionApi: {
    getDevices: async () => ({ devices: [], total: 0, device_limit: 3 }),
    getDeviceReductionInfo: async () => ({ available: false, min_device_limit: 3 }),
    getDevicePrice: async (n: number) => ({
      available: true,
      price_per_device_kopeks: 23000,
      total_price_kopeks: 23000 * n,
    }),
    getPurchaseOptions: async () => ({ platega_recurrent_enabled: true }),
    getSbpRecurring: api.sbp,
    purchaseDevices: api.purchase,
    saveDevicesCart: async () => {},
  },
}));

function insufficient(detail: Record<string, unknown>) {
  const error = new AxiosError('Payment Required');
  error.response = { status: 402, data: { detail } } as AxiosResponse;
  return error;
}

beforeEach(() => {
  vi.clearAllMocks();
  api.sbp.mockResolvedValue({ status: 'none' });
});
afterEach(cleanup);

function renderDialog() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <DevicesDialog open onOpenChange={() => {}} subscriptionId={1} />
    </QueryClientProvider>,
  );
}

async function addOne() {
  const more = await screen.findByRole('button', { name: 'postq.devices.more' });
  await waitFor(() => expect((more as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(more);
}

it('shows the real shortfall from the kopeks fields of the device purchase', async () => {
  api.purchase.mockRejectedValue(
    insufficient({
      code: 'insufficient_funds',
      error: 'Insufficient balance',
      required_kopeks: 46000,
      current_kopeks: 45000,
      missing_kopeks: 1000,
    }),
  );
  renderDialog();
  await addOne();
  fireEvent.click(await screen.findByRole('button', { name: /postq\.devices\.buy/ }));

  expect(await screen.findByText('postq.devices.missing:10 ₽')).toBeTruthy();
  expect(screen.getByRole('button', { name: /^postq\.devices\.topUp:10\s₽$/ })).toBeTruthy();
  expect(screen.queryByText(/:0\s₽/)).toBeNull();
});

it('drops a stale shortfall when the count changes', async () => {
  api.purchase.mockRejectedValue(
    insufficient({ code: 'insufficient_funds', missing_kopeks: 1000 }),
  );
  renderDialog();
  await addOne();
  fireEvent.click(await screen.findByRole('button', { name: /postq\.devices\.buy/ }));
  await screen.findByText('postq.devices.missing:10 ₽');

  fireEvent.click(screen.getByRole('button', { name: 'postq.devices.less' }));
  await waitFor(() => expect(screen.queryByText('postq.devices.missing:10 ₽')).toBeNull());
});

it('warns before changing devices while SBP auto-debit is bound', async () => {
  api.sbp.mockResolvedValue({ status: 'ACTIVE', amount_kopeks: 34900, interval: 3 });
  renderDialog();
  await waitFor(() => expect(api.sbp).toHaveBeenCalled());
  expect(screen.queryByText('postq.devices.sbpWillClose')).toBeNull();
  await addOne();
  expect(await screen.findByText('postq.devices.sbpWillClose')).toBeTruthy();
});

it('no warning when nothing is bound', async () => {
  renderDialog();
  await addOne();
  await screen.findByRole('button', { name: /postq\.devices\.buy/ });
  expect(screen.queryByText('postq.devices.sbpWillClose')).toBeNull();
});

it('tells the user the binding was closed after the purchase', async () => {
  api.sbp.mockResolvedValue({ status: 'ACTIVE', amount_kopeks: 34900, interval: 3 });
  api.purchase.mockResolvedValue({ success: true, sbp_recurring_cancelled: true });
  renderDialog();
  await addOne();
  fireEvent.click(await screen.findByRole('button', { name: /postq\.devices\.buy/ }));

  await waitFor(() =>
    expect(api.toast).toHaveBeenCalledWith({ type: 'info', message: 'postq.devices.sbpClosed' }),
  );
  expect(api.purchase).toHaveBeenCalledWith(1, 1);
});
