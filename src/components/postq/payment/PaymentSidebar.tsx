import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PiCreditCardFill, PiCurrencyBtcFill } from 'react-icons/pi';
import { balanceApi } from '@/api/balance';
import { useCurrency } from '@/hooks/useCurrency';
import { PromoCodeField } from '../PromoCodeField';
import { RdIcon } from '../RdIcon';
import { SUPPORT_BOT_URL } from '../links';

/** Left column of the payment screens (Figma «Баланс и промокод»): current
 *  balance, promo code and a support hint. */
export function PaymentSidebar() {
  const { t } = useTranslation();
  const { formatAmount, currencySymbol } = useCurrency();
  const { data: balance } = useQuery({
    queryKey: ['balance'],
    queryFn: balanceApi.getBalance,
  });
  const rubles = balance?.balance_rubles;

  // Phones: the aside dissolves (`contents`) so the page can interleave its
  // cards by priority — balance (with the promo code), top-up, history, help.
  // The order-* values only matter while the aside is flattened.
  return (
    <aside className="contents lg:flex lg:w-[400px] lg:shrink-0 lg:flex-col lg:gap-6">
      {/* Balance and the promo code in one card: a code usually tops the
          balance up. The placeholder names the field, so no label above it,
          and «Активировать» sits inside the input. */}
      <section className="rd-card order-1 flex flex-col gap-6 lg:order-none">
        <div className="flex flex-col gap-2">
          <span className="rd-p-md text-[var(--rd-caption)]">{t('postq.dashboard.balance')}</span>
          <span className="rd-h4 text-[var(--rd-heading)]">
            {rubles === undefined
              ? '—'
              : `${formatAmount(rubles, Number.isInteger(rubles) ? 0 : 2)}\u00A0${currencySymbol}`}
          </span>
        </div>
        <PromoCodeField />
      </section>

      <section className="order-5 flex flex-col gap-3 lg:order-none rounded-[var(--rd-radius-md)] border border-[var(--rd-border)] bg-[var(--rd-chip)] p-6">
        <p className="rd-p-md text-[var(--rd-heading)]">{t('postq.payment.helpTitle')}</p>
        <p className="rd-p-md text-[var(--rd-caption)]">{t('postq.payment.helpText')}</p>
        <a
          href={SUPPORT_BOT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="rd-p-md rd-link-action inline-flex items-center gap-1 self-start"
        >
          {t('postq.payment.helpAction')}
          <RdIcon name="cabinet/arrow-up-right" size={16} />
        </a>
      </section>
    </aside>
  );
}

/** Page title block shared by the payment screens. */
export function PaymentHeading() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      <h1 className="rd-h3 text-[var(--rd-heading)]">{t('postq.payment.title')}</h1>
      <p className="rd-p-lg text-[var(--rd-caption)]">{t('postq.payment.subtitle')}</p>
    </div>
  );
}

const CRYPTO = /crypto|heleket|ton|usdt|btc|bitcoin|nowpay|cryptomus/i;

/** Generic method glyph: a filled card for fiat, a filled bitcoin for crypto. */
export function PaymentMethodGlyph({ methodId, size = 44 }: { methodId: string; size?: number }) {
  const Icon = CRYPTO.test(methodId) ? PiCurrencyBtcFill : PiCreditCardFill;
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-[var(--rd-radius-sm)] bg-[var(--rd-surface)] text-[var(--rd-body)]"
      style={{ width: size, height: size }}
    >
      <Icon
        aria-hidden
        style={{ width: Math.round(size * 0.55), height: Math.round(size * 0.55) }}
      />
    </span>
  );
}
