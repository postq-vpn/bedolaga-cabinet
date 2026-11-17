// @vitest-environment jsdom
/**
 * SBP auto-debit switch (dashboard card and profile «Оплата»): money starts
 * moving only through the bank page, stops only after a confirmation, and
 * nothing asks the bot about SBP when the feature is off.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Subscription } from '@/types';
import { SbpAutopayRow, useSbpAutopay } from '../dashboard/SbpAutopay';
import { AutoDebitSection } from './AutoDebitSection';

const api = vi.hoisted(() => ({
  flag: true as boolean,
  trial: false,
  sbp: vi.fn(),
  enable: vi.fn(),
  cancel: vi.fn(),
  confirm: vi.fn(),
  open: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'ru' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));
vi.mock('@/hooks/useCurrency', () => ({
  useCurrency: () => ({ formatAmount: String, currencySymbol: '₽' }),
}));
vi.mock('@/platform', () => ({
  usePlatform: () => ({ platform: 'web', openLink: vi.fn(), capabilities: {} }),
}));
vi.mock('@/platform/hooks/useNativeDialog', () => ({ useDestructiveConfirm: () => api.confirm }));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ showToast: api.toast }) }));
vi.mock('@/utils/openPaymentUrl', () => ({ openPaymentUrl: api.open }));
vi.mock('@/api/subscription', () => ({
  subscriptionApi: {
    getPurchaseOptions: async () => ({ platega_recurrent_enabled: api.flag }),
    getSbpRecurring: api.sbp,
    enableSbpRecurring: api.enable,
    cancelSbpRecurring: api.cancel,
    getSubscriptions: async () => ({ subscriptions: [{ id: 7, is_trial: api.trial }] }),
  },
}));

const paid = { id: 7, is_trial: false, is_daily: false } as Subscription;

function Row({ subscription }: { subscription: Subscription }) {
  const sbp = useSbpAutopay(subscription);
  return <SbpAutopayRow subscription={subscription} sbp={sbp} />;
}

function renderWith(node: React.ReactNode) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {node}
    </QueryClientProvider>,
  );
}
const settle = () => new Promise((r) => setTimeout(r, 50));
const toggle = () => screen.findByRole('switch', { name: 'postq.sbp.title' });

beforeEach(() => {
  vi.clearAllMocks();
  api.flag = true;
  api.trial = false;
  api.sbp.mockResolvedValue({ status: 'none' });
  api.cancel.mockResolvedValue({ status: 'cancelled' });
});
afterEach(cleanup);

it('never asks the bot about SBP when the feature is off', async () => {
  api.flag = false;
  renderWith(<Row subscription={paid} />);
  await settle();
  expect(api.sbp).not.toHaveBeenCalled();
  expect(screen.queryByRole('switch')).toBeNull();
});

it('hides SBP for a trial subscription', async () => {
  renderWith(<Row subscription={{ ...paid, is_trial: true } as Subscription} />);
  await settle();
  expect(api.sbp).not.toHaveBeenCalled();
  expect(screen.queryByRole('switch')).toBeNull();
});

it('switching on sends the user to the bank page the bot returns', async () => {
  api.enable.mockResolvedValue({ status: 'pending', redirect_url: 'https://bank/x' });
  renderWith(<Row subscription={paid} />);
  const sw = await toggle();
  expect(sw.getAttribute('aria-checked')).toBe('false');
  fireEvent.click(sw);
  await waitFor(() => expect(api.enable).toHaveBeenCalledWith(7));
  expect(api.open).toHaveBeenCalledWith('https://bank/x', 'web', expect.any(Function));
});

it('waiting for the bank: on, with a way back to the bank page', async () => {
  api.sbp.mockResolvedValue({ status: 'PENDING', redirect_url: 'https://bank/y' });
  renderWith(<Row subscription={paid} />);
  expect((await toggle()).getAttribute('aria-checked')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'postq.sbp.openBank' }));
  expect(api.open).toHaveBeenCalledWith('https://bank/y', 'web', expect.any(Function));
});

it('switching off asks first and does nothing when declined', async () => {
  api.sbp.mockResolvedValue({ status: 'ACTIVE', amount_kopeks: 34900, interval: 3 });
  api.confirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  renderWith(<Row subscription={paid} />);

  fireEvent.click(await toggle());
  await waitFor(() => expect(api.confirm).toHaveBeenCalledTimes(1));
  expect(api.cancel).not.toHaveBeenCalled();

  fireEvent.click(await toggle());
  await waitFor(() => expect(api.cancel).toHaveBeenCalledWith(7));
  expect(api.enable).not.toHaveBeenCalled();
});

it('past due is shown as a problem and can still be switched off', async () => {
  api.sbp.mockResolvedValue({ status: 'PAST_DUE', amount_kopeks: 34900, interval: 3 });
  renderWith(<Row subscription={paid} />);
  expect(await screen.findByText('postq.sbp.pastDueText')).toBeTruthy();
  expect((await toggle()).getAttribute('aria-checked')).toBe('true');
});

it('profile shows the same switch for the paid subscription', async () => {
  api.sbp.mockResolvedValue({ status: 'ACTIVE', amount_kopeks: 34900, interval: 3 });
  renderWith(<AutoDebitSection />);
  expect(await screen.findByText('postq.profile.payment')).toBeTruthy();
  expect((await toggle()).getAttribute('aria-checked')).toBe('true');
});

it('profile shows nothing when SBP is off or there is only a trial', async () => {
  api.flag = false;
  renderWith(<AutoDebitSection />);
  await settle();
  expect(screen.queryByText('postq.profile.payment')).toBeNull();
  cleanup();

  api.flag = true;
  api.trial = true;
  renderWith(<AutoDebitSection />);
  await settle();
  expect(screen.queryByText('postq.profile.payment')).toBeNull();
});

it('waiting for the bank shows until when to confirm', async () => {
  api.sbp.mockResolvedValue({
    status: 'PENDING',
    redirect_url: 'https://bank/y',
    confirm_until: new Date(Date.now() + 20 * 60_000).toISOString(),
  });
  renderWith(<Row subscription={paid} />);
  expect(await screen.findByText(/postq\.sbp\.pendingUntil/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'postq.sbp.openBank' })).toBeTruthy();
});

it('after the 30 minutes it says so and no longer sends to the bank', async () => {
  api.sbp.mockResolvedValue({
    status: 'PENDING',
    redirect_url: 'https://bank/y',
    confirm_until: new Date(Date.now() - 60_000).toISOString(),
  });
  renderWith(<Row subscription={paid} />);
  expect(await screen.findByText('postq.sbp.pendingExpired')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'postq.sbp.openBank' })).toBeNull();
});
