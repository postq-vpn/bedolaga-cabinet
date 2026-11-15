import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useHeaderHeight } from '@/hooks/useHeaderHeight';
import { sheetInsets } from '@/components/ui/sheetInsets';
import { RdIcon } from './RdIcon';

/** Gap between the card and whatever lies above / below it (Telegram chrome, screen edge). */
const EDGE_GAP_PX = 16;
/** Pulling the sheet down by this much (or flicking it) closes it. */
const DRAG_CLOSE_PX = 96;
const DRAG_CLOSE_VELOCITY = 0.6; // px per ms
const PHONE_QUERY = '(max-width: 639px)';

function useIsPhone(): boolean {
  const [isPhone, setIsPhone] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.(PHONE_QUERY).matches,
  );
  useEffect(() => {
    const query = window.matchMedia?.(PHONE_QUERY);
    if (!query) return;
    const onChange = (event: MediaQueryListEvent) => setIsPhone(event.matches);
    query.addEventListener('change', onChange);
    setIsPhone(query.matches);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return isPhone;
}

/**
 * The postq dialog: dimmed backdrop, a centred card (scrolls when tall), a
 * heading with an optional caption and the round close button. Shared by the
 * devices, top-up and documents dialogs.
 *
 * `sheet`: on phones the same dialog slides up from the bottom edge instead —
 * the heading stays pinned while the content scrolls under it, and the sheet
 * is pulled down by its handle to close. Desktop keeps the centred card.
 */
export function RdDialog({
  open,
  onOpenChange,
  title,
  description,
  hideDescription = false,
  wide = false,
  sheet = false,
  pinned,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** Caption under the title; also the accessible description. */
  description?: ReactNode;
  /** Keep the description for screen readers only (it is, too, when absent: the title is read). */
  hideDescription?: boolean;
  /** 720px instead of 560px — for long texts. */
  wide?: boolean;
  /** Bottom sheet on phones (centred card from `sm`). */
  sheet?: boolean;
  /** Pinned under the heading in the sheet (stays while the content scrolls); right after it in the card. */
  pinned?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const asSheet = sheet && isPhone;

  // In fullscreen Telegram the status bar and the «Закрыть / ⌄ …» buttons lie
  // over the page, the Home bar below it: the card is centred in what is left
  // between them and never grows under either (88vh of the whole screen did).
  const { topSafeArea, bottomSafeArea } = useHeaderHeight();
  const topInset =
    topSafeArea > 0
      ? `${topSafeArea + EDGE_GAP_PX}px`
      : `max(${EDGE_GAP_PX}px, env(safe-area-inset-top, 0px))`;
  const bottomInset = `max(${EDGE_GAP_PX}px, env(safe-area-inset-bottom, 0px), ${bottomSafeArea + EDGE_GAP_PX}px)`;
  const sheetGeometry = sheetInsets({ snap: 1, topSafeArea, bottomSafeArea });

  // Pull-to-close for the sheet: only the handle/heading drags, so scrolling
  // the content never fights the gesture.
  const [dragY, setDragY] = useState(0);
  const drag = useRef<{ startY: number; lastY: number; lastT: number; v: number } | null>(null);
  useEffect(() => {
    if (!open) setDragY(0);
  }, [open]);
  const onDragStart = (e: React.TouchEvent) => {
    const y = e.touches[0].clientY;
    drag.current = { startY: y, lastY: y, lastT: Date.now(), v: 0 };
  };
  const onDragMove = (e: React.TouchEvent) => {
    const state = drag.current;
    if (!state) return;
    const y = e.touches[0].clientY;
    const now = Date.now();
    if (now > state.lastT) state.v = (y - state.lastY) / (now - state.lastT);
    state.lastY = y;
    state.lastT = now;
    setDragY(Math.max(0, y - state.startY));
  };
  const onDragEnd = () => {
    const state = drag.current;
    drag.current = null;
    if (!state) return;
    if (dragY > DRAG_CLOSE_PX || state.v > DRAG_CLOSE_VELOCITY) onOpenChange(false);
    else setDragY(0);
  };

  const heading = (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-1">
        <DialogPrimitive.Title className="rd-h5 text-[var(--rd-heading)]">
          {title}
        </DialogPrimitive.Title>
        <DialogPrimitive.Description
          className={
            hideDescription || !description ? 'sr-only' : 'rd-p-md text-[var(--rd-caption)]'
          }
        >
          {description ?? title}
        </DialogPrimitive.Description>
      </div>
      <DialogPrimitive.Close
        aria-label={t('common.close')}
        className="rd-icon-btn size-8 shrink-0 bg-[var(--rd-field)] text-[var(--rd-body)]"
      >
        <RdIcon name="cabinet/x" size={16} />
      </DialogPrimitive.Close>
    </div>
  );

  return (
    // Children never shrink: in a scrolling column the browser squeezes them
    // to fit instead of scrolling, and the progress bar collapsed to 0 px.
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-fade-in" />
        {asSheet ? (
          <DialogPrimitive.Content
            className="rd-sheet fixed inset-x-0 bottom-0 z-50 flex flex-col overflow-hidden rounded-t-[var(--rd-radius-md)] bg-[var(--rd-surface)] shadow-[0_-12px_48px_rgba(0,0,0,0.18)] focus:outline-none"
            style={{
              // Same geometry as every other sheet in the cabinet: below the
              // environment's own top chrome — Telegram's status bar and
              // «Закрыть / ⌄ …» in fullscreen (SDK insets + its header), the
              // notch / status bar in a browser or home-screen app.
              maxHeight: sheetGeometry.maxHeight,
              transform: dragY ? `translateY(${dragY}px)` : undefined,
              transition: drag.current ? 'none' : 'transform 0.25s ease-out',
            }}
          >
            {/* Handle + pinned heading: the drag area. */}
            <div
              className="shrink-0 touch-none px-6 pb-4"
              onTouchStart={onDragStart}
              onTouchMove={onDragMove}
              onTouchEnd={onDragEnd}
              onTouchCancel={onDragEnd}
            >
              <div className="flex justify-center py-3">
                <span aria-hidden className="h-1 w-10 rounded-full bg-[var(--rd-border)]" />
              </div>
              {heading}
              {pinned && <div className="pt-4">{pinned}</div>}
            </div>
            <div
              className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain px-6 pt-2 [&>*]:shrink-0"
              style={{ paddingBottom: `max(24px, ${sheetGeometry.paddingBottom})` }}
            >
              {children}
            </div>
          </DialogPrimitive.Content>
        ) : (
          <DialogPrimitive.Content
            className={cn(
              'fixed left-1/2 z-50 flex w-[calc(100%-32px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-6 overflow-y-auto [&>*]:shrink-0 rounded-[var(--rd-radius-md)] bg-[var(--rd-surface)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.18)] focus:outline-none data-[state=open]:animate-fade-in sm:p-8',
              wide ? 'max-w-[720px]' : 'max-w-[560px]',
            )}
            style={{
              top: `calc(${topInset} + (100% - ${topInset} - ${bottomInset}) / 2)`,
              maxHeight: `min(88vh, calc(var(--tg-viewport-stable-height, 100dvh) - ${topInset} - ${bottomInset}))`,
            }}
          >
            {heading}
            {pinned}
            {children}
          </DialogPrimitive.Content>
        )}
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
