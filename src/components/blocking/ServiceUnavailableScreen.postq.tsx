import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { PiArrowClockwiseBold } from 'react-icons/pi';
import { PreloaderLogo } from '@/components/postq/Preloader';
import { cn } from '@/lib/utils';

interface Props {
  screenRef: Ref<HTMLDivElement>;
  isChecking: boolean;
  onRetry: () => void;
}

/**
 * postq version of the "service unavailable" screen: the site's page canvas,
 * one card, and the postq logo preloader looping in place of the warning
 * medallion and pulsing dots — the screen keeps polling, so it reads as
 * "reconnecting" rather than as an error.
 */
export default function ServiceUnavailablePostq({ screenRef, isChecking, onRetry }: Props) {
  const { t } = useTranslation();

  return (
    <div
      ref={screenRef}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="service-unavailable-title"
      aria-describedby="service-unavailable-description"
      tabIndex={-1}
      className="fixed inset-0 z-[100] overflow-y-auto bg-[var(--rd-page)] font-display outline-none"
    >
      <div className="flex min-h-full items-center justify-center px-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          aria-live="polite"
          aria-atomic
          className="rd-card rd-card--lg flex w-full max-w-[440px] flex-col items-center text-center shadow-[var(--rd-shadow)]"
        >
          <PreloaderLogo className="w-[72px]" />

          <h1 id="service-unavailable-title" className="rd-h6 mt-6 text-[var(--rd-heading)]">
            {t('blocking.serviceUnavailable.title')}
          </h1>
          <p
            id="service-unavailable-description"
            className="rd-p-md mt-3 text-balance text-[var(--rd-caption)]"
          >
            {t('blocking.serviceUnavailable.description')}
          </p>

          <button
            type="button"
            onClick={onRetry}
            disabled={isChecking}
            className="rd-btn mt-8 w-full"
          >
            <PiArrowClockwiseBold className={cn('h-5 w-5', isChecking && 'animate-spin')} />
            {isChecking
              ? t('blocking.serviceUnavailable.checking')
              : t('blocking.serviceUnavailable.retry')}
          </button>

          <p className="rd-p-sm mt-5 text-balance text-[var(--rd-placeholder)]">
            {t('blocking.serviceUnavailable.hint')}
          </p>
        </motion.div>
      </div>
    </div>
  );
}
