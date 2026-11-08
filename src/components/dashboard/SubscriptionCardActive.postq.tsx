import { hasUnknownManagedTraffic } from '@/utils/trafficAccounting';
import ManagedTrafficSummary from '@/components/subscription/ManagedTrafficSummary';
import { AutopayToggle } from '@/components/subscription/manage/AutopayToggle';
import { RdIcon } from '@/components/postq/RdIcon';
import { ProgressTrack, StatTile } from '@/components/postq/ui';
import { uiLocale } from '@/utils/uiLocale';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { DevicesDialog } from '@/components/postq/dashboard/DevicesDialog';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import type { UseMutationResult } from '@tanstack/react-query';
import { useHaptic } from '@/platform';
import { formatTrafficOf } from '../../utils/formatTraffic';
import { needsTariff, tariffSelectionPath } from '../../utils/legacySubscription';
import type { Subscription } from '../../types';
import { SubscriptionMenu } from '@/components/postq/dashboard/SubscriptionMenu';

interface SubscriptionCardActiveProps {
  subscription: Subscription;
  trafficData: {
    traffic_used_gb: number;
    traffic_used_percent: number;
    is_unlimited: boolean;
    traffic_accounting_mode?: 'legacy' | 'managed';
    traffic_remaining_gb?: number | null;
    base_traffic_remaining_gb?: number | null;
    next_traffic_refresh_at?: string | null;
  } | null;
  refreshTrafficMutation: UseMutationResult<unknown, unknown, void, unknown>;
  trafficRefreshCooldown: number;
  connectedDevices: number;
  /** No device connected yet: «Подключить устройство» becomes the one accent action. */
  highlightConnect?: boolean;
}

/**
 * Active (paid or trial) subscription — postq design, Figma "Платная подписка".
 * Title with the end date, auto-renewal, devices and traffic tiles, and two
 * large actions: connect a device and renew.
 */
export default function SubscriptionCardActive({
  subscription,
  trafficData,
  connectedDevices,
  highlightConnect = false,
}: SubscriptionCardActiveProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const haptic = useHaptic();
  const [devicesOpen, setDevicesOpen] = useState(false);

  const unknownTraffic = hasUnknownManagedTraffic(subscription, trafficData);
  const usedPercent = trafficData?.traffic_used_percent ?? subscription.traffic_used_percent;
  const usedGb = trafficData?.traffic_used_gb ?? subscription.traffic_used_gb;
  const isUnlimited = trafficData?.is_unlimited ?? subscription.traffic_limit_gb === 0;

  const endDate = new Date(subscription.end_date).toLocaleDateString(uiLocale(), {
    day: 'numeric',
    month: 'long',
  });
  // Under a day the backend string reads «0 д. 23 ч.» — count it here instead.
  const msLeft = new Date(subscription.end_date).getTime() - Date.now();
  const hoursLeft = Math.floor(msLeft / 3_600_000);
  const timeLeft =
    subscription.days_left > 0
      ? t('subscription.days', { count: subscription.days_left })
      : hoursLeft >= 1
        ? t('postq.dashboard.hoursLeft', { count: hoursLeft })
        : t('postq.dashboard.minutesLeft', {
            count: Math.max(1, Math.ceil(msLeft / 60_000)),
          });

  const deviceLimit = subscription.device_limit;
  const isAtDeviceLimit = deviceLimit > 0 && connectedDevices >= deviceLimit;
  const devicePercent = deviceLimit > 0 ? (connectedDevices / deviceLimit) * 100 : 0;
  // Same rule as the expired card: an old (pre-tariff) subscription renews by
  // moving to a tariff, the rest pick a period of their current tariff.
  const renewPath = subscription.is_trial
    ? '/subscription/purchase'
    : needsTariff(subscription)
      ? tariffSelectionPath(subscription.id)
      : `/subscription/purchase?subscriptionId=${subscription.id}`;

  return (
    <section className="rd-card rd-card--lg flex flex-col gap-8">
      <div className="flex flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            {/* «Подписка активна» / «до 9 ноября»: on phones the date goes on its
                own line instead of breaking wherever the width ends. */}
            <h2 className="rd-h5 text-[var(--rd-heading)]">
              {t(
                subscription.is_trial
                  ? 'postq.dashboard.trialActiveTitle'
                  : 'postq.dashboard.activeTitle',
              )}{' '}
              <span className="block whitespace-nowrap sm:inline">
                {t('postq.dashboard.untilDate', { date: endDate })}
              </span>
            </h2>
            <p className="rd-p-md text-[var(--rd-caption)]">
              {t('postq.dashboard.expiresIn', { time: timeLeft })}
            </p>
          </div>
          <SubscriptionMenu subscription={subscription} />
        </div>

        <AutopayToggle
          subscription={subscription}
          subscriptionId={subscription.id}
          accentColor=""
          offColor=""
          variant="postq"
        />

        <div className="grid grid-cols-2 gap-3 sm:flex sm:gap-6">
          <StatTile
            label={t('postq.dashboard.devices')}
            onClick={() => setDevicesOpen(true)}
            aside={
              <span className="rd-p-sm rd-link-action hidden sm:inline">
                {t('postq.dashboard.devicesChange')}
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
                <ProgressTrack percent={devicePercent} label={t('postq.dashboard.devices')} />
              ) : null
            }
          />
          <StatTile
            label={t('postq.dashboard.traffic')}
            value={
              unknownTraffic
                ? '—'
                : isUnlimited
                  ? t('postq.dashboard.trafficUnlimited')
                  : t(
                      'postq.dashboard.trafficOf',
                      formatTrafficOf(usedGb, subscription.traffic_limit_gb),
                    )
            }
            footer={
              unknownTraffic ? null : isUnlimited ? (
                <div className="flex justify-end">
                  <RdIcon
                    name="cabinet/infinity"
                    width={18}
                    height={10}
                    className="text-[var(--rd-action)]"
                  />
                </div>
              ) : (
                <ProgressTrack percent={usedPercent} label={t('postq.dashboard.traffic')} />
              )
            }
          />
        </div>

        <ManagedTrafficSummary subscription={subscription} refreshed={trafficData} />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        {subscription.subscription_url && (
          <button
            type="button"
            data-onboarding="connect-devices"
            disabled={isAtDeviceLimit}
            onClick={() => {
              haptic.impact('light');
              navigate(`/connection?sub=${subscription.id}`);
            }}
            className={cn('rd-btn-tile flex-1', highlightConnect && 'rd-btn-tile--primary')}
          >
            {t('postq.dashboard.connectDevice')}
          </button>
        )}
        {!subscription.is_daily && (
          <Link to={renewPath} className="rd-btn-tile flex-1">
            {t(subscription.is_trial ? 'postq.dashboard.buy' : 'postq.dashboard.renew')}
          </Link>
        )}
      </div>
      <DevicesDialog
        open={devicesOpen}
        onOpenChange={setDevicesOpen}
        subscriptionId={subscription.id}
      />
    </section>
  );
}
