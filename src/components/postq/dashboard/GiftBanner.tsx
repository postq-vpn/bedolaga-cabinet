import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

/**
 * "Дарите PostqVPN родным и близким" — Figma "devices amount" banner.
 * The 3D gift is a large tilted illustration cropped by the card edge, the bow
 * always in view: the right edge on phones, the bottom-left corner from `sm`
 * (the button sits on the right).
 */
export function GiftBanner() {
  const { t } = useTranslation();
  return (
    <section className="rd-card relative flex flex-col gap-6 overflow-hidden sm:flex-row sm:items-center sm:pl-32">
      <img
        src="/redesign/cabinet/gift-3d.webp"
        alt=""
        aria-hidden
        width={128}
        height={128}
        draggable={false}
        decoding="async"
        className="pointer-events-none absolute top-3 -right-8 size-32 rotate-[16deg] select-none sm:top-auto sm:right-auto sm:-bottom-6 sm:-left-4 sm:size-28 sm:-rotate-[14deg]"
      />
      {/* Phones: tall enough that the button starts below the gift, however the text wraps. */}
      <div className="relative flex min-h-28 min-w-0 flex-1 flex-col gap-2 pr-24 sm:min-h-0 sm:pr-0">
        <h2 className="text-balance text-[20px] font-bold leading-6 text-[var(--rd-heading)]">
          {t('postq.dashboard.giftTitle')}
        </h2>
        <p className="rd-p-md text-balance text-[var(--rd-caption)]">
          {t('postq.dashboard.giftText')}
        </p>
      </div>
      <Link to="/gift" className="rd-btn-soft relative w-full shrink-0 sm:w-auto">
        {t('postq.dashboard.giftAction')}
      </Link>
    </section>
  );
}
