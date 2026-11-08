import { useTranslation } from 'react-i18next';
import type { ReferralInfo } from '@/types';
import { useCurrency } from '@/hooks/useCurrency';
import { CopyField, CornerLink, Metric } from '../ui';

/** Referral programme summary — Figma "Реферальная программа". */
export function ReferralCard({ info }: { info: ReferralInfo }) {
  const { t } = useTranslation();
  const { formatAmount, currencySymbol } = useCurrency();
  const earned = info.total_earnings_rubles;

  return (
    <section className="rd-card rd-card--lg flex flex-col gap-8">
      <div className="flex items-center justify-between gap-4">
        <h2 className="rd-h5 text-[var(--rd-heading)]">{t('postq.dashboard.referralTitle')}</h2>
        <CornerLink to="/referral" icon="arrow" label={t('postq.dashboard.referralOpen')} />
      </div>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end">
        <div className="flex gap-6 lg:w-[288px] lg:shrink-0">
          <Metric
            className="flex-1 gap-3"
            label={t('postq.dashboard.invited')}
            value={info.total_referrals}
          />
          <Metric
            className="flex-1 gap-3"
            label={t('postq.dashboard.earned')}
            value={`${formatAmount(earned, Number.isInteger(earned) ? 0 : 2)}\u00A0${currencySymbol}`}
          />
        </div>
        {info.bot_referral_link && (
          <CopyField label={t('postq.dashboard.copyBotLink')} value={info.bot_referral_link} />
        )}
        {info.referral_link && (
          <CopyField label={t('postq.dashboard.copySiteLink')} value={info.referral_link} />
        )}
      </div>
    </section>
  );
}
