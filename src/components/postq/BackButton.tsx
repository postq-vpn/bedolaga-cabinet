import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import { cn } from '@/lib/utils';
import { usePlatform } from '@/platform';
import { getFallbackParentPath } from '@/utils/navigation';
import { RdIcon } from './RdIcon';
import { useBackOverride } from './backOverride';
import { isMobileTabScreen } from './menuScreens';

/**
 * Whether the header shows «Назад»: on every screen that isn't a menu section
 * (the bottom-bar tabs, which are also the desktop header's sections), and on a
 * menu screen while it has an inner step to go back from (backOverride). Not in
 * Telegram — its native Back button does this job there (hasBackButton).
 */
export function useShowBackButton(): boolean {
  const { pathname } = useLocation();
  const { capabilities } = usePlatform();
  const hasOverride = useBackOverride((s) => s.handler !== null);
  return !capabilities.hasBackButton && (hasOverride || !isMobileTabScreen(pathname));
}

/**
 * One step back: the screen's own step-back when it set one (backOverride);
 * otherwise back in the app's history, or — opened straight on a nested page
 * (link, reload) — to its parent.
 */
function useGoBack(): () => void {
  const navigate = useNavigate();
  const location = useLocation();
  const override = useBackOverride((s) => s.handler);
  return () => {
    if (override) return override();
    // React Router gives the entry page the key "default": no in-app history.
    if (location.key !== 'default') navigate(-1);
    else navigate(getFallbackParentPath(location.pathname), { replace: true });
  };
}

/**
 * Telegram's own Back button (top-left, instead of «Закрыть») on the same
 * screens where the web shows ours: every nested page and a menu screen with
 * an inner step. Without it Telegram only offered to close the app.
 */
export function useTelegramBackButton() {
  const { pathname } = useLocation();
  const { capabilities, backButton } = usePlatform();
  const hasOverride = useBackOverride((s) => s.handler !== null);
  const goBack = useGoBack();
  const goBackRef = useRef(goBack);
  goBackRef.current = goBack;
  const visible = capabilities.hasBackButton && (hasOverride || !isMobileTabScreen(pathname));

  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname — новости и инфо-страницы прячут кнопку при уходе, показываем снова на новом экране.
  useEffect(() => {
    if (!visible) {
      backButton.hide();
      return;
    }
    backButton.show(() => goBackRef.current());
  }, [visible, pathname, backButton]);

  useEffect(() => () => backButton.hide(), [backButton]);
}

/**
 * The cabinet's only «Назад» on the web: a chevron in a pill next to the logo.
 * Runs the screen's step-back when it set one (backOverride); otherwise goes
 * back in the app's history, or — opened straight on a nested page (link,
 * reload) — to its parent.
 */
export function BackButton({ variant }: { variant: 'mobile' | 'desktop' | 'inline' }) {
  const { t } = useTranslation();
  const goBack = useGoBack();

  // Inside a page's own layout (the wizard's step row): a quiet text link,
  // only its colour answers the pointer.
  if (variant === 'inline') {
    return (
      <button
        type="button"
        onClick={goBack}
        className="rd-p-md -ml-1 flex items-center gap-1 font-medium text-[var(--rd-caption)] transition-colors hover:text-[var(--rd-heading)]"
      >
        <RdIcon name="cabinet/chevron-up" size={18} className="-rotate-90" />
        {t('common.back')}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={goBack}
      aria-label={t('common.back')}
      className={cn(
        'flex shrink-0 items-center justify-center text-[var(--rd-heading)] transition-transform active:scale-[0.96]',
        variant === 'mobile'
          ? 'rd-liquid-glass size-14 rounded-[24px]'
          : // Desktop. Wide screens: a bare chevron left of the page title, drawn
            // like part of it (title-sized, heading colour). Narrower desktops
            // have no margin for it, so it sits above the title as «‹ Назад».
            // A soft fill shows on hover only.
            'h-12 gap-1 rounded-full pl-1 pr-4 transition-colors hover:bg-[var(--rd-icon-btn)] min-[1600px]:w-12 min-[1600px]:p-0',
      )}
    >
      {/* 24px; the bare wide-screen chevron is title-sized (40px). */}
      <RdIcon
        name="cabinet/chevron-up"
        size={24}
        className={cn('-rotate-90', variant === 'desktop' && 'min-[1600px]:!size-10')}
      />
      {variant === 'desktop' && (
        <span className="rd-p-lg font-medium min-[1600px]:hidden">{t('common.back')}</span>
      )}
    </button>
  );
}

/**
 * The header's place for «Назад». Always mounted, so going between a menu
 * screen and a nested one animates: the slot widens from nothing and the button
 * grows out of the logo next to it (and shrinks back into it).
 */
export function BackSlot({
  visible,
  variant,
}: {
  visible: boolean;
  variant: 'mobile' | 'desktop';
}) {
  return (
    <div
      aria-hidden={!visible}
      inert={!visible}
      className={cn(
        'flex shrink-0 transition-[width,margin] duration-300 ease-out motion-reduce:transition-none',
        visible ? (variant === 'mobile' ? 'mr-3 w-14' : 'mr-3 w-[52px]') : 'mr-0 w-0',
      )}
    >
      <div
        className={cn(
          'origin-right transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none',
          visible ? 'scale-100 opacity-100' : 'pointer-events-none scale-50 opacity-0',
        )}
      >
        <BackButton variant={variant} />
      </div>
    </div>
  );
}
