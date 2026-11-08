// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlatformProvider } from '@/platform/PlatformProvider';
import { ToastProvider } from '@/components/Toast';
import type { Subscription } from '@/types';

/**
 * Вёрстка карточки подписки на телефоне.
 *
 * У тарифа с длинным именем («🟡 Компания - 10 устройств») плитка «Осталось»
 * уезжала за правый край карточки: у флекс-элемента без `min-w-0` минимальная
 * ширина равна ширине неразрывного текста внутри. А десять точек-индикаторов
 * съедали 124px из 272px плитки «Подключить устройство», и заголовок ломался
 * на четыре строки.
 *
 * jsdom не считает раскладку, поэтому здесь сторожатся сами признаки:
 * ограничитель ширины у обеих плиток и вид индикатора устройств.
 */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'ru', changeLanguage: () => Promise.resolve() },
  }),
  Trans: ({ children }: { children?: unknown }) => children ?? null,
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

const subscription = (overrides: Partial<Subscription> = {}): Subscription => ({
  id: 42,
  status: 'active',
  is_trial: false,
  start_date: '2026-08-07T00:00:00Z',
  end_date: '2029-08-29T00:00:00Z',
  days_left: 1085,
  hours_left: 0,
  minutes_left: 0,
  time_left_display: '',
  traffic_limit_gb: 250,
  traffic_used_gb: 22.2,
  traffic_used_percent: 9,
  device_limit: 10,
  connected_squads: [],
  servers: [],
  autopay_enabled: false,
  autopay_days_before: 3,
  subscription_url: 'https://example.com/sub/abc',
  hide_subscription_link: false,
  is_active: true,
  is_expired: false,
  is_limited: false,
  tariff_id: 7,
  tariff_name: '🟡 Компания - 10 устройств',
  ...overrides,
});

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

afterEach(cleanup);

const idleMutation = {
  mutate: () => {},
  isPending: false,
} as unknown as Parameters<
  typeof import('./SubscriptionCardActive').default
>[0]['refreshTrafficMutation'];

async function renderCard(sub: Subscription, connectedDevices = 0) {
  // The postq card itself — the switch loads its versions lazily.
  const Card = (await import('./SubscriptionCardActive.postq')).default;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(
    <QueryClientProvider client={client}>
      <PlatformProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={['/']}>
            <Card
              subscription={sub}
              trafficData={null}
              refreshTrafficMutation={idleMutation}
              trafficRefreshCooldown={0}
              connectedDevices={connectedDevices}
            />
          </MemoryRouter>
        </ToastProvider>
      </PlatformProvider>
    </QueryClientProvider>,
  );
  return container;
}

describe('плитки «Устройства» + «Трафик»', () => {
  it('обе плитки умеют сжиматься — длинное значение не выталкивает соседа', async () => {
    await renderCard(subscription());

    for (const label of ['postq.dashboard.devices', 'postq.dashboard.traffic']) {
      const tile = screen.getAllByText(label)[0].closest('.rounded-\\[var\\(--rd-radius-md\\)\\]');
      expect(tile?.className).toContain('min-w-0');
      expect(tile?.className).toContain('flex-1');
    }
  });
});

describe('индикатор устройств', () => {
  const devicesBar = () =>
    screen.getAllByRole('progressbar', { name: 'postq.dashboard.devices' })[0];

  it('показывает долю подключённых устройств', async () => {
    await renderCard(subscription({ device_limit: 5 }), 2);

    expect(devicesBar().getAttribute('aria-valuenow')).toBe('40');
  });

  it('на пределе — полная полоса', async () => {
    await renderCard(subscription({ device_limit: 10 }), 10);

    expect(devicesBar().getAttribute('aria-valuenow')).toBe('100');
  });
});
