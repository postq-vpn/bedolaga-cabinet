import { flushSync } from 'react-dom';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';

type ViewTransitionDoc = Document & {
  startViewTransition?: (update: () => void) => { ready: Promise<void>; finished: Promise<void> };
};

/** Moon in the light theme, sun in the dark one; shapes cross-fade (CSS in postq.css). */
export function ThemeIcon({ size = 20, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg
      aria-hidden
      className="rd-theme-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <g className="rd-theme-icon__moon">
        <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z" />
      </g>
      <g className="rd-theme-icon__sun">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </g>
    </svg>
  );
}

/** Theme switch with the site's circular reveal growing from the button
 *  (View Transitions API); instant where unsupported or motion is reduced. */
export function useThemeSwitch() {
  const { isDark, toggleTheme, canToggle } = useTheme();

  const switchTheme = (button: HTMLElement) => {
    const doc = document as ViewTransitionDoc;
    const apply = () => {
      // useTheme applies the class in an effect; set it here as well so the
      // view transition snapshots the new theme.
      const root = document.documentElement;
      root.classList.remove(isDark ? 'dark' : 'light');
      root.classList.add(isDark ? 'light' : 'dark');
      flushSync(() => toggleTheme());
    };
    if (!doc.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      apply();
      return;
    }
    const rect = button.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const root = doc.documentElement;
    root.classList.add('rd-theme-vt');
    const vt = doc.startViewTransition(apply);
    vt.finished.finally(() => root.classList.remove('rd-theme-vt'));
    vt.ready
      .then(() => {
        root.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
          {
            duration: 500,
            easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
            pseudoElement: '::view-transition-new(root)',
          },
        );
      })
      .catch(() => {});
  };

  return { isDark, canToggle, switchTheme };
}

/** Round 43px button (site header). */
export function ThemeToggleButton({ className }: { className?: string }) {
  const { isDark, canToggle, switchTheme } = useThemeSwitch();
  if (!canToggle) return null;
  return (
    <button
      type="button"
      aria-label={isDark ? 'Включить светлую тему' : 'Включить тёмную тему'}
      aria-pressed={isDark}
      onClick={(e) => switchTheme(e.currentTarget)}
      className={cn('rd-icon-btn size-[43px] p-[10px]', className)}
    >
      <ThemeIcon size={23} />
    </button>
  );
}
