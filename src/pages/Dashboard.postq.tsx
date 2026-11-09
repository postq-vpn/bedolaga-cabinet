import { useHaptic } from '@/platform';
import { getLocalizedApiErrorMessage } from '../utils/api-error-display';
import { useState, useEffect, useMemo, useRef } from 'react';
import { fireConfetti } from '@/components/postq/confetti';
import { useQueries, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/auth';
import { useBlockingStore } from '../store/blocking';
import Onboarding, { useOnboarding } from '../components/Onboarding';
import { subscriptionApi } from '../api/subscription';
import { referralApi } from '../api/referral';
import { balanceApi } from '../api/balance';
import SubscriptionCardActive from '../components/dashboard/SubscriptionCardActive';
import SubscriptionCardExpired from '../components/dashboard/SubscriptionCardExpired';
import { hasLegacySubscription } from '../utils/legacySubscription';
import TrialOfferCard from '../components/dashboard/TrialOfferCard';
import { giftApi } from '../api/gift';
import PendingGiftCard from '../components/dashboard/PendingGiftCard';
import SubscriptionListCard from '../components/subscription/SubscriptionListCard';
import { DeviceLimitSheet } from '../components/subscription/DeviceLimitSheet';
import { API } from '../config/constants';
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton';
import { safeLocal } from '../utils/safeStorage';
import { useFeatureFlags } from '../hooks/useFeatureFlags';
import { BalanceCard } from '../components/postq/dashboard/BalanceCard';
import { GiftBanner } from '../components/postq/dashboard/GiftBanner';
import { ReferralCard } from '../components/postq/dashboard/ReferralCard';
import { useDashboardAccent } from '@/components/postq/dashboardAccent';

export default function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const refreshUser = useAuthStore((state) => state.refreshUser);
  const queryClient = useQueryClient();
  const haptic = useHaptic();
  const { isCompleted: isOnboardingCompleted, complete: completeOnboarding } = useOnboarding();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const blockingType = useBlockingStore((state) => state.blockingType);
  const [trialError, setTrialError] = useState<string | null>(null);

  // Refresh user data on mount
  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  // Fetch balance from API
  const { data: balanceData } = useQuery({
    queryKey: ['balance'],
    queryFn: balanceApi.getBalance,
    staleTime: API.BALANCE_STALE_TIME_MS,
    refetchOnMount: 'always',
  });

  // Multi-tariff: check if user has multiple subscriptions
  const { data: multiSubData } = useQuery({
    queryKey: ['subscriptions-list'],
    queryFn: () => subscriptionApi.getSubscriptions(),
    staleTime: 60_000,
  });
  const isMultiTariff = multiSubData?.multi_tariff_enabled ?? false;

  const { data: subscriptionResponse, isLoading: subLoading } = useQuery({
    queryKey: ['subscription'],
    queryFn: () => subscriptionApi.getSubscription(),
    retry: false,
    staleTime: API.BALANCE_STALE_TIME_MS,
    refetchOnMount: 'always',
    enabled: !isMultiTariff,
  });

  const subscription = subscriptionResponse?.subscription ?? null;

  const { data: trialInfo, isLoading: trialLoading } = useQuery({
    queryKey: ['trial-info'],
    queryFn: () => subscriptionApi.getTrialInfo(),
    enabled: !subscription && !subLoading,
  });

  const { data: devicesData } = useQuery({
    queryKey: ['devices'],
    queryFn: () => subscriptionApi.getDevices(),
    enabled: !!subscription && !isMultiTariff,
    staleTime: API.BALANCE_STALE_TIME_MS,
  });

  // Плитка «Подключить устройство» на главной живёт в МУЛЬТИТАРИФНОЙ ветке, а
  // запрос выше там выключен: он привязан к одиночной подписке (`subscription`
  // в мультитарифе всегда null). Без отдельного запроса счётчик плитки всегда
  // показывал бы «0 из N», а лимит устройств не срабатывал бы никогда — то
  // есть ровно то, ради чего плитку и добавили, не работало бы.
  // Ключ ['devices', id] — тот же, что на странице подписки, так что кэш общий.
  // Карточки подписок на главной показывают, сколько устройств подключено, и
  // дают подключить ещё. Число устройств живёт в панели, поэтому запрос идёт
  // на каждую показанную подписку; ключ ['devices', id] тот же, что на
  // странице подписки, так что кэш общий и переход туда не стоит сети.
  // Only the multi-tariff branch shows these cards; a single subscription
  // already has its ['devices'] query above — don't fetch the same twice.
  const visibleSubscriptions = useMemo(
    () => (isMultiTariff ? (multiSubData?.subscriptions?.slice(0, 3) ?? []) : []),
    [isMultiTariff, multiSubData],
  );

  const deviceQueries = useQueries({
    queries: visibleSubscriptions.map((sub) => ({
      queryKey: ['devices', sub.id],
      queryFn: () => subscriptionApi.getDevices(sub.id),
      staleTime: API.BALANCE_STALE_TIME_MS,
    })),
  });

  // Подписка, у которой разбираем исчерпанный лимит устройств.
  const [deviceLimitSubId, setDeviceLimitSubId] = useState<number | null>(null);
  const deviceLimitSub = visibleSubscriptions.find((s) => s.id === deviceLimitSubId) ?? null;
  const deviceLimitDevices =
    deviceQueries[visibleSubscriptions.findIndex((s) => s.id === deviceLimitSubId)]?.data;

  const { data: referralInfo, isLoading: refLoading } = useQuery({
    queryKey: ['referral-info'],
    queryFn: referralApi.getReferralInfo,
  });

  const { data: pendingGifts } = useQuery({
    queryKey: ['pending-gifts'],
    queryFn: giftApi.getPendingGifts,
    staleTime: 30_000,
    retry: false,
  });

  const activateTrialMutation = useMutation({
    mutationFn: () => subscriptionApi.activateTrial(),
    onSuccess: () => {
      setTrialError(null);
      // Celebrate the first subscription, Telegram-style.
      fireConfetti();
      haptic.notification('success');
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
      queryClient.invalidateQueries({ queryKey: ['subscriptions-list'] });
      queryClient.invalidateQueries({ queryKey: ['trial-info'] });
      queryClient.invalidateQueries({ queryKey: ['balance'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-options'] });
      refreshUser();
    },
    onError: (error: unknown) => {
      setTrialError(getLocalizedApiErrorMessage(error, t('common.error'), t));
    },
  });

  // Traffic refresh state and mutation
  const [trafficRefreshCooldown, setTrafficRefreshCooldown] = useState(0);
  const [trafficData, setTrafficData] = useState<{
    traffic_used_gb: number;
    traffic_used_percent: number;
    is_unlimited: boolean;
    traffic_accounting_mode?: 'legacy' | 'managed';
    traffic_remaining_gb?: number | null;
    base_traffic_remaining_gb?: number | null;
    next_traffic_refresh_at?: string | null;
  } | null>(null);

  const refreshTrafficMutation = useMutation({
    mutationFn: () => subscriptionApi.refreshTraffic(subscription?.id),
    onSuccess: (data) => {
      setTrafficData({
        traffic_used_gb: data.traffic_used_gb,
        traffic_used_percent: data.traffic_used_percent,
        is_unlimited: data.is_unlimited,
        traffic_accounting_mode: data.traffic_accounting_mode,
        traffic_remaining_gb: data.traffic_remaining_gb,
        base_traffic_remaining_gb: data.base_traffic_remaining_gb,
        next_traffic_refresh_at: data.next_traffic_refresh_at,
      });
      safeLocal.setItem(
        `traffic_refresh_ts_${subscription?.id ?? 'default'}`,
        Date.now().toString(),
      );
      if (data.rate_limited && data.retry_after_seconds) {
        setTrafficRefreshCooldown(data.retry_after_seconds);
      } else {
        setTrafficRefreshCooldown(30);
      }
      queryClient.invalidateQueries({ queryKey: ['subscription', subscription?.id] });
    },
    onError: (error: {
      response?: { status?: number; headers?: { get?: (key: string) => string } };
    }) => {
      if (error.response?.status === 429) {
        const retryAfter = error.response.headers?.get?.('Retry-After');
        setTrafficRefreshCooldown(retryAfter ? parseInt(retryAfter, 10) : 30);
      }
    },
  });

  // Cooldown timer
  useEffect(() => {
    if (trafficRefreshCooldown <= 0) return;
    const timer = setInterval(() => {
      setTrafficRefreshCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [trafficRefreshCooldown]);

  // Auto-refresh traffic on mount (with 30s caching)
  const hasAutoRefreshed = useRef(false);

  useEffect(() => {
    if (!subscription) return;
    if (hasAutoRefreshed.current) return;
    hasAutoRefreshed.current = true;

    const lastRefresh = safeLocal.getItem(`traffic_refresh_ts_${subscription?.id ?? 'default'}`);
    const now = Date.now();
    const cacheMs = API.TRAFFIC_CACHE_MS;

    if (lastRefresh && now - parseInt(lastRefresh, 10) < cacheMs) {
      const elapsed = now - parseInt(lastRefresh, 10);
      const remaining = Math.ceil((cacheMs - elapsed) / 1000);
      if (remaining > 0) {
        setTrafficRefreshCooldown(remaining);
      }
      return;
    }

    refreshTrafficMutation.mutate();
  }, [subscription, refreshTrafficMutation]);

  // В multi-tariff /cabinet/subscription отключён, поэтому subscriptionResponse=undefined.
  // Используем список из /cabinet/subscriptions/list — пустой массив означает «нет подписок»,
  // и тогда показываем TrialOfferCard. Без этой ветки multi-tariff юзер никогда не видел триал.
  const hasNoSubscription = isMultiTariff
    ? multiSubData !== undefined && (multiSubData.subscriptions?.length ?? 0) === 0
    : subscriptionResponse?.has_subscription === false && !subLoading;

  // Есть ли НАСТОЯЩАЯ (платная, не триал) живая подписка — от этого зависит CTA:
  // «+ Купить ещё» только при наличии платной; иначе явная «Посмотреть тарифы».
  const hasActivePaid = (multiSubData?.subscriptions ?? []).some(
    (s) => !s.is_trial && (s.status === 'active' || s.status === 'limited'),
  );
  // Старая подписка (без тарифа при включённых тарифах) в списке: «купить ещё»
  // не предлагаем, её карточка ведёт на переход на тариф.
  const hasLegacy = hasLegacySubscription(multiSubData?.subscriptions);

  // Show onboarding for new users after data loads
  useEffect(() => {
    if (!isOnboardingCompleted && !subLoading && !refLoading && !blockingType) {
      const timer = setTimeout(() => setShowOnboarding(true), 500);
      return () => clearTimeout(timer);
    }
  }, [isOnboardingCompleted, subLoading, refLoading, blockingType]);

  const onboardingSteps = useMemo(() => {
    type Placement = 'top' | 'bottom' | 'left' | 'right';
    const steps: Array<{
      target: string;
      title: string;
      description: string;
      placement: Placement;
    }> = [
      {
        target: 'balance',
        title: t('onboarding.steps.balance.title'),
        description: t('onboarding.steps.balance.description'),
        placement: 'bottom',
      },
    ];

    if (subscription?.subscription_url) {
      steps.unshift({
        target: 'connect-devices',
        title: t('onboarding.steps.connectDevices.title'),
        description: t('onboarding.steps.connectDevices.description'),
        placement: 'bottom',
      });
    }

    return steps;
  }, [t, subscription]);

  const handleOnboardingComplete = () => {
    completeOnboarding();
    setShowOnboarding(false);
  };

  const { giftEnabled, referralEnabled } = useFeatureFlags();
  const showTrialOffer = hasNoSubscription && !trialLoading && !!trialInfo?.is_available;

  // Subscription (paid or trial) is live but nothing is connected yet: the
  // only accent action on the page is «Подключить устройство». Waits for the
  // device list so the buttons don't flip while it loads.
  const needsFirstDevice =
    !!subscription &&
    !subscription.is_expired &&
    subscription.status !== 'disabled' &&
    !subscription.is_limited &&
    devicesData?.total === 0;

  const softTopUp = showTrialOffer || needsFirstDevice;
  const setSoftTopUp = useDashboardAccent((st) => st.setSoftTopUp);
  useEffect(() => {
    setSoftTopUp(softTopUp);
    return () => setSoftTopUp(false);
  }, [softTopUp, setSoftTopUp]);

  let subscriptionBlock: React.ReactNode = null;
  if (isMultiTariff) {
    // Multi-tariff: the subscriptions list (max 3) — only when there are any;
    // the empty case falls through to the trial / purchase block below.
    if (multiSubData?.subscriptions && multiSubData.subscriptions.length > 0) {
      subscriptionBlock = (
        <section className="rd-card rd-card--lg flex flex-col gap-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="rd-h5 text-[var(--rd-heading)]">{t('postq.dashboard.subscriptions')}</h2>
            <Link to="/subscriptions" className="rd-p-md rd-link-action">
              {t('postq.dashboard.manageAll')}
            </Link>
          </div>
          <div className="flex flex-col gap-3">
            {visibleSubscriptions.map((sub, index) => (
              <SubscriptionListCard
                key={sub.id}
                subscription={sub}
                onClick={() => navigate(`/subscriptions/${sub.id}`)}
                connect={{
                  connectedDevices: deviceQueries[index]?.data?.total,
                  onConnect: () => navigate(`/connection?sub=${sub.id}`),
                  onManage: () => setDeviceLimitSubId(sub.id),
                }}
              />
            ))}
          </div>
          {multiSubData.subscriptions.length > 3 && (
            <Link to="/subscriptions" className="rd-p-md rd-link self-center">
              {t('dashboard.showAll', 'Показать все')} ({multiSubData.subscriptions.length})
            </Link>
          )}
          {!hasLegacy && (
            <Link
              to="/subscription/purchase"
              className={hasActivePaid ? 'rd-btn-tile' : 'rd-btn-tile rd-btn-tile--primary'}
            >
              {hasActivePaid
                ? t('subscriptions.buyAnother', 'Купить ещё тариф')
                : t('subscriptions.browsePlans', 'Посмотреть тарифы и купить подписку')}
            </Link>
          )}
        </section>
      );
    }
  } else if (subLoading) {
    subscriptionBlock = (
      <SkeletonGroup className="rd-card rd-card--lg flex flex-col gap-6">
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-[76px] w-full rounded-[24px]" />
        <div className="flex gap-6">
          <Skeleton className="h-[124px] flex-1 rounded-[24px]" />
          <Skeleton className="h-[124px] flex-1 rounded-[24px]" />
        </div>
        <Skeleton className="h-[72px] w-full rounded-[20px]" />
      </SkeletonGroup>
    );
  } else if (
    subscription?.is_expired ||
    subscription?.status === 'disabled' ||
    subscription?.is_limited
  ) {
    subscriptionBlock = (
      <SubscriptionCardExpired
        subscription={subscription}
        balanceKopeks={balanceData?.balance_kopeks ?? 0}
        balanceRubles={balanceData?.balance_rubles ?? 0}
        connectedDevices={devicesData?.total ?? 0}
      />
    );
  } else if (subscription) {
    subscriptionBlock = (
      <SubscriptionCardActive
        subscription={subscription}
        trafficData={trafficData}
        refreshTrafficMutation={refreshTrafficMutation}
        trafficRefreshCooldown={trafficRefreshCooldown}
        connectedDevices={devicesData?.total ?? 0}
        highlightConnect={needsFirstDevice}
      />
    );
  }

  // Нет подписок: триал (если доступен) со своей кнопкой покупки, иначе — одна
  // явная карточка покупки. Кнопка покупки есть всегда (Telegram-баг #605056).
  const noSubscriptionBlock =
    hasNoSubscription && !trialLoading ? (
      showTrialOffer && trialInfo ? (
        <TrialOfferCard
          trialInfo={trialInfo}
          balanceKopeks={balanceData?.balance_kopeks || 0}
          balanceRubles={balanceData?.balance_rubles || 0}
          activateTrialMutation={activateTrialMutation}
          trialError={trialError}
        />
      ) : (
        <section className="rd-card rd-card--lg flex flex-col gap-8">
          <div className="flex flex-col gap-1">
            <h2 className="rd-h5 text-[var(--rd-heading)]">
              {t('postq.dashboard.noSubscriptionTitle')}
            </h2>
            <p className="rd-p-md text-[var(--rd-caption)]">
              {t('postq.dashboard.noSubscriptionText')}
            </p>
          </div>
          <Link to="/subscription/purchase" className="rd-btn-tile rd-btn-tile--primary">
            {t('postq.dashboard.buy')}
          </Link>
        </section>
      )
    ) : null;

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <h1 className="sr-only">{t('nav.dashboard')}</h1>

      {pendingGifts && pendingGifts.length > 0 && <PendingGiftCard gifts={pendingGifts} />}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Phones show the balance in the header instead (MobileHeader). */}
        <aside className="hidden flex-col gap-6 lg:flex lg:w-[400px] lg:shrink-0">
          <BalanceCard
            balanceRubles={balanceData?.balance_rubles}
            softTopUp={showTrialOffer || needsFirstDevice}
          />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-6 lg:gap-8">
          {subscriptionBlock}
          {noSubscriptionBlock}
          {giftEnabled && <GiftBanner />}
          {referralEnabled && referralInfo && <ReferralCard info={referralInfo} />}
        </div>
      </div>

      {showOnboarding && (
        <Onboarding
          steps={onboardingSteps}
          onComplete={handleOnboardingComplete}
          onSkip={handleOnboardingComplete}
        />
      )}

      {deviceLimitSub && (
        <DeviceLimitSheet
          isOpen
          onClose={() => setDeviceLimitSubId(null)}
          subscriptionId={deviceLimitSub.id}
          subscriptionName={deviceLimitSub.tariff_name || t('subscription.defaultName', 'Подписка')}
          deviceLimit={deviceLimitSub.device_limit}
          isTrial={deviceLimitSub.is_trial}
          devices={deviceLimitDevices?.devices ?? []}
          onOpenSubscription={() => {
            setDeviceLimitSubId(null);
            navigate(`/subscriptions/${deviceLimitSub.id}`);
          }}
        />
      )}
    </div>
  );
}
