import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { RdIcon } from '../RdIcon';
import { IconCard } from '../ui';

/** "Дарите PostqVPN родным и близким" — Figma "devices amount" banner. */
export function GiftBanner() {
  const { t } = useTranslation();
  return (
    <IconCard
      icon={<RdIcon name="cabinet/gift" size={24} />}
      title={t('postq.dashboard.giftTitle')}
      text={t('postq.dashboard.giftText')}
      action={
        <Link to="/gift" className="rd-btn-soft w-full shrink-0 sm:w-auto">
          {t('postq.dashboard.giftAction')}
        </Link>
      }
    />
  );
}
