/**
 * Global success notification modal: balance top-ups, subscription and add-on
 * purchases. Postq dialog — flat card, plain rows, one primary action.
 */

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { uiLocale } from '@/utils/uiLocale';
import { formatDateOrRaw } from '@/utils/format';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useSuccessNotification } from '../store/successNotification';
import { useCurrency } from '../hooks/useCurrency';
import { useHaptic } from '@/platform';
import { RdIcon } from '@/components/postq/RdIcon';

export default function SuccessNotificationModal() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isOpen = useSuccessNotification((state) => state.isOpen);
  const data = useSuccessNotification((state) => state.data);
  const hide = useSuccessNotification((state) => state.hide);
  const { formatAmount, currencySymbol } = useCurrency();
  const haptic = useHaptic();
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) haptic.notification('success');
  }, [isOpen, haptic]);

  if (!data) return null;

  // Whole roubles without «,00»; kopeks only when there are any.
  const money = (kopeks: number) =>
    `${formatAmount(kopeks / 100, kopeks % 100 === 0 ? 0 : 2)}\u00A0${currencySymbol}`;
  const gb = t('common.units.gb', 'GB');

  const isBalanceTopup = data.type === 'balance_topup';

  const defaultTitles: Record<typeof data.type, string> = {
    balance_topup: t('successNotification.balanceTopup.title', 'Balance topped up!'),
    subscription_activated: t(
      'successNotification.subscriptionActivated.title',
      'Subscription activated!',
    ),
    subscription_renewed: t(
      'successNotification.subscriptionRenewed.title',
      'Subscription renewed!',
    ),
    subscription_purchased: t(
      'successNotification.subscriptionPurchased.title',
      'Subscription purchased!',
    ),
    devices_purchased: t('successNotification.devicesPurchased.title', 'Devices added!'),
    traffic_purchased: t('successNotification.trafficPurchased.title', 'Traffic added!'),
  };
  const title = data.title || defaultTitles[data.type];

  const expiry = formatDateOrRaw(data.expiresAt, uiLocale(), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // Label → value rows, in reading order. A top-up leads with the amount instead.
  const rows: [string, string][] = [];
  if (data.devicesAdded) {
    rows.push([t('successNotification.devicesAdded', 'Devices added'), `+${data.devicesAdded}`]);
  }
  if (data.newDeviceLimit) {
    rows.push([
      t('successNotification.totalDevices', 'Total devices'),
      String(data.newDeviceLimit),
    ]);
  }
  if (data.trafficGbAdded) {
    rows.push([
      t('successNotification.trafficAdded', 'Traffic added'),
      `+${data.trafficGbAdded} ${gb}`,
    ]);
  }
  if (data.newTrafficLimitGb) {
    rows.push([
      t('successNotification.totalTraffic', 'Total traffic'),
      `${data.newTrafficLimitGb} ${gb}`,
    ]);
  }
  if (data.tariffName) rows.push([t('successNotification.tariff', 'Tariff'), data.tariffName]);
  if (expiry) rows.push([t('successNotification.validUntil', 'Valid until'), expiry]);
  if (isBalanceTopup && data.newBalanceKopeks !== undefined) {
    rows.push([t('successNotification.newBalance', 'New balance'), money(data.newBalanceKopeks)]);
  }
  if (!isBalanceTopup && data.amountKopeks) {
    rows.push([t('successNotification.price', 'Price'), money(data.amountKopeks)]);
  }

  const action = isBalanceTopup
    ? { label: t('successNotification.goToBalance', 'Go to Balance'), to: '/balance' }
    : {
        label: t('successNotification.goToSubscription', 'Go to Subscription'),
        to: '/subscriptions',
      };

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => !open && hide()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          // Focus the card itself: a ring on the close or main button read as a stray accent.
          // Tab still walks the buttons, and the focus stays trapped in the dialog.
          ref={contentRef}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            contentRef.current?.focus({ preventScroll: true });
          }}
          className="fixed left-1/2 top-1/2 z-[100] flex max-h-[88vh] w-[calc(100%-32px)] max-w-[400px] -translate-x-1/2 -translate-y-1/2 flex-col gap-6 overflow-y-auto rounded-[var(--rd-radius-md)] bg-[var(--rd-surface)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.18)] focus:outline-none data-[state=open]:animate-fade-in"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-2">
              <DialogPrimitive.Title className="rd-h6 text-[var(--rd-heading)]">
                {title}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description
                className={data.message ? 'rd-p-md text-[var(--rd-caption)]' : 'sr-only'}
              >
                {data.message ?? title}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              aria-label={t('common.close')}
              className="-mr-2 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--rd-caption)] transition-colors hover:bg-[var(--rd-icon-btn)] hover:text-[var(--rd-heading)]"
            >
              <RdIcon name="cabinet/x" size={16} />
            </DialogPrimitive.Close>
          </div>

          {isBalanceTopup && data.amountKopeks ? (
            <div className="flex flex-col gap-1">
              <span className="rd-p-md text-[var(--rd-caption)]">
                {t('successNotification.amount', 'Amount')}
              </span>
              <span className="rd-h4 text-[var(--rd-heading)]">+{money(data.amountKopeks)}</span>
            </div>
          ) : null}

          {rows.length > 0 && (
            <dl className="flex flex-col divide-y divide-[var(--rd-divider)]">
              {rows.map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-baseline justify-between gap-4 py-3 first:pt-0 last:pb-0"
                >
                  <dt className="rd-p-md shrink-0 text-[var(--rd-caption)]">{label}</dt>
                  <dd className="rd-p-md min-w-0 truncate text-right font-medium text-[var(--rd-heading)]">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          )}

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => {
                hide();
                navigate(action.to);
              }}
              className="rd-btn w-full"
            >
              {action.label}
            </button>
            <DialogPrimitive.Close className="rd-btn-soft w-full !rounded-[16px] !bg-[var(--rd-field)] !text-[var(--rd-heading)] hover:!bg-[var(--rd-chip-hover)]">
              {t('common.close', 'Close')}
            </DialogPrimitive.Close>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
