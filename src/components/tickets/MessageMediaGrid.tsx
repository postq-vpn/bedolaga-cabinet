import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { ChevronLeftIcon, ChevronRightIcon, DocumentIcon } from '@/components/icons';
import { RdIcon } from '@/components/postq/RdIcon';
import { useBackHandler } from '@/components/postq/backOverride';
import { useHeaderHeight } from '@/hooks/useHeaderHeight';

import { ticketsApi } from '../../api/tickets';

export interface MediaItem {
  type: string;
  file_id: string;
  caption?: string | null;
  /** Signed, expiring download token from the ticket response. */
  token?: string | null;
}

interface MessageLike {
  has_media?: boolean;
  media_type?: string | null;
  media_file_id?: string | null;
  media_token?: string | null;
  media_caption?: string | null;
  media_items?: MediaItem[] | null;
}

/**
 * Normalize message media into a unified list.
 * If media_items is present, use it. Otherwise fall back to legacy single-media fields.
 */
function getItems(message: MessageLike): MediaItem[] {
  if (message.media_items && message.media_items.length > 0) {
    return message.media_items;
  }
  if (message.media_file_id && message.media_type) {
    return [
      {
        type: message.media_type,
        file_id: message.media_file_id,
        caption: message.media_caption,
        token: message.media_token,
      },
    ];
  }
  return [];
}

/**
 * Attachments inside a chat bubble: photos as small thumbnails (a screenshot
 * shouldn't take the whole chat), a tap opens them full screen.
 */
