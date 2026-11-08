import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { subscriptionApi } from '@/api/subscription';
import { useCurrency } from '@/hooks/useCurrency';
import { useAuthStore } from '@/store/auth';
import { getErrorMessage } from '@/utils/subscriptionHelpers';
import { pickBestValue } from '@/utils/bestValue';
import { cn } from '@/lib/utils';
import type { Tariff, TariffPeriod } from '@/types';
import { RdIcon } from '../RdIcon';
import { TopUpDialog } from '../payment/TopUpDialog';
import { savePendingPurchase } from './pendingPurchase';

type Step = 1 | 2 | 3;

function newCheckoutId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Subscription purchase in three steps (Figma «Срок подписки», «Устройства»,
 * «Подтверждение покупки»). postq sells one paid tariff with unlimited
 * traffic, so there is no tariff picker, daily plans, custom days or traffic.
 * Prices come from the server quote (previewTariffPurchase); the purchase
 * reuses the checkout id across retries like TariffPurchaseForm.
 */
export function PurchaseWizard({
  tariff,
  subscriptionId,
}: {
  tariff: Tariff;
  subscriptionId?: number;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);
  const { formatAmount, currencySymbol } = useCurrency();
  const money = (kopeks: number) => `${formatAmount(kopeks / 100)} ${currencySymbol}`;
  // Compact rows on phones: whole rubles without «,00».
  const moneyShort = (kopeks: number) =>
    `${formatAmount(kopeks / 100, kopeks % 100 === 0 ? 0 : 2)} ${currencySymbol}`;

  const [step, setStep] = useState<Step>(1);
  const [period, setPeriod] = useState<TariffPeriod | null>(
    pickBestValue(tariff.periods) || tariff.periods[0] || null,
  );
  const [devices, setDevices] = useState<number | undefined>();
  const days = period?.days ?? 30;

  const quoteQuery = useQuery({
    queryKey: ['tariff-device-quote', userId, tariff.id, subscriptionId, days, undefined, devices],
    queryFn: () =>
      subscriptionApi.previewTariffPurchase({
        tariff_id: tariff.id,
        period_days: days,
        subscription_id: subscriptionId,
        selected_device_limit: devices,
      }),
    enabled: Boolean(period),
    retry: false,
    staleTime: 0,
    placeholderData: (prev) => prev,
  });
  const quote = quoteQuery.data;
  const selection = quote?.device_selection;
  useEffect(() => {
    if (selection && devices === undefined && !quoteQuery.isPlaceholderData) {
      setDevices(selection.effective_limit);
    }
  }, [selection, devices, quoteQuery.isPlaceholderData]);

  const included = selection?.included_limit ?? tariff.base_device_limit ?? tariff.device_limit;
  const deviceCount = devices ?? selection?.effective_limit ?? included;
  const minDevices = selection?.min_limit ?? included;
  const maxDevices = selection?.max_limit ?? deviceCount;
  const extraDevicePrice = tariff.device_price_kopeks ?? 0;
  const quoteReady = Boolean(quote) && !quoteQuery.isFetching && !quoteQuery.isPlaceholderData;

  // Totals: the quote once it's here, the period's own prices before that.
  const total = quote?.total_kopeks ?? period?.price_kopeks ?? 0;
  const discount = quote?.discount_kopeks ?? period?.discount_amount_kopeks ?? 0;
  const original = discount > 0 ? total + discount : null;
  const discountPercent =
    period?.discount_percent ?? (original ? Math.round((discount / original) * 100) : 0);
  const missing = quote?.missing_kopeks ?? 0;
  // Confirmation: the balance goes toward the price, the total is what's left
  // to pay (or nothing, when the balance covers it).
  const fromBalance = step === 3 && quoteReady ? Math.max(0, total - missing) : 0;
  const payNow = fromBalance > 0 ? missing : total;
  const devicesCost = quote?.devices_cost_kopeks ?? 0;

  const attempt = useRef<{ signature: string; id: string } | null>(null);
  const checkoutIdFor = (signature: string) => {
    if (attempt.current?.signature !== signature) {
      attempt.current = { signature, id: newCheckoutId() };
    }
    return attempt.current.id;
  };
  const [topUpOpen, setTopUpOpen] = useState(false);
  // Leaving to pay: remember the purchase so it's issued when the money lands.
  const rememberPurchase = () =>
    savePendingPurchase({
      tariffId: tariff.id,
      days,
      devices: selection?.selectable ? deviceCount : undefined,
      subscriptionId,
      checkoutId: checkoutIdFor(JSON.stringify([tariff.id, days, subscriptionId, deviceCount])),
      totalKopeks: total,
      createdAt: Date.now(),
    });
  const purchase = useMutation({
    mutationFn: async () => {
      if (!quote || !quoteReady) throw new Error(t('subscription.purchaseDevices.waitForPrice'));
      if (Date.parse(quote.expires_at) <= Date.now()) {
        await quoteQuery.refetch();
        throw new Error(t('subscription.purchaseDevices.reviewPrice'));
      }
      const signature = JSON.stringify([tariff.id, days, subscriptionId, deviceCount]);
      const checkoutId = checkoutIdFor(signature);
      return subscriptionApi.purchaseTariff(
        tariff.id,
        days,
        undefined,
        subscriptionId,
        checkoutId,
        selection?.selectable
          ? { selected_device_limit: deviceCount, quote_id: quote.quote_id }
          : undefined,
      );
    },
    onSuccess: () => {
      for (const key of ['subscription', 'purchase-options', 'subscriptions-list', 'balance']) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      navigate('/', { replace: true });
    },
    onError: () => {
      quoteQuery.refetch();
    },
  });

  const stepTitles = [
    t('postq.purchase.step1'),
    t('postq.purchase.step2'),
    t('postq.purchase.step3'),
  ];
  const headings: Record<Step, [string, string]> = {
    1: [t('postq.purchase.step1'), t('postq.purchase.step1Text')],
    2: [t('postq.purchase.step2'), t('postq.purchase.step2Text')],
    3: [t('postq.purchase.step3'), t('postq.purchase.step3Text')],
  };
  const devicesLabel =
    deviceCount <= included
      ? t('postq.purchase.devicesFree', { count: deviceCount })
      : t('postq.purchase.devicesPaid', { count: deviceCount });

  // The step's main action. `compact` is the phone bar's version: a short label
  // next to the total, so it fits a 320px screen.
  const cta = (compact: boolean) => {
    const btnClass = compact
      ? 'rd-btn shrink-0 !px-6'
      : 'rd-btn !min-h-16 w-full !rounded-[var(--rd-radius-control)]';
    return step < 3 ? (
      <button
        type="button"
        className={btnClass}
        disabled={!period}
        onClick={() => setStep((s) => (s + 1) as Step)}
      >
        {compact
          ? t('common.next')
          : step === 1
            ? t('postq.purchase.nextDevices')
            : t('postq.purchase.nextConfirm')}
      </button>
    ) : missing > 0 ? (
      <button
        type="button"
        onClick={() => setTopUpOpen(true)}
        disabled={!quoteReady}
        className={btnClass}
      >
        {compact
          ? t('postq.dashboard.topUp')
          : t('postq.devices.topUp', { amount: money(missing) })}
      </button>
    ) : (
      <button
        type="button"
        className={btnClass}
        disabled={!quoteReady || purchase.isPending}
        onClick={() => purchase.mutate()}
      >
        {purchase.isPending
          ? t('common.loading')
          : compact
            ? t('postq.purchase.payShort')
            : t('postq.purchase.pay', { amount: money(total) })}
      </button>
    );
  };

  const discountBadge = (selected: boolean) =>
    cn(
      'rd-p-md shrink-0 rounded-[12px] px-3 py-2 font-medium',
      selected
        ? 'bg-[var(--rd-help)] text-[var(--rd-action)]'
        : 'bg-[var(--rd-surface)] text-[var(--rd-body)]',
    );

  const summary = (
    // Phones: the bottom bar already carries the total and the action, and the
    // step itself shows the choice — the card would only repeat them.
    <aside className="rd-card rd-card--lg hidden flex-col gap-6 lg:sticky lg:flex lg:top-[138px] lg:w-[440px] lg:shrink-0">
      <h2 className="rd-h6 text-[var(--rd-heading)]">
        {step === 3 ? t('postq.purchase.toPay') : t('postq.purchase.yourChoice')}
      </h2>
      {/* Step 3 lists the period and devices right next to it. */}
      {step !== 3 && (
        <dl className="rd-p-md flex flex-col gap-4">
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--rd-caption)]">{t('postq.purchase.period')}</dt>
            <dd className="text-[var(--rd-body)]">{period?.label}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--rd-caption)]">{t('postq.purchase.devices')}</dt>
            <dd className="text-[var(--rd-body)]">{devicesLabel}</dd>
          </div>
        </dl>
      )}
      {fromBalance > 0 && (
        <dl className="rd-p-md flex flex-col gap-4">
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--rd-caption)]">{t('postq.purchase.subscriptionPrice')}</dt>
            <dd className="text-[var(--rd-body)]">{money(total)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--rd-caption)]">{t('postq.purchase.fromBalance')}</dt>
            <dd className="text-[var(--rd-body)]">−{money(fromBalance)}</dd>
          </div>
        </dl>
      )}
      <div className="h-px w-full bg-[var(--rd-border)]" />
      <div className="flex flex-col gap-2">
        {original && fromBalance === 0 && (
          <s className="rd-p-md font-medium text-[var(--rd-caption)]">{money(original)}</s>
        )}
        <span
          className={cn('rd-h4 text-[var(--rd-heading)]', !quoteReady && quote && 'opacity-60')}
        >
          {money(payNow)}
        </span>
        {fromBalance > 0 && missing === 0 ? (
          <span className="rd-p-md text-[var(--rd-caption)]">
            {t('postq.purchase.paidFromBalance')}
          </span>
        ) : (
          discount > 0 && (
            <span className="rd-p-md text-[var(--rd-success-text)]">
              {t('postq.purchase.savings', {
                amount: money(discount),
                percent: discountPercent,
              })}
            </span>
          )
        )}
      </div>
      {purchase.isError && (
        <p role="alert" className="rd-p-sm text-[var(--rd-error-text)]">
          {getErrorMessage(purchase.error, t)}
        </p>
      )}

      <div className="hidden lg:block">{cta(false)}</div>
    </aside>
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="rd-p-md flex items-center justify-between gap-4 font-medium text-[var(--rd-caption)]">
        {step === 1 ? (
          <Link
            to="/"
            className="flex items-center gap-2 transition-colors hover:text-[var(--rd-heading)]"
          >
            <RdIcon name="arrow-right" size={20} className="rotate-180" />
            {t('postq.purchase.toCabinet')}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => setStep((s) => (s - 1) as Step)}
            className="flex items-center gap-2 transition-colors hover:text-[var(--rd-heading)]"
          >
            <RdIcon name="arrow-right" size={20} className="rotate-180" />
            {t('common.back')}
          </button>
        )}
        {/* A plain «Шаг 2 из 3» next to «Назад» — enough for three steps. */}
        <span>{t('postq.purchase.stepOf', { step, total: 3 })}</span>
      </div>

      <ol className="hidden grid-cols-3 gap-3 sm:grid sm:gap-6">
        {stepTitles.map((title, i) => {
          const n = (i + 1) as Step;
          const done = n < step;
          const current = n === step;
          return (
            <li key={title} className="flex min-w-0 flex-col gap-4">
              <span
                className={cn(
                  'h-2 w-full rounded-[4px]',
                  done || current ? 'bg-[var(--rd-action)]' : 'bg-[var(--rd-border)]',
                )}
              />
              <button
                type="button"
                disabled={n > step}
                onClick={() => setStep(n)}
                className="rd-p-lg hidden min-w-0 items-center gap-1 text-left disabled:cursor-default sm:flex"
              >
                {done ? (
                  <RdIcon name="cabinet/check" size={18} className="text-[var(--rd-action)]" />
                ) : (
                  <span
                    className={current ? 'text-[var(--rd-action)]' : 'text-[var(--rd-caption)]'}
                  >
                    {n}.
                  </span>
                )}
                <span
                  className={cn(
                    'truncate',
                    done || current ? 'text-[var(--rd-body)]' : 'text-[var(--rd-caption)]',
                  )}
                >
                  {title}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-col gap-3 pt-3">
        <h1 className="rd-h3 text-[var(--rd-heading)]">{headings[step][0]}</h1>
        <p className="rd-p-lg text-[var(--rd-caption)]">{headings[step][1]}</p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <section className="rd-card rd-card--lg flex min-w-0 flex-1 flex-col gap-6">
          {step === 1 && (
            <>
              <div role="radiogroup" className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-4">
                {tariff.periods.map((p) => {
                  const selected = p.days === period?.days;
                  const hasDiscount =
                    !!p.original_price_kopeks && p.original_price_kopeks > p.price_kopeks;
                  return (
                    <button
                      key={p.days}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setPeriod(p)}
                      className={cn(
                        'flex h-16 items-center rounded-[var(--rd-radius-md)] border-2 px-4 text-left transition-colors sm:h-[180px] sm:items-stretch sm:p-6',
                        selected
                          ? 'border-[var(--rd-action)] bg-[var(--rd-help)]'
                          : 'border-transparent bg-[var(--rd-field)] hover:bg-[var(--rd-chip-hover)]',
                      )}
                    >
                      {/* Phones: one compact row — period and discount on the
                          left, price (old one above) on the right, no radio. */}
                      <span className="flex h-full w-full items-center justify-between gap-3 sm:hidden">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="rd-p-md truncate font-medium text-[var(--rd-heading)]">
                            {p.label}
                          </span>
                          {hasDiscount && p.discount_percent ? (
                            <span
                              className={cn(
                                'rd-p-sm flex h-6 shrink-0 items-center rounded-[8px] px-2 font-medium',
                                selected
                                  ? 'bg-[var(--rd-action)] text-[var(--rd-on-action)]'
                                  : 'bg-[var(--rd-surface)] text-[var(--rd-body)]',
                              )}
                            >
                              −{p.discount_percent}%
                            </span>
                          ) : null}
                        </span>
                        <span className="flex shrink-0 flex-col items-end">
                          {hasDiscount && (
                            <s className="rd-p-sm text-[var(--rd-placeholder)]">
                              {moneyShort(p.original_price_kopeks ?? 0)}
                            </s>
                          )}
                          <span className="rd-p-md font-medium text-[var(--rd-heading)]">
                            {moneyShort(p.price_kopeks)}
                          </span>
                        </span>
                      </span>

                      <span className="hidden w-full flex-col justify-between sm:flex">
                        <span className="flex w-full items-center justify-between gap-3">
                          <span className="rd-h6 text-[var(--rd-heading)]">{p.label}</span>
                          <span
                            aria-hidden
                            className={cn(
                              'shrink-0 rounded-full bg-[var(--rd-surface)]',
                              selected
                                ? 'size-5 border-[6px] border-[var(--rd-action)]'
                                : 'size-6 border-2 border-[var(--rd-border)]',
                            )}
                          />
                        </span>
                        <span className="flex w-full items-end justify-between gap-3">
                          <span className="flex flex-col gap-2">
                            {hasDiscount && (
                              <s className="rd-p-md font-medium text-[var(--rd-placeholder)]">
                                {money(p.original_price_kopeks ?? 0)}
                              </s>
                            )}
                            <span className="rd-h6 text-[var(--rd-heading)]">
                              {money(p.price_kopeks)}
                            </span>
                          </span>
                          {hasDiscount && p.discount_percent ? (
                            <span className={discountBadge(selected)}>−{p.discount_percent}%</span>
                          ) : null}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="rd-p-md text-[var(--rd-caption)]">
                {t('postq.purchase.devicesNote', { count: included })}
              </p>
            </>
          )}

          {step === 2 && (
            <>
              <div className="rd-p-md flex items-center justify-between gap-4">
                <span className="text-[var(--rd-caption)]">
                  {t('postq.purchase.forPeriod', { period: period?.label })}
                </span>
                <button
                  type="button"
                  className="rd-link-action shrink-0 whitespace-nowrap"
                  onClick={() => setStep(1)}
                >
                  {t('postq.purchase.changePeriod')}
                </button>
              </div>
              <div className="flex flex-col items-center gap-4 py-6">
                <div className="flex items-center gap-4 sm:gap-8">
                  <button
                    type="button"
                    aria-label={t('postq.devices.less')}
                    disabled={!selection?.selectable || deviceCount <= minDevices}
                    onClick={() => setDevices(Math.max(minDevices, deviceCount - 1))}
                    className="rd-icon-btn size-12 !rounded-[var(--rd-radius-sm)] bg-[var(--rd-field)] text-[24px] leading-none text-[var(--rd-heading)] disabled:opacity-40"
                  >
                    −
                  </button>
                  <div className="flex min-w-[96px] flex-col items-center">
                    <span className="rd-h3 text-[var(--rd-heading)]">{deviceCount}</span>
                    <span className="rd-p-md text-[var(--rd-caption)]">
                      {t('postq.devices.unit', { count: deviceCount })}
                    </span>
                  </div>
                  <button
                    type="button"
                    aria-label={t('postq.devices.more')}
                    disabled={!selection?.selectable || deviceCount >= maxDevices}
                    onClick={() => setDevices(Math.min(maxDevices, deviceCount + 1))}
                    className="rd-icon-btn size-12 !rounded-[var(--rd-radius-sm)] bg-[var(--rd-field)] text-[24px] leading-none text-[var(--rd-heading)] disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
                <p className="rd-p-lg text-center text-[var(--rd-body)]">
                  {deviceCount <= included
                    ? t('postq.purchase.includedText', { count: included })
                    : t('postq.purchase.extraText', {
                        count: deviceCount - included,
                        price: money(devicesCost),
                      })}
                </p>
              </div>
              {extraDevicePrice > 0 && (
                <>
                  <div className="h-px w-full bg-[var(--rd-border)]" />
                  <div className="flex items-center gap-4 rounded-[var(--rd-radius-md)] bg-[var(--rd-field)] p-4 sm:px-6 sm:py-5">
                    <RdIcon name="cabinet/os-windows" size={20} className="text-[var(--rd-body)]" />
                    <div className="rd-p-md flex flex-col gap-1">
                      <span className="text-[var(--rd-heading)]">
                        {t('postq.purchase.needMore')}
                      </span>
                      <span className="text-[var(--rd-caption)]">
                        {t('postq.purchase.perExtra', {
                          price: money(extraDevicePrice),
                        })}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <div className="flex items-center justify-between gap-4">
                <h2 className="rd-h5 text-[var(--rd-heading)]">{tariff.name}</h2>
                <span className="rd-h6 text-[var(--rd-heading)]">{money(total)}</span>
              </div>
              {[
                {
                  label: t('postq.purchase.period'),
                  value: period?.label,
                  action: t('postq.purchase.changePeriod'),
                  to: 1 as Step,
                },
                {
                  label: t('postq.purchase.devices'),
                  value: t('subscription.devices', { count: deviceCount }),
                  action: t('postq.purchase.changeCount'),
                  to: 2 as Step,
                },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex flex-col gap-2 rounded-[var(--rd-radius-md)] bg-[var(--rd-field)] p-4 sm:p-6"
                >
                  <div className="rd-p-md flex items-center justify-between gap-4">
                    <span className="text-[var(--rd-caption)]">{row.label}</span>
                    <button
                      type="button"
                      className="rd-link-action shrink-0 whitespace-nowrap"
                      onClick={() => setStep(row.to)}
                    >
                      {row.action}
                    </button>
                  </div>
                  <span className="rd-h6 text-[var(--rd-heading)]">{row.value}</span>
                </div>
              ))}
              <div className="h-px w-full bg-[var(--rd-border)]" />
              <dl className="rd-p-md flex flex-col gap-4">
                {original && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-[var(--rd-caption)]">
                      {t('postq.purchase.withoutDiscount')}
                    </dt>
                    <dd className="font-medium text-[var(--rd-heading)]">{money(original)}</dd>
                  </div>
                )}
                {discount > 0 && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-[var(--rd-caption)]">
                      {t('postq.purchase.discountFor', {
                        period: period?.label,
                        percent: discountPercent,
                      })}
                    </dt>
                    <dd className="font-medium text-[var(--rd-heading)]">−{money(discount)}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--rd-caption)]">
                    {t('subscription.devices', { count: deviceCount })}
                  </dt>
                  <dd className="font-medium text-[var(--rd-heading)]">
                    {devicesCost > 0 ? money(devicesCost) : t('subscription.free', 'Бесплатно')}
                  </dd>
                </div>
                {/* Phones have no summary card: the balance part is shown here. */}
                {fromBalance > 0 && (
                  <div className="flex justify-between gap-4 lg:hidden">
                    <dt className="text-[var(--rd-caption)]">{t('postq.purchase.fromBalance')}</dt>
                    <dd className="font-medium text-[var(--rd-heading)]">−{money(fromBalance)}</dd>
                  </div>
                )}
              </dl>
            </>
          )}
        </section>
        {summary}
        {purchase.isError && (
          <p role="alert" className="rd-p-sm text-[var(--rd-error-text)] lg:hidden">
            {getErrorMessage(purchase.error, t)}
          </p>
        )}
      </div>
      {/* Phones: the total and the step's action stay on screen. */}
      <div className="h-20 lg:hidden" aria-hidden />
      <div
        className="fixed z-40 lg:hidden"
        style={{
          bottom: 'max(8px, env(safe-area-inset-bottom, 0px))',
          left: 'max(16px, env(safe-area-inset-left, 0px))',
          right: 'max(16px, env(safe-area-inset-right, 0px))',
        }}
      >
        <div className="rd-liquid-glass relative flex items-center gap-4 rounded-[24px] p-2 pl-4">
          {/* The discount as a small card peeking out over the bar's top edge. */}
          {discountPercent > 0 && (
            <span className="rd-p-sm pointer-events-none absolute -top-3 left-2 flex h-6 -rotate-3 items-center rounded-[8px] bg-[var(--rd-action)] px-2 font-medium text-[var(--rd-on-action)]">
              −{discountPercent}%
            </span>
          )}
          <div className="flex min-w-0 flex-1 flex-col">
            {fromBalance > 0 ? (
              <span className="rd-p-sm truncate text-[var(--rd-caption)]">
                {t('postq.purchase.withBalance')}
              </span>
            ) : (
              original && (
                <s className="rd-p-sm truncate text-[var(--rd-caption)]">{money(original)}</s>
              )
            )}
            <span
              className={cn(
                'truncate text-[20px] font-bold leading-6 text-[var(--rd-heading)]',
                !quoteReady && quote && 'opacity-60',
              )}
            >
              {money(payNow)}
            </span>
          </div>
          {cta(true)}
        </div>
      </div>
      <TopUpDialog
        open={topUpOpen}
        onOpenChange={setTopUpOpen}
        amountKopeks={missing}
        onBeforePay={rememberPurchase}
      />
    </div>
  );
}
