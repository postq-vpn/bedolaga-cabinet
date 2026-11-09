import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { balanceApi } from '@/api/balance';
import { giftApi, type GiftConfig, type GiftTariff } from '@/api/gift';
import { useCurrency } from '@/hooks/useCurrency';
import { cn } from '@/lib/utils';
import { pickBestValue } from '@/utils/bestValue';
import { getLocalizedApiErrorMessage } from '@/utils/api-error-display';
import { TopUpDialog } from '../payment/TopUpDialog';
import { savePendingGift } from './pendingPurchase';
import {
  ConfirmRow,
  MobileTotalBar,
  PeriodTile,
  WizardHeading,
  WizardProgress,
} from './wizardParts';

type Step = 1 | 2;

/**
 * Buying a gift, built like the subscription purchase (PurchaseWizard): the
 * period on step 1, the confirmation on step 2, paid from the balance, and a
 * top-up popup for what's missing — the gift is then bought automatically
 * (usePendingPurchase). The device count comes with the tariff, so there is no
 * devices step.
 */
export function GiftWizard({
  config,
  periodLabel,
  onPurchaseComplete,
}: {
  config: GiftConfig;
  periodLabel: (days: number) => string;
  onPurchaseComplete: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { formatAmount, currencySymbol } = useCurrency();
  const money = (kopeks: number) => `${formatAmount(kopeks / 100)}\u00A0${currencySymbol}`;
  const moneyShort = (kopeks: number) =>
    `${formatAmount(kopeks / 100, kopeks % 100 === 0 ? 0 : 2)}\u00A0${currencySymbol}`;

  const [step, setStep] = useState<Step>(1);
  const [tariffId, setTariffId] = useState<number | null>(null);
  const [periodDays, setPeriodDays] = useState<number | null>(null);
  const [topUpOpen, setTopUpOpen] = useState(false);

  const tariff: GiftTariff | undefined = useMemo(
    () =>
      config.tariffs.find((tr) => tr.id === tariffId) ??
      pickBestValue(config.tariffs) ??
      config.tariffs[0],
    [config.tariffs, tariffId],
  );
  const periods = useMemo(
    () => [...(tariff?.periods ?? [])].sort((a, b) => a.days - b.days),
    [tariff],
  );
  // A tariff starts from its best-value period; picking another tariff resets
  // the choice, within one tariff the person's own pick stays.
  const period =
    periods.find((p) => p.days === periodDays) ??
    (tariff ? pickBestValue(tariff.periods) : undefined) ??
    periods[0];

  const { data: balanceData } = useQuery({
    queryKey: ['balance'],
    queryFn: balanceApi.getBalance,
    staleTime: 0,
  });
  const balance = balanceData?.balance_kopeks ?? config.balance_kopeks;

  const total = period?.price_kopeks ?? 0;
  const original =
    period?.original_price_kopeks != null && period.original_price_kopeks > total
      ? period.original_price_kopeks
      : null;
  const discount = original ? original - total : 0;
  const discountPercent =
    period?.discount_percent ?? (original ? Math.round((discount / original) * 100) : 0);
  const missing = Math.max(0, total - balance);
  // Confirmation: the balance goes toward the price, the total is what's left.
  const fromBalance = step === 2 ? Math.max(0, total - missing) : 0;
  const payNow = fromBalance > 0 ? missing : total;
  const devices = tariff ? t('gift.deviceCount', { count: tariff.device_limit }) : '';

  const purchase = useMutation({
    mutationFn: () => {
      if (!tariff || !period) throw new Error(t('gift.failedDesc'));
      return giftApi.createPurchase({
        tariff_id: tariff.id,
        period_days: period.days,
        payment_mode: 'balance',
      });
    },
    onSuccess: () => {
      for (const key of ['balance', 'gift-config', 'gift-sent']) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      onPurchaseComplete();
    },
  });
  const error = purchase.isError
    ? getLocalizedApiErrorMessage(purchase.error, t('gift.failedDesc'), t)
    : null;

  const headings: Record<Step, [string, string]> = {
    1: [t('postq.purchase.step1'), t('postq.gift.step1Text')],
    2: [t('postq.gift.step2'), t('postq.gift.step2Text')],
  };

  const cta = (compact: boolean) => {
    const btnClass = compact
      ? 'rd-btn shrink-0 !px-6'
      : 'rd-btn !min-h-16 w-full !rounded-[var(--rd-radius-control)]';
    if (step === 1) {
      return (
        <button type="button" className={btnClass} disabled={!period} onClick={() => setStep(2)}>
          {compact ? t('common.next') : t('postq.purchase.nextConfirm')}
        </button>
      );
    }
    if (missing > 0) {
      return (
        <button type="button" className={btnClass} onClick={() => setTopUpOpen(true)}>
          {compact
            ? t('postq.dashboard.topUp')
            : t('postq.devices.topUp', { amount: money(missing) })}
        </button>
      );
    }
    return (
      <button
        type="button"
        className={btnClass}
        disabled={!period || purchase.isPending}
        onClick={() => purchase.mutate()}
      >
        {purchase.isPending
          ? t('common.loading')
          : compact
            ? t('postq.gift.payShort')
            : t('postq.gift.pay', { amount: money(total) })}
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Under the page tabs a plain «Шаг 1 из 2» looked lost on phones: the
          stepper itself is shown everywhere, and step 1 in it leads back. */}
      <WizardProgress
        alwaysVisible
        titles={[t('postq.purchase.step1'), t('postq.gift.stepConfirm')]}
        step={step}
        onStep={(n) => setStep(n as Step)}
      />
      <WizardHeading as="h2" title={headings[step][0]} text={headings[step][1]} />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <section className="rd-card rd-card--lg flex min-w-0 flex-1 flex-col gap-6">
          {step === 1 && (
            <>
              {config.tariffs.length > 1 && (
                <div
                  role="radiogroup"
                  aria-label={t('gift.chooseTariff')}
                  className="flex flex-col gap-3"
                >
                  {config.tariffs.map((tr) => (
                    <TariffOption
                      key={tr.id}
                      tariff={tr}
                      selected={tr.id === tariff?.id}
                      onSelect={() => {
                        setTariffId(tr.id);
                        setPeriodDays(null);
                      }}
                    />
                  ))}
                </div>
              )}
              {tariff?.description && (
                <p className="rd-p-md text-[var(--rd-body)]">{tariff.description}</p>
              )}
              <div role="radiogroup" className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-4">
                {periods.map((p) => (
                  <PeriodTile
                    key={p.days}
                    label={periodLabel(p.days)}
                    priceKopeks={p.price_kopeks}
                    originalKopeks={p.original_price_kopeks}
                    discountPercent={p.discount_percent}
                    selected={p.days === period?.days}
                    onSelect={() => setPeriodDays(p.days)}
                    money={money}
                    moneyShort={moneyShort}
                  />
                ))}
              </div>
              <p className="rd-p-md text-[var(--rd-caption)]">
                {t('postq.gift.devicesNote', { devices })}
              </p>
            </>
          )}

          {step === 2 && (
            <>
              <div className="flex items-center justify-between gap-4">
                <h2 className="rd-h5 text-[var(--rd-heading)]">{tariff?.name}</h2>
                <span className="rd-h6 text-[var(--rd-heading)]">{money(total)}</span>
              </div>
              <ConfirmRow
                label={t('postq.purchase.period')}
                value={period ? periodLabel(period.days) : ''}
                action={{ label: t('postq.purchase.changePeriod'), onClick: () => setStep(1) }}
              />
              <ConfirmRow label={t('postq.purchase.devices')} value={devices} />
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
                        period: period ? periodLabel(period.days) : '',
                        percent: discountPercent,
                      })}
                    </dt>
                    <dd className="font-medium text-[var(--rd-heading)]">−{money(discount)}</dd>
                  </div>
                )}
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

        {/* Same card as the purchase wizard's summary; phones use the bottom bar. */}
        <aside className="rd-card rd-card--lg hidden flex-col gap-6 lg:sticky lg:flex lg:top-[138px] lg:w-[440px] lg:shrink-0">
          <h2 className="rd-h6 text-[var(--rd-heading)]">
            {step === 2 ? t('postq.purchase.toPay') : t('postq.purchase.yourChoice')}
          </h2>
          {step === 1 && (
            <dl className="rd-p-md flex flex-col gap-4">
              {config.tariffs.length > 1 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--rd-caption)]">{t('postq.gift.plan')}</dt>
                  <dd className="text-right text-[var(--rd-body)]">{tariff?.name}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--rd-caption)]">{t('postq.purchase.period')}</dt>
                <dd className="text-[var(--rd-body)]">{period ? periodLabel(period.days) : ''}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--rd-caption)]">{t('postq.purchase.devices')}</dt>
                <dd className="text-[var(--rd-body)]">{devices}</dd>
              </div>
            </dl>
          )}
          {fromBalance > 0 && (
            <dl className="rd-p-md flex flex-col gap-4">
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--rd-caption)]">
                  {t('postq.purchase.subscriptionPrice')}
                </dt>
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
            <span className="rd-h4 text-[var(--rd-heading)]">{money(payNow)}</span>
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
          {error && (
            <p role="alert" className="rd-p-sm text-[var(--rd-error-text)]">
              {error}
            </p>
          )}
          {cta(false)}
        </aside>
        {error && (
          <p role="alert" className="rd-p-sm text-[var(--rd-error-text)] lg:hidden">
            {error}
          </p>
        )}
      </div>

      <MobileTotalBar
        discountPercent={discountPercent}
        caption={
          fromBalance > 0 ? t('postq.purchase.withBalance') : original ? money(original) : null
        }
        strike={fromBalance === 0}
        amount={money(payNow)}
        action={cta(true)}
      />
      <TopUpDialog
        open={topUpOpen}
        onOpenChange={setTopUpOpen}
        amountKopeks={missing}
        autoText={t('postq.gift.topUpAuto')}
        onBeforePay={() => {
          if (tariff && period) {
            savePendingGift({
              tariffId: tariff.id,
              days: period.days,
              totalKopeks: total,
              createdAt: Date.now(),
            });
          }
        }}
      />
    </div>
  );
}

function TariffOption({
  tariff,
  selected,
  onSelect,
}: {
  tariff: GiftTariff;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-4 rounded-[var(--rd-radius-md)] border-2 p-4 text-left transition-colors',
        selected
          ? 'border-[var(--rd-action)] bg-[var(--rd-help)]'
          : 'border-transparent bg-[var(--rd-field)] hover:bg-[var(--rd-chip-hover)]',
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="rd-p-lg text-[var(--rd-heading)]">{tariff.name}</span>
        <span className="rd-p-sm text-[var(--rd-caption)]">
          {tariff.traffic_limit_gb > 0
            ? `${tariff.traffic_limit_gb} ${t('gift.gbShort')}`
            : t('postq.dashboard.trafficUnlimited')}
          {', '}
          {t('gift.deviceCount', { count: tariff.device_limit })}
        </span>
      </span>
      <span
        aria-hidden
        className={cn(
          'shrink-0 rounded-full bg-[var(--rd-surface)]',
          selected
            ? 'size-5 border-[6px] border-[var(--rd-action)]'
            : 'size-6 border-2 border-[var(--rd-border)]',
        )}
      />
    </button>
  );
}
