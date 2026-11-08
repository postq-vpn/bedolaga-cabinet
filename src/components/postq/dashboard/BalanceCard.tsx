import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useCurrency } from '@/hooks/useCurrency';
import { usePromocode } from '@/hooks/usePromocode';
import { cn } from '@/lib/utils';
import { RdIcon } from '../RdIcon';

/**
 * Balance with promo code and top-up — Figma "Показатель кабинета" / "Баланс".
 * `softTopUp` turns the top-up button pink-tinted when another action on the
 * screen is the primary one (trial offer).
 */
export function BalanceCard({
  balanceRubles,
  softTopUp = false,
}: {
  balanceRubles: number | undefined;
  softTopUp?: boolean;
}) {
  const { t } = useTranslation();
  const { formatAmount, currencySymbol } = useCurrency();
  const promo = usePromocode();

  return (
    <section data-onboarding="balance" className="rd-card flex flex-col gap-6">
      {promo.success && (
        <div className="rd-p-md flex min-h-11 items-center rounded-[var(--rd-radius-md)] bg-[var(--rd-success-bg)] px-5 py-3 text-[var(--rd-success-text)]">
          {promo.success.message}
        </div>
      )}
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <span className="rd-p-md text-[var(--rd-caption)]">{t('postq.dashboard.balance')}</span>
          <span className="rd-h4 truncate text-[var(--rd-heading)]">
            {balanceRubles === undefined
              ? '—'
              : `${formatAmount(balanceRubles, Number.isInteger(balanceRubles) ? 0 : 2)}\u00A0${currencySymbol}`}
          </span>
        </div>
        <Link
          to="/balance"
          aria-label={t('postq.dashboard.openBalance')}
          className="rd-icon-btn size-11 bg-[var(--rd-field)] text-[var(--rd-body)]"
        >
          <RdIcon name="arrow-right" size={20} />
        </Link>
      </div>

      <div className="flex flex-col gap-3">
        <form
          className="rd-field !px-6"
          onSubmit={(e) => {
            e.preventDefault();
            void promo.activate();
          }}
        >
          <input
            value={promo.code}
            onChange={(e) => promo.setCode(e.target.value)}
            placeholder={t('postq.dashboard.promoPlaceholder')}
            aria-label={t('postq.dashboard.promoPlaceholder')}
            disabled={promo.loading}
            autoComplete="off"
          />
          {promo.code.trim() && (
            <button
              type="submit"
              disabled={promo.loading}
              className="rd-p-md shrink-0 font-medium text-[var(--rd-action)] disabled:opacity-50"
            >
              {promo.loading ? t('common.loading') : t('postq.dashboard.promoApply')}
            </button>
          )}
        </form>
        {promo.error && (
          <p role="alert" className="rd-p-sm text-[var(--rd-error-text)]">
            {promo.error}
          </p>
        )}
        {promo.choices && promo.choices.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="rd-p-sm text-[var(--rd-caption)]">
              {t('balance.promocode.selectSubscription', 'К какой подписке применить промокод?')}
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
                  {t('balance.promocode.daysLeft', '{{count}} дн.', { count: sub.days_left })}
                </span>
              </button>
            ))}
          </div>
        )}
        <Link
          to="/balance"
          className={cn(
            'rd-btn w-full',
            softTopUp &&
              '!bg-[var(--rd-action-soft)] !text-[var(--rd-on-soft)] hover:!bg-[var(--rd-action-soft-hover)]',
          )}
        >
          {t('postq.dashboard.topUp')}
        </Link>
      </div>
    </section>
  );
}