export function MessageMediaGrid({
  message,
  translateError = 'Failed to load image',
}: {
  message: MessageLike;
  translateError?: string;
}) {
  const { t } = useTranslation();
  const items = getItems(message);
  const photoItems = items.filter((i) => i.type === 'photo');
  const otherItems = items.filter((i) => i.type !== 'photo');

  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const closeViewer = useCallback(() => setViewerIndex(null), []);

  if (items.length === 0) return null;

  const visiblePhotos = photoItems.slice(0, 4);
  const hiddenCount = photoItems.length - visiblePhotos.length;
  const single = photoItems.length === 1;

  return (
    <div className="flex flex-col gap-2">
      {single ? (
        <button
          type="button"
          onClick={() => setViewerIndex(0)}
          aria-label={t('postq.media.open', 'Открыть фото')}
          className="block w-fit max-w-full overflow-hidden rounded-[12px] bg-[var(--rd-chip)]"
        >
          <img
            src={ticketsApi.getMediaUrl(photoItems[0].file_id, photoItems[0].token)}
            alt={photoItems[0].caption || ''}
            className="block max-h-[220px] min-h-[64px] w-auto min-w-[64px] max-w-full object-cover transition-opacity hover:opacity-90"
            loading="lazy"
          />
        </button>
      ) : (
        photoItems.length > 0 && (
          <div
            className={`grid w-[min(100%,260px)] gap-1 ${photoItems.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}
          >
            {visiblePhotos.map((item, idx) => {
              const more = idx === visiblePhotos.length - 1 && hiddenCount > 0;
              return (
                <button
                  key={`${item.file_id}-${idx}`}
                  type="button"
                  onClick={() => setViewerIndex(idx)}
                  aria-label={t('postq.media.open', 'Открыть фото')}
                  className="relative aspect-square overflow-hidden rounded-[10px] bg-[var(--rd-chip)]"
                >
                  <img
                    src={ticketsApi.getMediaUrl(item.file_id, item.token)}
                    alt={item.caption || ''}
                    className="h-full w-full object-cover transition-opacity hover:opacity-90"
                    loading="lazy"
                  />
                  {more && (
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/55 text-[20px] font-semibold text-white">
                      +{hiddenCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )
      )}

      {otherItems.map((item) => {
        const mediaUrl = ticketsApi.getMediaUrl(item.file_id, item.token);
        if (item.type === 'video') {
          return (
            <div key={item.file_id} className="flex flex-col gap-1">
              <video
                src={mediaUrl}
                controls
                playsInline
                className="max-h-[220px] max-w-full rounded-[12px] bg-black"
                preload="metadata"
              />
              {item.caption && <p className="rd-p-sm text-[var(--rd-caption)]">{item.caption}</p>}
            </div>
          );
        }
        return (
          <a
            key={item.file_id}
            href={mediaUrl}
            target="_blank"
            rel="noopener noreferrer"
            // A long file name wraps inside the bubble instead of pushing it out.
            className="rd-p-md inline-flex max-w-full items-center gap-2 self-start rounded-[12px] bg-[var(--rd-chip)] px-3 py-2 text-[var(--rd-heading)] transition-colors hover:bg-[var(--rd-chip-hover)]"
          >
            <DocumentIcon className="h-4 w-4 shrink-0" />
            <span className="min-w-0 [overflow-wrap:anywhere]">
              {item.caption || t('support.downloadFile')}
            </span>
          </a>
        );
      })}

      {viewerIndex !== null && photoItems[viewerIndex] && (
        <PhotoViewer
          items={photoItems}
          index={viewerIndex}
          onIndex={setViewerIndex}
          onClose={closeViewer}
        />
      )}

      {photoItems.length === 0 && otherItems.length === 0 && (
        <div className="rd-p-sm text-[var(--rd-caption)]">{translateError}</div>
      )}
    </div>
  );
}

/**
 * Full-screen photo. «Назад» closes it everywhere: its own button (below the
 * Telegram fullscreen controls), Telegram's native Back, Escape, a swipe down
 * or a tap beside the photo. Swipe or arrows go between the message's photos.
 */
function PhotoViewer({
  items,
  index,
  onIndex,
  onClose,
}: {
  items: MediaItem[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { topSafeArea } = useHeaderHeight();
  const item = items[index];
  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;

  useBackHandler(true, onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && hasPrev) onIndex(index - 1);
      else if (e.key === 'ArrowRight' && hasNext) onIndex(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, hasPrev, hasNext, onIndex, onClose]);

  // The page under it doesn't scroll while the photo is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // One-finger swipes: sideways — the next/previous photo, down — close.
  // Two fingers are a pinch-zoom and are left to the browser.
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touch.current =
      e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start || e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0 && hasNext) onIndex(index + 1);
      else if (dx > 0 && hasPrev) onIndex(index - 1);
    } else if (dy > 90 && dy > Math.abs(dx) * 1.5) {
      onClose();
    }
  };

  const glassBtn =
    'flex size-12 shrink-0 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md transition-colors hover:bg-white/25 active:scale-[0.96] disabled:opacity-30';

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('postq.media.viewer', 'Просмотр фото')}
      className="fixed inset-0 z-[9999] flex flex-col bg-black/95"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div
        className="flex shrink-0 items-center gap-3 px-4 pb-3"
        style={{
          paddingTop: `calc(max(${topSafeArea}px, env(safe-area-inset-top, 0px)) + 12px)`,
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.back')}
          className="flex h-12 items-center gap-1 rounded-full bg-white/15 pl-2 pr-4 text-white backdrop-blur-md transition-colors hover:bg-white/25 active:scale-[0.96]"
        >
          <RdIcon name="cabinet/chevron-up" size={24} className="-rotate-90" />
          <span className="rd-p-md font-medium">{t('common.back')}</span>
        </button>
        {items.length > 1 && (
          <span className="rd-p-md ml-auto text-white/80">
            {index + 1} / {items.length}
          </span>
        )}
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-[max(16px,env(safe-area-inset-bottom,0px))]"
        onClick={onClose}
      >
        <img
          key={item.file_id}
          src={ticketsApi.getMediaUrl(item.file_id, item.token)}
          alt={item.caption || ''}
          className="max-h-full max-w-full select-none object-contain"
          style={{ touchAction: 'pinch-zoom' }}
          onClick={(e) => e.stopPropagation()}
          draggable={false}
        />
        {items.length > 1 && (
          <>
            <button
              type="button"
              disabled={!hasPrev}
              onClick={(e) => {
                e.stopPropagation();
                onIndex(index - 1);
              }}
              aria-label={t('postq.media.prev', 'Предыдущее фото')}
              className={`${glassBtn} absolute left-4 top-1/2 hidden -translate-y-1/2 sm:flex`}
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
            <button
              type="button"
              disabled={!hasNext}
              onClick={(e) => {
                e.stopPropagation();
                onIndex(index + 1);
              }}
              aria-label={t('postq.media.next', 'Следующее фото')}
              className={`${glassBtn} absolute right-4 top-1/2 hidden -translate-y-1/2 sm:flex`}
            >
              <ChevronRightIcon className="h-5 w-5" />
            </button>
          </>
        )}
      </div>
      {item.caption && (
        <p className="rd-p-md shrink-0 px-4 pb-[max(16px,env(safe-area-inset-bottom,0px))] text-center text-white/80">
          {item.caption}
        </p>
      )}
    </div>,
    document.body,
  );
}
