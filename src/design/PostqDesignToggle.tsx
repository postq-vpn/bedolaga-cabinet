import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { usePostqDesignStore } from './postqDesign';

/** Admin panel switch for the postq redesign (shown to admins only). */
export function PostqDesignToggle() {
  const { t } = useTranslation();
  const enabled = usePostqDesignStore((s) => s.enabled);
  const setEnabled = usePostqDesignStore((s) => s.setEnabled);

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-between gap-4 rounded-xl border px-4 py-3',
        'border-dark-700/50 bg-dark-800/40 light:border-champagne-300/50 light:bg-champagne-100/60',
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-semibold text-dark-100 light:text-champagne-900">
          {t('postq.design.title')}
        </span>
        <span className="text-xs text-dark-400 light:text-champagne-600">
          {t('postq.design.hint')}
        </span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={t('postq.design.title')}
        onClick={() => setEnabled(!enabled)}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors',
          enabled ? 'bg-accent-500' : 'bg-dark-600 light:bg-champagne-400',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
            enabled && 'translate-x-5',
          )}
        />
      </button>
    </div>
  );
}
