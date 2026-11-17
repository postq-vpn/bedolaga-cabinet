import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { promoApi } from '@/api/promo';
import { useCurrency } from '@/hooks/useCurrency';
import { invalidatePromoDependents, usePromocode } from '@/hooks/usePromocode';
import { promoCodeFromSource, usePromoDiscount } from '@/hooks/usePromoDiscount';
import { formatLiteDate } from '@/utils/liteDate';
import { uiLocale } from '@/utils/uiLocale';
import { cn } from '@/lib/utils';
import { RdIcon } from './RdIcon';

/** Code discounts often last hours: within two days the time matters too. */
function expiryLabel(iso: string) {
  const date = new Date(iso);
  const day = formatLiteDate(iso);
  if (Number.isNaN(date.getTime()) || date.getTime() - Date.now() > 48 * 3600_000) return day;
  const time = date.toLocaleTimeString(uiLocale(), { hour: '2-digit', minute: '2-digit' });
  return `${day}, ${time}`;
}

/**
 * Promo code input with the applied code under it, as checkouts usually do
 * it (Shopify, Stripe): the field stays for the next code, the applied one is
 * a small chip «✓ SALE ×» with what it gives next to it. The cross takes the
 * discount off — the bot rolls the code's use back, so it can be entered
 * again. Balance and days codes have no lasting state: they get a one-off
 * confirmation line instead.
 */
export function PromoCodeField({
  autoFocus = false,
  className,
}: {
  autoFocus?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { formatAmount, currencySymbol } = useCurrency();
  const promo = usePromocode();
  const { activeDiscount, activePercent } = usePromoDiscount();
  const appliedCode = promoCodeFromSource(activeDiscount?.source);

  const remove = useMutation({
    mutationFn: promoApi.deactivateDiscount,
    onSettled: () => invalidatePromoDependents(queryClient),
  });

  const until = activeDiscount?.expires_at
    ? t('postq.promo.untilDate', { date: expiryLabel(activeDiscount.expires_at) })
    : t('postq.promo.untilPurchase');
  const showSubmit = promo.code.trim() || promo.loading;

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <form
        className={cn('rd-field', showSubmit && '!pr-2')}
        onSubmit={(e) => {
          e.preventDefault();
          void promo.activate();
        }}
      >
        <input
          value={promo.code}
          onChange={(e) => promo.setCode(e.target.value)}
          placeholder={t('postq.payment.promoPlaceholder')}
          aria-label={t('postq.payment.promoTitle')}
          disabled={promo.loading}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          autoFocus={autoFocus}
        />
        {showSubmit && (
          <button
            type="submit"
            disabled={promo.loading}
            className="rd-p-md shrink-0 px-3 font-medium text-[var(--rd-action)] disabled:opacity-50"
          >
            {promo.loading ? t('common.loading') : t('postq.payment.promoActivate')}
          </button>
        )}
      </form>

      {promo.error && (
        <p role="alert" className="rd-p-sm text-[var(--rd-error-text)]">
          {promo.error}
        </p>
      )}

      {activePercent > 0 && (
        <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="rd-p-sm inline-flex h-8 items-center gap-1.5 rounded-[8px] bg-[var(--rd-chip)] pr-1.5 pl-2.5 font-medium text-[var(--rd-heading)]">
            <RdIcon name="cabinet/check" size={14} className="text-[var(--rd-success)]" />
            <span className={cn(!appliedCode && 'pr-1.5')}>
              {appliedCode ?? t('postq.promo.offerChip', { percent: activePercent })}
            </span>
            {appliedCode && (
              <button
                type="button"
                aria-label={t('postq.promo.remove', { code: appliedCode })}
                disabled={remove.isPending}
                onClick={() => remove.mutate()}
                className="ml-1.5 flex size-5 items-center justify-center text-[var(--rd-caption)] transition-colors hover:text-[var(--rd-heading)] disabled:opacity-50"
              >
                <RdIcon name="cabinet/x-small" size={10} />
              </button>
            )}
          </span>
          <span className="rd-p-sm text-[var(--rd-caption)]">
            {appliedCode
              ? t('postq.promo.appliedTerms', { percent: activePercent, until })
              : t('postq.promo.offerTerms', { until })}
          </span>
        </div>
      )}
      {remove.isError && (
        <p role="alert" className="rd-p-sm text-[var(--rd-error-text)]">
          {t('balance.promocode.errors.server_error')}
        </p>
      )}

      {promo.success && (
        <p role="status" className="rd-p-sm text-[var(--rd-success-text)]">
          {promo.success.message}
          {promo.success.amount > 0 &&
            ` · +${formatAmount(promo.success.amount, Number.isInteger(promo.success.amount) ? 0 : 2)} ${currencySymbol}`}
        </p>
      )}

      {promo.choices && promo.choices.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="rd-p-sm text-[var(--rd-caption)]">
            {t('balance.promocode.selectSubscription')}
          </p>
          {promo.choices.map((sub) => (
            <button
              key={sub.id}
              type="button"
              onClick={() => void promo.activate(sub.id)}
              disabled={promo.loading}
              className="rd-p-md flex items-center justify-between rounded-[var(--rd-radius-sm)] bg-[var(--rd-field)] px-4 py-3 text-left text-[var(--rd-heading)] hover:bg-[var(--rd-chip-hover)]"
            >
              <span className="truncate">{sub.tariff_name}</span>
              <span className="rd-p-sm shrink-0 text-[var(--rd-caption)]">
                {t('balance.promocode.daysLeft', { count: sub.days_left })}
              </span>
            </button>
          ))}
          <button type="button" onClick={promo.cancelChoice} className="rd-p-sm rd-link self-start">
            {t('common.cancel')}
          </button>
        </div>
      )}
    </div>
  );
}
