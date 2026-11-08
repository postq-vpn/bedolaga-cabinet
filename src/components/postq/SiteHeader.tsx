import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { RdIcon } from './RdIcon';
import { RdImg } from './RdImg';
import { ThemeToggleButton } from './ThemeToggle';
import { MARKETING_URL, SITE_NAV, USEFUL_LINKS, externalProps } from './links';

/* Every frosted layer also gets will-change: backdrop-filter: Chrome otherwise
   re-composites the blur a frame late on theme switch and the bar blinks. */
const GLASS = '[box-shadow:var(--rd-shadow)] backdrop-blur-xl will-change-[backdrop-filter]';
/** Frosted pill used for each separate piece of the bar on phones. */
const PILL =
  'max-sm:bg-[var(--rd-nav-bg)] max-sm:[box-shadow:var(--rd-shadow)] max-sm:backdrop-blur-xl max-sm:will-change-[backdrop-filter]';
const MENU_ITEM =
  'whitespace-nowrap rounded-[12px] px-4 py-3 text-[16px] text-[var(--rd-heading)] transition-colors hover:bg-[var(--rd-icon-btn)]';
const LOGIN_CLASS =
  'rounded-[15px] bg-[var(--rd-action)] px-6 py-3 text-[16px] font-medium leading-5 text-[var(--rd-on-action)] transition-colors hover:bg-[var(--rd-action-hover)]';

/** Open state for a header dropdown: hover on desktop (with a short grace
 *  delay on leave), click on touch, closes on outside click and Escape. */
export function useHoverMenu() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const hoverOpen = (next: boolean) => {
    if (!matchMedia('(hover: hover)').matches) return;
    clearTimeout(closeTimer.current);
    if (next) setOpen(true);
    else closeTimer.current = setTimeout(() => setOpen(false), 150);
  };
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return { open, setOpen, hoverOpen, containerRef };
}

/** Header of postq.space (Figma "Navbar"), used on the cabinet's public pages.
 *  Same markup and behaviour as postq-site's RdHeader. */
export function SiteHeader({ safeTop = 0 }: { safeTop?: number }) {
  const useful = useHoverMenu();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header
      className="fixed inset-x-0 z-50 px-2 sm:px-4"
      style={{ top: `calc(${safeTop}px + var(--rd-header-top, 12px))` }}
    >
      <div className="relative isolate mx-auto max-w-[1472px] sm:p-4">
        <div
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-0 -z-10 hidden rounded-[25px] bg-[var(--rd-nav-bg)] sm:block',
            GLASS,
          )}
        />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-12">
            <a
              href={`${MARKETING_URL}/`}
              aria-label="PostqVPN — на главную"
              className={cn(
                'flex h-14 shrink-0 items-center rounded-[25px] px-4 sm:h-auto sm:px-0',
                PILL,
              )}
            >
              <RdImg
                name="nav-logo"
                width={154}
                height={31}
                className="block h-[26px] w-auto sm:h-[31px]"
              />
            </a>
            <nav aria-label="Основная навигация" className="hidden items-center gap-8 lg:flex">
              {SITE_NAV.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="text-[16px] text-[var(--rd-nav-link)] transition-colors hover:text-[var(--rd-heading)]"
                >
                  {item.label}
                </a>
              ))}
              <UsefulMenu items={USEFUL_LINKS} {...useful} />
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggleButton className="hidden sm:flex" />
            {/* Language switch is in the design but hidden until there's more than Russian (same as the site). */}
            <a href="/login" className={cn('hidden sm:block', LOGIN_CLASS)}>
              Войти
            </a>
            <button
              type="button"
              aria-label="Меню"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className={cn('rd-icon-btn size-[43px] lg:hidden max-sm:size-14', PILL)}
            >
              <span aria-hidden className="flex w-[18px] flex-col gap-[5px]">
                <span
                  className={cn(
                    'h-[2px] rounded bg-[var(--rd-heading)] transition-transform',
                    menuOpen && 'translate-y-[7px] rotate-45',
                  )}
                />
                <span
                  className={cn(
                    'h-[2px] rounded bg-[var(--rd-heading)] transition-opacity',
                    menuOpen && 'opacity-0',
                  )}
                />
                <span
                  className={cn(
                    'h-[2px] rounded bg-[var(--rd-heading)] transition-transform',
                    menuOpen && '-translate-y-[7px] -rotate-45',
                  )}
                />
              </span>
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav
            aria-label="Мобильная навигация"
            className={cn(
              'mt-3 flex flex-col gap-1 lg:hidden max-sm:rounded-[25px] max-sm:p-3 sm:border-t sm:border-[var(--rd-divider)] sm:pt-3',
              PILL,
            )}
          >
            {[...SITE_NAV, ...USEFUL_LINKS].map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-[12px] px-3 py-3 text-[16px] text-[var(--rd-heading)] hover:bg-[var(--rd-icon-btn)]"
                {...externalProps(item.href)}
              >
                {item.label}
              </a>
            ))}
            <div className="mt-2 flex items-center gap-3 sm:hidden">
              <a href="/login" className={cn('flex-1 text-center', LOGIN_CLASS)}>
                Войти
              </a>
              <ThemeToggleButton />
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}

/** "Полезное ▾" dropdown shared by the site header and the cabinet header. */
export interface MenuItem {
  label: string;
  href: string;
  /** In-app route (react-router) rather than an external page. */
  internal?: boolean;
}

export function UsefulMenu({
  items,
  open,
  setOpen,
  hoverOpen,
  containerRef,
  linkClassName = 'text-[var(--rd-nav-link)]',
}: {
  items: MenuItem[];
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  hoverOpen: (open: boolean) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  linkClassName?: string;
}) {
  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={() => hoverOpen(true)}
      onMouseLeave={() => hoverOpen(false)}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        // A mouse click while hover already opened it shouldn't close it;
        // keyboard (detail 0) and touch still toggle.
        onClick={(e) =>
          setOpen((v) => (e.detail > 0 && matchMedia('(hover: hover)').matches) || !v)
        }
        className={cn(
          'flex cursor-pointer items-center gap-1 text-[16px] transition-colors hover:text-[var(--rd-heading)]',
          open ? 'text-[var(--rd-heading)]' : linkClassName,
        )}
      >
        Полезное
        <RdIcon
          name="nav-chevron-mono"
          size={13}
          className={cn('transition-transform duration-300', open && 'rotate-180')}
        />
      </button>
      {/* pt bridges the gap to the panel so hover isn't lost on the way; the
          slide stays on this wrapper and the fade on the panel, otherwise the
          panel's backdrop blur is cut off until the fade ends. */}
      <div
        inert={!open}
        className={cn(
          'absolute left-1/2 top-full -z-20 -translate-x-1/2 pt-8 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
          open ? 'translate-y-0' : 'pointer-events-none -translate-y-4',
        )}
      >
        <div
          className={cn(
            'flex min-w-[220px] flex-col gap-1 rounded-[20px] bg-[var(--rd-menu-bg)] p-2 transition-opacity duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
            GLASS,
            open ? 'opacity-100' : 'opacity-0',
          )}
        >
          {items.map((item) =>
            item.internal ? (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => setOpen(false)}
                className={MENU_ITEM}
              >
                {item.label}
              </Link>
            ) : (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={MENU_ITEM}
                {...externalProps(item.href)}
              >
                {item.label}
              </a>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
