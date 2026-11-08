import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { UseMutationResult } from '@tanstack/react-query';
import type { TrialInfo } from '../../types';
import { useCurrency } from '../../hooks/useCurrency';
import { formatTrafficWhole as formatTraffic } from '../../utils/formatTraffic';
import { Metric } from '@/components/postq/ui';

interface TrialOfferCardProps {
  trialInfo: TrialInfo;
  balanceKopeks: number;
  balanceRubles: number;
  activateTrialMutation: UseMutationResult<unknown, unknown, void, unknown>;
  trialError: string | null;
}

/**
 * Trial offer — postq design, Figma "Пробная подписка": on phones and tablets
 * the terms in the middle of a square card ringed by app icons; on desktop the
 * terms on the left and the phone render on the right. Two actions under it
 * (activate / buy a subscription).
 */
export default function TrialOfferCard({
  trialInfo,
  balanceKopeks,
  balanceRubles,
  activateTrialMutation,
  trialError,
}: TrialOfferCardProps) {
  const { t } = useTranslation();
  const { formatAmount, currencySymbol } = useCurrency();
  const isFree = !trialInfo.requires_payment;
  const canAfford = balanceKopeks >= trialInfo.price_kopeks;
  const price = `${formatAmount(trialInfo.price_rubles)}\u00A0${currencySymbol}`;

  // The card title with its last two words kept on one line.
  const titleWords = t('postq.dashboard.trialTitle').split(' ');
  const titleHead = titleWords.slice(0, -2).join(' ');
  const titleTail = titleWords.slice(-2).join(' ');

  const terms = [
    {
      label: t('postq.dashboard.trialDuration'),
      value: t('subscription.days', { count: trialInfo.duration_days }),
    },
    {
      label: t('postq.dashboard.traffic'),
      value:
        trialInfo.traffic_limit_gb > 0
          ? formatTraffic(trialInfo.traffic_limit_gb)
          : t('postq.dashboard.trafficUnlimited'),
    },
  ];

  const activate = () => {
    if (!activateTrialMutation.isPending) activateTrialMutation.mutate();
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Phones and tablets: a square card ringed by the app icons. */}
      <section className="rd-trial-card relative flex aspect-square items-center justify-center overflow-hidden rounded-[var(--rd-radius-md)] p-6 lg:hidden">
        {/* The icons ring as one picture: the card is square like the artwork
            and shows it whole; the terms sit in its empty middle. Phones: a bit
            larger than the card so the middle has room for the text — the side
            icons peek in from the edges. Lazy: not fetched on desktop, where
            this card is hidden. */}
        <img
          src="/redesign/cabinet/trial/ring-1200.webp"
          srcSet="/redesign/cabinet/trial/ring-1200.webp 1200w, /redesign/cabinet/trial/ring-2400.webp 2400w"
          sizes="(min-width: 640px) 100vw, 130vw"
          alt=""
          aria-hidden
          draggable={false}
          loading="lazy"
          decoding="async"
          className="pointer-events-none absolute top-1/2 left-1/2 aspect-square w-[130%] max-w-none -translate-x-1/2 -translate-y-1/2 select-none sm:w-full"
        />
        <div className="relative z-10 flex max-w-[300px] flex-col items-center gap-6 text-center sm:max-w-[60%] sm:gap-8">
          {/* The last two words stay together («абсолютно бесплатно!»); under
              380px there's no room for them at 28px, so 24px there. */}
          <h2 className="text-[24px] font-bold leading-[32px] text-[var(--rd-heading)] min-[380px]:text-[28px] min-[380px]:leading-[36px] sm:text-[32px] sm:leading-[40px]">
            {titleHead} <span className="whitespace-nowrap">{titleTail}</span>
          </h2>
          <dl className="grid grid-cols-2 gap-6 sm:gap-8">
            {terms.map((m) => (
              <div key={m.label} className="flex min-w-0 flex-col items-center gap-2">
                <dt className="whitespace-nowrap text-[16px] leading-[20px] text-[var(--rd-caption)] sm:text-[20px] sm:leading-[24px]">
                  {m.label}
                </dt>
                <dd className="whitespace-nowrap text-[32px] font-bold leading-[40px] text-[var(--rd-heading)] sm:text-[40px] sm:leading-[48px]">
                  {m.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Desktop: the terms on the left, the phone with the app icons on the
          right (the card's edge crops its bottom). */}
      <section className="rd-trial-card relative hidden min-h-[360px] overflow-hidden rounded-[var(--rd-radius-md)] p-12 lg:block">
        <div className="relative z-10 flex max-w-[56%] flex-col gap-24">
          <h2 className="rd-h5 text-[var(--rd-heading)]">{t('postq.dashboard.trialTitle')}</h2>
          <div className="grid grid-cols-2 gap-6">
            {terms.map((m) => (
              <Metric key={m.label} label={m.label} value={m.value} />
            ))}
          </div>
        </div>
        <picture>
          <source
            type="image/avif"
            srcSet="/redesign/cabinet/trial/phone-480.avif 480w, /redesign/cabinet/trial/phone-960.avif 960w"
            sizes="420px"
          />
          <img
            src="/redesign/cabinet/trial/phone-480.webp"
            srcSet="/redesign/cabinet/trial/phone-480.webp 480w, /redesign/cabinet/trial/phone-960.webp 960w"
            sizes="420px"
            alt=""
            aria-hidden
            draggable={false}
            loading="lazy"
            decoding="async"
            className="pointer-events-none absolute top-3 right-[2%] w-[44%] max-w-[420px] select-none"
          />
        </picture>
      </section>

      {!isFree && !canAfford && (
        <p className="rd-p-md text-[var(--rd-caption)]">
          {t('balance.currentBalance')}: {`${formatAmount(balanceRubles)}\u00A0${currencySymbol}`}.{' '}
          {t('subscription.trial.insufficientBalance')}
        </p>
      )}
      {trialError && (
        <p role="alert" className="rd-p-md text-[var(--rd-error-text)]">
          {trialError}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        {isFree || canAfford ? (
          <button
            type="button"
            onClick={activate}
            disabled={activateTrialMutation.isPending}
            className="rd-btn-tile rd-btn-tile--primary flex-1"
          >
            {activateTrialMutation.isPending
              ? t('common.loading')
              : isFree
                ? t('postq.dashboard.activateFree')
                : t('postq.dashboard.activateFor', { price })}
          </button>
        ) : (
          <Link to="/balance" className="rd-btn-tile rd-btn-tile--primary flex-1">
            {t('subscription.trial.topUpToActivate')}
          </Link>
        )}
        <Link to="/subscription/purchase" className="rd-btn-tile rd-btn-tile--soft flex-1">
          {t('postq.dashboard.buy')}
        </Link>
      </div>
    </div>
  );
}
