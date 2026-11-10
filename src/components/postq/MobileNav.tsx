import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { ticketNotificationsApi } from '@/api/ticketNotifications';
import { balanceApi } from '@/api/balance';
import { API } from '@/config/constants';
import { useCurrency } from '@/hooks/useCurrency';
import { HIDDEN_UNDER_KEYBOARD, useVirtualKeyboard } from '@/hooks/useVirtualKeyboard';
import { cn } from '@/lib/utils';
import { usePlatform } from '@/platform';
import { useAuthStore } from '@/store/auth';
import { BackSlot, useShowBackButton } from './BackButton';
import { useDashboardAccent } from './dashboardAccent';
import { RdIcon } from './RdIcon';
import { RdImg } from './RdImg';
import { ThemeIcon, useThemeSwitch } from './ThemeToggle';
import { UserAvatar } from './UserAvatar';
import { USEFUL_LINKS, externalProps } from './links';

const NEWS_URL = 'https://t.me/postq_news';

export { MOBILE_TABS, isMobileTabScreen } from './menuScreens';

function useUnreadTickets(): number {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  // Same query (and cache key) as the desktop header.
  const { data } = useQuery({
    queryKey: ['ticket-notifications-count'],
    queryFn: ticketNotificationsApi.getUnreadCount,
    enabled: isAuthenticated,
    refetchInterval: 60000,
    staleTime: 30000,
  });
  return data?.unread_count ?? 0;
}

/**
 * Phone header of the cabinet: the logo and the balance as two separate
 * frosted pills (postq-site's mobile header). The balance leads to «Оплата».
 * There is no burger: gifts and referrals are on the dashboard, theme and
 * links in the profile (MobileMoreCard), the main sections in the bottom bar.
 */
export function MobileHeader({ topInset }: { topInset: number }) {
  const { t } = useTranslation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { formatAmount, currencySymbol } = useCurrency();
  const { data: balance } = useQuery({
    queryKey: ['balance'],
    queryFn: balanceApi.getBalance,
    enabled: isAuthenticated,
    staleTime: API.BALANCE_STALE_TIME_MS,
  });
  const rubles = balance?.balance_rubles;
  const softTopUp = useDashboardAccent((st) => st.softTopUp);
  const showBack = useShowBackButton();

  return (
    // Fixed: two compact 56px glass pills — the logo, and the balance with a
    // top-up plus — so the header can stay on screen while the page scrolls.
    <header
      className="fixed inset-x-0 z-40 px-[max(1rem,env(safe-area-inset-left,0px))] lg:hidden"
      style={{ top: `calc(12px + ${topInset}px)` }}
    >
      <div className="flex items-center justify-between gap-3">
        {/* Off the menu's screens the logo «splits»: the wordmark slides away
            into the mark and «Назад» grows out of it on the left, so the
            balance pill still fits. One image, clipped — no swap. */}
        <div className="flex shrink-0 items-center">
          <BackSlot visible={showBack} variant="mobile" />
          <Link
            to="/"
            aria-label={t('nav.dashboard')}
            className="rd-liquid-glass flex h-14 shrink-0 items-center rounded-[24px] px-4"
          >
            {/* 26px = the mark at this height. Narrow phones (iPhone SE 1st
                gen, 320px) always show the mark alone. */}
            <span
              className={cn(
                'block h-[26px] overflow-hidden transition-[width] duration-300 ease-out motion-reduce:transition-none',
                showBack ? 'w-[26px]' : 'w-[26px] min-[360px]:w-[129px]',
              )}
            >
              <RdImg
                name="nav-logo"
                width={154}
                height={31}
                className="block h-[26px] w-auto max-w-none"
              />
            </span>
          </Link>
        </div>
        {/* Balance: the amount and a plus that tops up; the whole pill leads
            to «Оплата». */}
        <Link
          to="/balance"
          data-onboarding="balance"
          aria-label={`${t('postq.dashboard.balance')}: ${t('postq.dashboard.topUp')}`}
          className="rd-liquid-glass flex h-14 min-w-0 shrink items-center gap-3 rounded-[24px] pl-4 pr-3 transition-transform active:scale-[0.98]"
        >
          <span className="truncate whitespace-nowrap text-[20px] font-bold leading-6 text-[var(--rd-heading)]">
            {rubles == null
              ? '—'
              : `${formatAmount(rubles, Number.isInteger(rubles) ? 0 : 2)}\u00A0${currencySymbol}`}
          </span>
          <span
            aria-hidden
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-[12px] transition-colors',
              softTopUp
                ? 'bg-[var(--rd-action-soft)] text-[var(--rd-on-soft)]'
                : 'bg-[var(--rd-action)] text-[var(--rd-on-action)]',
            )}
          >
            <RdIcon name="cabinet/plus" size={16} />
          </span>
        </Link>
      </div>
    </header>
  );
}

