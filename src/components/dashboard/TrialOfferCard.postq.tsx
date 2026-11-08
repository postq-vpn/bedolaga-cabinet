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
 * Trial offer — postq design, Figma "Пробная подписка": a tinted card with the
 * trial terms and the phone render on the right, two actions under it
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

  const activate = () => {
    if (!activateTrialMutation.isPending) activateTrialMutation.mutate();
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="rd-trial-card relative overflow-hidden rounded-[var(--rd-radius-md)] p-6 sm:min-h-[300px] sm:p-8 lg:min-h-[360px] lg:p-12">
        <div className="relative z-10 flex flex-col gap-10 sm:max-w-[52%] lg:max-w-[56%] lg:gap-24">
          <h2 className="rd-h5 text-[var(--rd-heading)]">{t('postq.dashboard.trialTitle')}</h2>
          <div className="grid max-w-[44%] grid-cols-1 gap-6 sm:max-w-none sm:grid-cols-2">
            <Metric
              label={t('postq.dashboard.trialDuration')}
              value={t('subscription.days', { count: trialInfo.duration_days })}
            />
            <Metric
              label={t('postq.dashboard.traffic')}
              value={
                trialInfo.traffic_limit_gb > 0
                  ? formatTraffic(trialInfo.traffic_limit_gb)
                  : t('postq.dashboard.trafficUnlimited')
              }
            />
          </div>
        </div>
        {/* Phone with the app icons (Figma "Пробная подписка"): always on the
            right, the card's edge crops its bottom. On phones the terms stack in
            a column on the left and the phone peeks out of the bottom corner
            (it used to sit under the terms, half cut off mid-icons). */}
        <picture>
          <source
            type="image/avif"
            srcSet="/redesign/cabinet/trial/phone-480.avif 480w, /redesign/cabinet/trial/phone-960.avif 960w"
            sizes="(min-width: 1024px) 420px, (min-width: 640px) 44vw, 200px"
          />
          <img
            src="/redesign/cabinet/trial/phone-480.webp"
            srcSet="/redesign/cabinet/trial/phone-480.webp 480w, /redesign/cabinet/trial/phone-960.webp 960w"
            sizes="(min-width: 1024px) 420px, (min-width: 640px) 44vw, 200px"
            alt=""
            aria-hidden
            draggable={false}
            loading="lazy"
            decoding="async"
            className="pointer-events-none absolute -bottom-10 -right-2 block w-[200px] select-none sm:bottom-auto sm:top-3 sm:right-[2%] sm:w-[44%] sm:max-w-[420px]"
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
