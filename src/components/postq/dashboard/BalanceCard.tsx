import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useCurrency } from '@/hooks/useCurrency';
import { cn } from '@/lib/utils';
import { PromoCodeField } from '../PromoCodeField';
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

  return (
    <section data-onboarding="balance" className="rd-card flex flex-col gap-6">
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
        <PromoCodeField />
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
