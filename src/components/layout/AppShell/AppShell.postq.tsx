import { useEffect, type CSSProperties } from 'react';
import { useLocation } from 'react-router';

import { useHeaderHeight } from '@/hooks/useHeaderHeight';
import { useScrollRestoration } from '@/hooks/useScrollRestoration';
import { resetVirtualKeyboard } from '@/hooks/useVirtualKeyboard';

import WebSocketNotifications from '@/components/WebSocketNotifications';
import CampaignBonusNotifier from '@/components/CampaignBonusNotifier';
import SuccessNotificationModal from '@/components/SuccessNotificationModal';
import { PromptDialogHost } from '@/components/PromptDialogHost';

import { MobileHeader, MobileTabBar, isMobileTabScreen } from '@/components/postq/MobileNav';
import { useChatFocus } from '@/components/postq/chatFocus';
import { CabinetHeader } from '@/components/postq/CabinetHeader';
import { usePendingPurchase } from '@/components/postq/purchase/usePendingPurchase';
import { useBackgroundConsumer } from '@/components/backgrounds/BackgroundHost';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const location = useLocation();
  // Telegram fullscreen Mini App: status bar and its buttons sit over the page.
  const { topSafeArea } = useHeaderHeight();
  useScrollRestoration();
  // postq: issues a subscription paid for via top-up as soon as the money lands.
  usePendingPurchase();
  // Анимированный фон рендерит BackgroundHost в App (не перемонтируется при
  // смене роута) — здесь только регистрируем, что на этом роуте он нужен.
  useBackgroundConsumer();

  // Смена экрана закрывает сигнал «клавиатура открыта» (useVirtualKeyboard):
  // поле с фокусом размонтировано, blur не приходит, и прижатые к низу элементы
  // иначе остаются спрятанными.
  // biome-ignore lint/correctness/useExhaustiveDependencies: путь нужен как триггер — сброс на каждой смене экрана
  useEffect(() => {
    resetVirtualKeyboard();
  }, [location.pathname]);

  // Нижняя панель живёт только на экранах своих кнопок; на остальных её нет и
  // место под неё не резервируется (data-mobile-nav="off" → --mobile-nav-clearance).
  // An open support ticket on a phone is a chat: no header, no tab bar.
  const chatFocus = useChatFocus((st) => st.chatFocus);
  const showMobileNav = isMobileTabScreen(location.pathname) && !chatFocus;

  return (
    <div
      className="min-h-viewport"
      data-mobile-nav={showMobileNav ? 'on' : 'off'}
      style={{ '--rd-top-inset': `${topSafeArea}px` } as CSSProperties}
    >
      {/* Global components */}
      <WebSocketNotifications />
      <CampaignBonusNotifier />
      <SuccessNotificationModal />
      <PromptDialogHost />

      {/* Desktop Header — postq design (Figma «Навигация кабинета») */}
      <CabinetHeader />

      {/* Phone header — postq-site's mobile bar: logo and burger pills. */}
      {!chatFocus && <MobileHeader topInset={topSafeArea} />}

      {/* Desktop spacer: the floating header (top offset + 63px pill) and the
          gap to the page title from the cabinet frames. */}
      <div className="hidden h-[122px] lg:block" />

      {/* Mobile spacer: top offset + the 56px fixed header pills (main adds the gap). */}
      <div
        className="lg:hidden"
        style={{ height: chatFocus ? `${topSafeArea}px` : `calc(68px + ${topSafeArea}px)` }}
      />

      {/* Main content */}
      {/* Боковые отступы не меньше вырезов (альбомная ориентация iPhone); снизу —
          просвет под панелью: фиксированные 112px в standalone iOS не хватало,
          и низ контента уходил под неё. */}
      <main className="mx-auto max-w-6xl py-6 lg:max-w-[1488px] pb-[calc(var(--mobile-nav-clearance)+0.5rem)] pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] lg:px-6 lg:pb-8">
        {children}
      </main>

      {/* Mobile Bottom Navigation — только на экранах её кнопок */}
      {showMobileNav && <MobileTabBar />}
    </div>
  );
}