/**
 * Phones only (no burger there): theme and the outside links, at the bottom of
 * the profile.
 */
export function MobileMoreCard() {
  const { t } = useTranslation();
  const { isDark, canToggle, switchTheme } = useThemeSwitch();
  const links = [{ label: t('nav.news', 'Новости'), href: NEWS_URL }, ...USEFUL_LINKS];
  const rowClass =
    'rd-p-lg flex min-h-14 items-center justify-between gap-3 py-3 text-[var(--rd-heading)]';

  // Rows are 56px with the text centred, so 8px of card padding puts the
  // first and last labels 24px from the edge — same as on the sides.
  return (
    <section className="rd-card flex flex-col !py-2 lg:hidden">
      {canToggle && (
        <button
          type="button"
          onClick={(e) => switchTheme(e.currentTarget)}
          className={cn(rowClass, 'border-b border-[var(--rd-divider)] text-left')}
        >
          {isDark ? t('postq.more.lightTheme') : t('postq.more.darkTheme')}
          <span className="text-[var(--rd-caption)]">
            <ThemeIcon size={20} strokeWidth={2} />
          </span>
        </button>
      )}
      {links.map((item, i) => (
        <a
          key={item.href}
          href={item.href}
          {...externalProps(item.href)}
          className={cn(rowClass, i < links.length - 1 && 'border-b border-[var(--rd-divider)]')}
        >
          {item.label}
          <RdIcon name="cabinet/arrow-up-right" size={20} className="text-[var(--rd-caption)]" />
        </a>
      ))}
    </section>
  );
}

/** Bottom bar on phones: the cabinet's main sections. */
export function MobileTabBar({ hidden }: { hidden?: boolean }) {
  const { t } = useTranslation();
  const location = useLocation();
  const { haptic } = usePlatform();
  const isKeyboardOpen = useVirtualKeyboard();
  const unread = useUnreadTickets();

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  const tabs = [
    { to: '/', label: t('nav.dashboard'), icon: 'cabinet/home' },
    { to: '/balance', label: t('nav.payment', 'Оплата'), icon: 'cabinet/credit-card' },
    { to: '/support', label: t('nav.support'), icon: 'cabinet/headphones-bold', badge: unread },
    { to: '/profile', label: t('nav.profile'), icon: null },
  ];

  const activeIndex = tabs.findIndex((tab) => isActive(tab.to));

  return (
    <nav
      aria-label={t('nav.main', 'Навигация кабинета')}
      className={cn(
        'fixed z-50 flex h-[var(--mobile-nav-height)] items-stretch gap-1 rounded-[25px] p-2 transition-opacity duration-200 lg:hidden',
        'rd-liquid-glass',
        (isKeyboardOpen || hidden) && HIDDEN_UNDER_KEYBOARD,
      )}
      style={{
        bottom: 'var(--mobile-nav-offset)',
        left: 'max(16px, env(safe-area-inset-left, 0px))',
        right: 'max(16px, env(safe-area-inset-right, 0px))',
      }}
    >
      <div className="relative flex flex-1 items-stretch gap-1">
        {/* One lozenge that slides to the active tab (iOS tab bar), instead of
          each tab painting its own background. */}
        <span
          aria-hidden
          className={cn(
            'rd-liquid-glass__active rd-liquid-glass__slider pointer-events-none absolute inset-y-0 left-0 rounded-[18px]',
            activeIndex < 0 && 'opacity-0',
          )}
          style={{
            width: `calc((100% - ${(tabs.length - 1) * 4}px) / ${tabs.length})`,
            transform: `translateX(calc(${Math.max(activeIndex, 0)} * (100% + 4px)))`,
          }}
        />
        {tabs.map((tab) => {
          const active = isActive(tab.to);
          return (
            <Link
              key={tab.to}
              to={tab.to}
              aria-current={active ? 'page' : undefined}
              onClick={() => haptic.impact('light')}
              className={cn(
                'relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-[18px] transition-[color,transform] duration-200 active:scale-[0.92]',
                active
                  ? 'text-[var(--rd-heading)]'
                  : 'text-[var(--rd-body)] hover:text-[var(--rd-heading)]',
              )}
            >
              <span className="relative flex size-6 items-center justify-center">
                {tab.icon ? <RdIcon name={tab.icon} size={22} /> : <UserAvatar size={24} />}
                {!!tab.badge && (
                  <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--rd-action)] px-1 text-[12px] font-medium leading-none text-white">
                    {tab.badge > 9 ? '9+' : tab.badge}
                  </span>
                )}
              </span>
              <span className="max-w-full truncate px-1 text-[12px] font-medium leading-4">
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
