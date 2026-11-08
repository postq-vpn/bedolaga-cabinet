import { getLocalizedApiErrorMessage } from '@/utils/api-error-display';
import { uiLocale } from '@/utils/uiLocale';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useLocation } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import type { Subscription } from '../../types';
import { SubscriptionMenu } from '@/components/postq/dashboard/SubscriptionMenu';
import { Notice, ProgressTrack, StatTile } from '@/components/postq/ui';
import { formatTrafficOf, formatTrafficWhole as formatTraffic } from '../../utils/formatTraffic';
import { subscriptionApi } from '../../api/subscription';
import { useCurrency } from '../../hooks/useCurrency';
import { useHapticFeedback } from '../../platform/hooks/useHaptic';
import { getInsufficientBalanceError } from '../../utils/subscriptionHelpers';
import { needsTariff, tariffSelectionPath } from '../../utils/legacySubscription';

interface SubscriptionCardExpiredProps {
  subscription: Subscription;
  balanceKopeks?: number;
  balanceRubles?: number;
  /** Devices still attached to the subscription (kept while it's expired). */
  connectedDevices?: number;
  className?: string;
}

export default function SubscriptionCardExpired({
  subscription,
  balanceKopeks = 0,
  balanceRubles = 0,
  connectedDevices = 0,
  className,
}: SubscriptionCardExpiredProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { formatAmount, currencySymbol } = useCurrency();
  const haptic = useHapticFeedback();

  const [isRenewing, setIsRenewing] = useState(false);
  const [renewError, setRenewError] = useState<string | null>(null);

  // Detect limited (traffic exhausted) state
  const isLimited = subscription.is_limited;

  // Detect daily subscription (disabled or expired)
  const isDaily = subscription.is_daily;
  const isDisabledDaily = subscription.status === 'disabled' && isDaily;

  /*
   * Списывать с баланса прямо из карточки можно только там, где выбирать нечего:
   * суточный тариф стоит один день, а приостановленный просто возобновляется.
   *
   * Обычной подписке период выбирает клиент. Кнопка раньше молча продлевала на
   * 30 дней — то есть решала за него и мимо скидок за длинные периоды (месяц за
   * 600 ₽ против полугода со скидкой). Хуже того, тариф вообще мог не
   * продаваться месяцем: тогда сервер отвечал «период недоступен», и кнопка
   * выглядела сломанной. Теперь она открывает выбор периода текущего тарифа.
   */
  const isInstantRenew = isDisabledDaily || (isDaily && !!subscription.tariff_id);
  // Старая подписка (куплена в классике, тарифа нет): продлевать нечего,
  // единственная кнопка ведёт на витрину тарифов с этой подпиской.
  const requiresTariff = needsTariff(subscription);

  // For daily subs, check if balance covers daily price; otherwise 100 kopeks minimum
  const dailyPrice = subscription.daily_price_kopeks ?? 0;
  const hasBalance = isDaily ? balanceKopeks >= dailyPrice && dailyPrice > 0 : balanceKopeks >= 100;

  const handleQuickRenew = async () => {
    setIsRenewing(true);
    setRenewError(null);
    haptic.buttonPressHeavy();

    try {
      if (isDisabledDaily) {
        // Resume daily subscription via toggle pause endpoint
        await subscriptionApi.togglePause(subscription.id);
      } else if (isDaily && subscription.tariff_id) {
        // Expired daily tariff — purchase for 1 day. Pass subscription.id
        // so the backend resolves the EXACT row instead of doing a
        // (user_id, tariff_id) re-lookup that races with concurrent
        // panel webhooks (would surface as "Тариф уже активен" + refund).
        await subscriptionApi.purchaseTariff(subscription.tariff_id, 1, undefined, subscription.id);
      } else {
        // Сюда кнопка не ведёт: обычной подписке период выбирает клиент. Если
        // условия показа когда-нибудь разъедутся, открываем выбор периода, а не
        // списываем месяц молча.
        navigate(`/subscription/purchase?subscriptionId=${subscription.id}`);
        return;
      }
      haptic.success();
      queryClient.invalidateQueries({
        predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === 'subscription',
      });
      queryClient.invalidateQueries({ queryKey: ['subscriptions-list'] });
      queryClient.invalidateQueries({ queryKey: ['balance'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-options'] });
    } catch (err: unknown) {
      haptic.error();
      const insufficientData = getInsufficientBalanceError(err);
      if (insufficientData) {
        setRenewError(t('dashboard.expired.insufficientFunds'));
      } else if (err instanceof AxiosError) {
        const detail = err.response?.data?.detail;
        if (typeof detail === 'string') {
          setRenewError(getLocalizedApiErrorMessage(err, t('dashboard.expired.renewError'), t));
        } else {
          setRenewError(t('dashboard.expired.renewError'));
        }
      } else {
        setRenewError(t('dashboard.expired.renewError'));
      }
    } finally {
      setIsRenewing(false);
    }
  };

  const handleTopUp = () => {
    haptic.buttonPress();
    const params = new URLSearchParams();
    params.set('returnTo', location.pathname);
    navigate(`/balance/top-up?${params.toString()}`);
  };

  const endDate = new Date(subscription.end_date).toLocaleDateString(uiLocale(), {
    day: 'numeric',
    month: 'long',
  });
  const isSuspended = subscription.status === 'disabled';
  const title = isLimited
    ? t('postq.dashboard.limitedTitle')
    : subscription.is_trial
      ? t('postq.dashboard.trialExpiredTitle')
      : isSuspended
        ? t('postq.dashboard.suspendedTitle')
        : t('postq.dashboard.expiredTitle');
  const subtitle = isLimited
    ? t('postq.dashboard.activeUntil', { date: endDate })
    : t(subscription.is_trial ? 'postq.dashboard.trialExpiredOn' : 'postq.dashboard.expiredOn', {
        date: endDate,
      });

  const deviceLimit = subscription.device_limit;
  const isUnlimitedTraffic = subscription.traffic_limit_gb === 0;

  const primary = isLimited ? (
    <Link
      to={
        requiresTariff ? tariffSelectionPath(subscription.id) : `/subscriptions/${subscription.id}`
      }
      className="rd-btn-tile rd-btn-tile--primary flex-1"
    >
      {requiresTariff ? t('subscription.cta.moveToTariff') : t('postq.dashboard.buyTraffic')}
    </Link>
  ) : subscription.is_trial ? (
    <Link to="/subscription/purchase" className="rd-btn-tile rd-btn-tile--primary flex-1">
      {t('postq.dashboard.buy')}
    </Link>
  ) : !isInstantRenew ? (
    <Link
      to={
        requiresTariff
          ? tariffSelectionPath(subscription.id)
          : `/subscription/purchase?subscriptionId=${subscription.id}`
      }
      onClick={() => haptic.buttonPressHeavy()}
      className="rd-btn-tile rd-btn-tile--primary flex-1"
    >
      {requiresTariff ? t('subscription.cta.moveToTariff') : t('postq.dashboard.resume')}
    </Link>
  ) : hasBalance ? (
    <button
      type="button"
      onClick={handleQuickRenew}
      disabled={isRenewing}
      className="rd-btn-tile rd-btn-tile--primary flex-1"
    >
      {isRenewing ? (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
          aria-hidden="true"
        />
      ) : null}
      {isRenewing ? t('common.loading') : t('postq.dashboard.resume')}
    </button>
  ) : (
    <button type="button" onClick={handleTopUp} className="rd-btn-tile rd-btn-tile--primary flex-1">
      {t('dashboard.expired.topUp')}
    </button>
  );

  return (
    <section className={`rd-card rd-card--lg flex flex-col gap-8 ${className ?? ''}`}>
      <div className="flex flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="rd-h5 text-[var(--rd-heading)]">{title}</h2>
            <p className="rd-p-md text-[var(--rd-caption)]">{subtitle}</p>
          </div>
          <SubscriptionMenu subscription={subscription} />
        </div>

        {isLimited ? (
          <Notice
            tone="warning"
            title={t('postq.dashboard.accessPaused')}
            text={t('postq.dashboard.limitedText')}
          />
        ) : subscription.is_trial ? (
          <Notice
            tone="warning"
            title={t('postq.dashboard.accessPaused')}
            text={t('postq.dashboard.buyHint')}
          />
        ) : (
          <Notice
            tone="error"
            title={t('postq.dashboard.accessPaused')}
            text={
              hasBalance || !isInstantRenew
                ? t('postq.dashboard.renewHint')
                : `${t('dashboard.expired.balance')}: ${formatAmount(balanceRubles)}\u00A0${currencySymbol}. ${t('postq.dashboard.renewHint')}`
            }
          />
        )}

        <div className="grid grid-cols-2 gap-3 sm:flex sm:gap-6">
          <StatTile
            label={t('postq.dashboard.devices')}
            aside={
              <span className="rd-p-sm text-[var(--rd-caption)]">
                {t('postq.dashboard.devicesSaved')}
              </span>
            }
            value={
              deviceLimit > 0
                ? t('postq.dashboard.devicesOf', { used: connectedDevices, limit: deviceLimit })
                : connectedDevices
            }
            footer={
              // No bar at zero: an empty track reads as noise.
              deviceLimit > 0 && connectedDevices > 0 ? (
                <ProgressTrack
                  muted
                  percent={(connectedDevices / deviceLimit) * 100}
                  label={t('postq.dashboard.devices')}
                />
              ) : null
            }
          />
          <StatTile
            label={t('postq.dashboard.traffic')}
            value={
              isLimited
                ? t(
                    'postq.dashboard.trafficOf',
                    formatTrafficOf(subscription.traffic_used_gb, subscription.traffic_limit_gb),
                  )
                : t('postq.dashboard.trafficUnavailable')
            }
            footer={
              <span className="rd-p-sm text-[var(--rd-caption)]">
                {isUnlimitedTraffic
                  ? t('postq.dashboard.trafficAfterPayment')
                  : t('postq.dashboard.trafficLimitAfterPayment', {
                      limit: formatTraffic(subscription.traffic_limit_gb),
                    })}
              </span>
            }
          />
        </div>

        {renewError && (
          <p role="alert" className="rd-p-md text-[var(--rd-error-text)]">
            {renewError}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        {/* No access, so nothing to connect — the tile stays as a hint of what
            comes back after paying (Figma «Подключение недоступно»). */}
        <button
          type="button"
          disabled
          className="rd-btn-tile rd-btn-tile--muted flex-1 !opacity-100"
        >
          {t('postq.dashboard.connectDevice')}
        </button>
        {primary}
      </div>
    </section>
  );
}
