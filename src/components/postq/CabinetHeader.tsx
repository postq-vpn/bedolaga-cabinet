import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { ticketNotificationsApi } from '@/api/ticketNotifications';
import { useAuthStore } from '@/store/auth';
import { RdIcon } from './RdIcon';
import { UserAvatar } from './UserAvatar';
import { RdImg } from './RdImg';
import { type MenuItem, UsefulMenu, useHoverMenu } from './SiteHeader';
import { ThemeIcon, useThemeSwitch } from './ThemeToggle';
import { USEFUL_LINKS } from './links';

const NEWS_URL = 'https://t.me/postq_news';

/** Desktop header of the cabinet (Figma "Навигация кабинета"): a frosted pill
 *  with the logo and sections on the left, separate pills for theme, support
 *  and profile on the right. Phones keep the upstream AppHeader + bottom nav. */
export function CabinetHeader() {
  const { t } = useTranslation();
  const location = useLocation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const useful = useHoverMenu();
  const { isDark, canToggle, switchTheme } = useThemeSwitch();

  // Same query (and cache key) as TicketNotificationBell, which stays mounted
  // in the mobile header and keeps it fresh over the websocket.
  const { data: unread } = useQuery({
    queryKey: ['ticket-notifications-count'],
    queryFn: ticketNotificationsApi.getUnreadCount,
    enabled: isAuthenticated,
    refetchInterval: 60000,
    staleTime: 30000,
  });
  const unreadCount = unread?.unread_count ?? 0;

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  const nav = [
    { label: t('nav.dashboard'), to: '/' },
    { label: t('nav.payment', 'Оплата'), to: '/balance' },
  ];

  const usefulItems: MenuItem[] = USEFUL_LINKS;

  // No colour for the current section (as on the site): every link is muted
  // and darkens on hover; aria-current still marks the page.
  const linkClass = (_active: boolean) =>
    'whitespace-nowrap text-[16px] text-[var(--rd-caption)] transition-colors hover:text-[var(--rd-heading)]';

  return (
    <header
      className="fixed inset-x-0 z-50 hidden px-6 lg:block"
      style={{ top: 'var(--rd-header-top)' }}
    >
      <div className="mx-auto flex max-w-[1728px] items-center gap-3">
        <div className="relative isolate mr-auto flex items-center gap-12 rounded-[25px] px-6 py-4">
          {/* Background on its own layer: a backdrop-filter on an ancestor
              would stop the dropdown's own blur from seeing the page. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 rounded-[25px] bg-[var(--rd-nav-bg)] [box-shadow:var(--rd-shadow)] backdrop-blur-xl will-change-[backdrop-filter]"
          />
          <Link to="/" aria-label={t('nav.dashboard')} className="shrink-0">
            <RdImg name="nav-logo" width={154} height={31} className="block h-[31px] w-auto" />
          </Link>
          <nav aria-label={t('nav.main', 'Навигация кабинета')} className="flex items-center gap-8">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                aria-current={isActive(item.to) ? 'page' : undefined}
                className={linkClass(isActive(item.to))}
              >
                {item.label}
              </Link>
            ))}
            <a
              href={NEWS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={linkClass(false)}
            >
              {t('nav.news', 'Новости')}
            </a>
            <UsefulMenu items={usefulItems} {...useful} linkClassName="text-[var(--rd-caption)]" />
          </nav>
        </div>

        {canToggle && (
          <button
            type="button"
            onClick={(e) => switchTheme(e.currentTarget)}
            aria-label={isDark ? 'Включить светлую тему' : 'Включить тёмную тему'}
            aria-pressed={isDark}
            className="rd-pill"
          >
            {/* Same 20 px box and 2.25/24 stroke (≈1.9 px) as the headphones. */}
            <ThemeIcon size={20} strokeWidth={2.25} />
            {t('nav.theme', 'Тема')}
          </button>
        )}
        <Link
          to="/support"
          aria-current={isActive('/support') ? 'page' : undefined}
          className="rd-pill relative gap-3"
        >
          <RdIcon name="cabinet/headphones-bold" size={20} />
          {t('nav.support')}
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-2 flex h-[21px] min-w-[21px] items-center justify-center rounded-full bg-[var(--rd-error)] px-1 text-[12px] leading-3 text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Link>
        <Link
          to="/profile"
          aria-current={isActive('/profile') ? 'page' : undefined}
          className="rd-pill rd-avatar-hover gap-2 !py-3 !pl-4"
        >
          <UserAvatar size={28} animate="hover" />
          {t('nav.profile')}
        </Link>
      </div>
    </header>
  );
}
