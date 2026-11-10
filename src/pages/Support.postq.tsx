import { getLocalizedApiErrorMessage } from '../utils/api-error-display';
import { uiLocale } from '@/utils/uiLocale';
import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ticketsApi } from '../api/tickets';
import { MessageMediaGrid } from '../components/tickets/MessageMediaGrid';
import { infoApi } from '../api/info';
import { useAuthStore } from '../store/auth';
import { logger } from '../utils/logger';
import { checkRateLimit, getRateLimitResetTime, RATE_LIMIT_KEYS } from '../utils/rateLimit';

import { isOpenTicketConflict } from '../utils/ticketErrors';
import type { SupportConfig, TicketDetail } from '../types';
import { Card } from '@/components/data-display/Card';
import { Button } from '@/components/primitives/Button';
import { ChatIcon, CloseIcon } from '@/components/icons';
import { usePlatform } from '@/platform';
import { linkifyText } from '../utils/linkify';
import { resolveSupportContact } from '../utils/supportContact';
import { RdIcon } from '@/components/postq/RdIcon';
import { RdImg } from '@/components/postq/RdImg';
import { SUPPORT_BOT_URL } from '@/components/postq/links';
import { useChatFocus } from '@/components/postq/chatFocus';
import { BackButton } from '@/components/postq/BackButton';
import { useBackHandler } from '@/components/postq/backOverride';
import { useVirtualKeyboard } from '@/hooks/useVirtualKeyboard';
import { useKeyboardVisibleHeight, useVisualViewportHeight } from '@/hooks/useVisualViewportHeight';
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton';

const log = logger.createLogger('Support');

const MEDIA_TYPES: Record<string, 'photo' | 'video'> = {
  'image/jpeg': 'photo',
  'image/png': 'photo',
  'image/gif': 'photo',
  'image/webp': 'photo',
  'video/mp4': 'video',
  'video/webm': 'video',
  'video/quicktime': 'video',
};

// Media attachment state
interface MediaAttachment {
  id: string;
  file: File;
  preview: string;
  mediaType: 'photo' | 'video';
  uploading: boolean;
  fileId?: string;
  error?: string;
}

const DESKTOP_QUERY = '(min-width: 1024px)';

/** Desktop shows the list and the chat side by side; a phone shows one at a time. */
function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(() =>
    typeof window.matchMedia === 'function' ? window.matchMedia(DESKTOP_QUERY).matches : true,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => setDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return desktop;
}

export default function Support() {
  log.debug('Component loaded');

  const { t } = useTranslation();
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const queryClient = useQueryClient();
  const { openTelegramLink, openLink, capabilities } = usePlatform();

  const openSupportContact = useCallback(
    (config: SupportConfig) => {
      const target = resolveSupportContact(config);
      if (!target) return;
      if (target.kind === 'external') {
        openLink(target.url, { tryInstantView: false });
      } else {
        openTelegramLink(target.url);
      }
    },
    [openLink, openTelegramLink],
  );
  const [selectedTicket, setSelectedTicket] = useState<TicketDetail | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [ticketFilter, setTicketFilter] = useState<'all' | 'open'>('all');
  const [newTitle, setNewTitle] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [replyMessage, setReplyMessage] = useState('');
  // Ошибка активной формы: и клиентский rate-limit, и отказ бэка (409 «уже есть
  // открытый тикет», 403 «поддержка выключена/пользователь заблокирован» и т.п.).
  // Формы create и reply взаимоисключающие, поэтому состояние одно на обе.
  const [formError, setFormError] = useState<string | null>(null);

  // Media attachment states (multi-upload, up to 10)
  const [createAttachments, setCreateAttachments] = useState<MediaAttachment[]>([]);
  const [replyAttachments, setReplyAttachments] = useState<MediaAttachment[]>([]);
  const createFileInputRef = useRef<HTMLInputElement>(null);
  const replyFileInputRef = useRef<HTMLInputElement>(null);

  const blobUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const urls = blobUrlsRef;
    return () => {
      urls.current.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  const clearCreateAttachments = () => {
    createAttachments.forEach((a) => {
      if (a.preview) URL.revokeObjectURL(a.preview);
    });
    setCreateAttachments([]);
    if (createFileInputRef.current) createFileInputRef.current.value = '';
  };

  const clearReplyAttachments = () => {
    replyAttachments.forEach((a) => {
      if (a.preview) URL.revokeObjectURL(a.preview);
    });
    setReplyAttachments([]);
    if (replyFileInputRef.current) replyFileInputRef.current.value = '';
  };

  // Get support configuration
  const { data: supportConfig, isLoading: configLoading } = useQuery({
    queryKey: ['support-config'],
    queryFn: infoApi.getSupportConfig,
  });

  const { data: tickets, isLoading } = useQuery({
    queryKey: ['tickets'],
    queryFn: () => ticketsApi.getTickets({ per_page: 20 }),
    enabled: supportConfig?.tickets_enabled === true,
  });

  // Open the latest ticket right away instead of an empty «select a ticket» pane.
  const isDesktop = useIsDesktop();
  // Phones: the list first, a ticket opens over it (with a way back).
  const detailOpen = !!selectedTicket || showCreateForm;
  const listHidden = !isDesktop && detailOpen;
  // Phones: with the keyboard open the chat fits the visible part of the screen
  // (Telegram on iOS lays the keyboard over the page without shrinking dvh).
  const keyboardOpen = useVirtualKeyboard();
  const visibleHeight = useVisualViewportHeight();
  // Height above the keyboard while it's really open (not just a focused field).
  const keyboardHeight = useKeyboardVisibleHeight(listHidden);
  // Phones: an open ticket is a conversation — the app chrome steps away.
  const setChatFocus = useChatFocus((st) => st.setChatFocus);
  useEffect(() => {
    setChatFocus(listHidden);
  }, [listHidden, setChatFocus]);
  useEffect(() => () => setChatFocus(false), [setChatFocus]);
  // «Назад» (header, or Telegram's) closes the ticket back to the list.
  useBackHandler(listHidden, () => {
    setSelectedTicket(null);
    setShowCreateForm(false);
  });
  useEffect(() => {
    if (detailOpen && !isDesktop) window.scrollTo({ top: 0 });
  }, [detailOpen, isDesktop]);

  useEffect(() => {
    if (isDesktop && !selectedTicket && !showCreateForm && tickets?.items?.length) {
      setSelectedTicket(tickets.items[0] as unknown as TicketDetail);
    }
  }, [tickets, selectedTicket, showCreateForm, isDesktop]);

  const { data: ticketDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['ticket', selectedTicket?.id],
    queryFn: () => ticketsApi.getTicket(selectedTicket!.id),
    enabled: !!selectedTicket,
  });

  // Open on the latest message, like a messenger (and follow new ones).
  const messagesRef = useRef<HTMLDivElement>(null);
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const lastMessageId = ticketDetail?.messages?.[ticketDetail.messages.length - 1]?.id;
  useEffect(() => {
    if (!lastMessageId) return;
    requestAnimationFrame(() => {
      const el = messagesRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, [lastMessageId]);

  // Phones, keyboard opened or closed: iOS scrolls the page to the focused field —
  // put the chat back at the top (it now fits above the keyboard) and keep the
  // latest message in view.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyboard and viewport changes are the triggers
  useEffect(() => {
    if (!listHidden) return;
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0 });
      const el = messagesRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, [keyboardOpen, visibleHeight, listHidden]);

  // While the chat's height animates with the keyboard, keep the latest message
  // in view (when the reader was at the bottom).
  const stickToBottomRef = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the list mounts once messages load — re-attach then
  useEffect(() => {
    const list = messagesRef.current;
    if (!list || typeof ResizeObserver === 'undefined') return;
    const onScroll = () => {
      stickToBottomRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    };
    const ro = new ResizeObserver(() => {
      if (stickToBottomRef.current) list.scrollTop = list.scrollHeight;
    });
    list.addEventListener('scroll', onScroll, { passive: true });
    ro.observe(list);
    return () => {
      list.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, [ticketDetail?.messages]);

  // The reply box grows line by line (the whole composer up to half the screen, then it scrolls
  // inside); the history shrinks above it and stays pinned to the latest message.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure on every text change
  useLayoutEffect(() => {
    const ta = replyRef.current;
    if (!ta) return;
    const list = messagesRef.current;
    const atBottom = !list || list.scrollHeight - list.scrollTop - list.clientHeight < 8;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
    if (list && atBottom) list.scrollTop = list.scrollHeight;
  }, [replyMessage, selectedTicket?.id]);

  // Handle file selection (multi-upload)
  const handleFileSelect = async (
    file: File,
    setAttachments: React.Dispatch<React.SetStateAction<MediaAttachment[]>>,
  ) => {
    const mediaType = MEDIA_TYPES[file.type];
    if (!mediaType) return;
    if (file.size > 10 * 1024 * 1024) return;

    const preview = mediaType === 'photo' ? URL.createObjectURL(file) : '';
    if (preview) blobUrlsRef.current.add(preview);
    const id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `att_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const entry: MediaAttachment = { id, file, preview, mediaType, uploading: true };
    setAttachments((prev) => (prev.length >= 10 ? prev : [...prev, entry]));

    try {
      const result = await ticketsApi.uploadMedia(file, mediaType);
      setAttachments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, uploading: false, fileId: result.file_id } : a)),
      );
    } catch {
      setAttachments((prev) =>
        prev.map((a) =>
          a.id === id ? { ...a, uploading: false, error: t('support.uploadFailed') } : a,
        ),
      );
    }
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const ready = createAttachments.filter(
        (a): a is MediaAttachment & { fileId: string } => !!a.fileId,
      );
      const media =
        ready.length > 0
          ? {
              media_type: ready[0].mediaType,
              media_file_id: ready[0].fileId,
              media_items: ready.map((a) => ({ type: a.mediaType, file_id: a.fileId })),
            }
          : undefined;
      return ticketsApi.createTicket(newTitle, newMessage, media);
    },
    onSuccess: (ticket) => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      setShowCreateForm(false);
      setFormError(null);
      setNewTitle('');
      setNewMessage('');
      clearCreateAttachments();
      setSelectedTicket(ticket);
    },
    onError: (error) => {
      // Без этого отказ бэка (чаще всего 409 «уже есть открытый тикет») уходил
      // в никуда: форма просто оставалась на месте, и пользователь жал «Отправить»
      // снова и снова, не понимая, почему обращение не создаётся.
      log.error('Ticket creation failed', error);
      if (isOpenTicketConflict(error)) {
        setFormError(t('support.errors.alreadyOpenTicket'));
        // Открытый тикет мог появиться в другой сессии (бот, второе устройство) —
        // подтягиваем список, чтобы пользователю было куда перейти.
        queryClient.invalidateQueries({ queryKey: ['tickets'] });
        return;
      }
      setFormError(getLocalizedApiErrorMessage(error, t('support.errors.createFailed'), t));
    },
  });

  const replyMutation = useMutation({
    mutationFn: async () => {
      const ready = replyAttachments.filter(
        (a): a is MediaAttachment & { fileId: string } => !!a.fileId,
      );
      const media =
        ready.length > 0
          ? {
              media_type: ready[0].mediaType,
              media_file_id: ready[0].fileId,
              media_items: ready.map((a) => ({ type: a.mediaType, file_id: a.fileId })),
            }
          : undefined;
      await ticketsApi.addMessage(selectedTicket!.id, replyMessage, media);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket', selectedTicket?.id] });
      setFormError(null);
      setReplyMessage('');
      clearReplyAttachments();
    },
    onError: (error) => {
      // Ответ в тикет молчал ровно так же: 403 (блокировка в поддержке) и 400
      // (тикет уже закрыт) выглядели как «кнопка не работает».
      log.error('Ticket reply failed', error);
      setFormError(getLocalizedApiErrorMessage(error, t('support.errors.replyFailed'), t));
    },
  });

  // Show loading while checking configuration
  if (configLoading) {
    return (
      <SkeletonGroup className="space-y-3">
        <Skeleton variant="card" count={3} className="h-16" />
      </SkeletonGroup>
    );
  }

  // If tickets are disabled, show redirect message
  if (supportConfig && !supportConfig.tickets_enabled) {
    log.debug('Tickets disabled, config:', supportConfig);

    // Куда и чем открывать контакт — один резолв на весь блок. null → открывать
    // нечего (пустой/битый конфиг), и кнопку тогда не рендерим вовсе.
    const contact = resolveSupportContact(supportConfig);

    const getSupportMessage = () => {
      log.debug('Getting support message for type:', supportConfig.support_type);

      const title = isAdmin ? t('support.ticketsDisabled') : t('support.title');

      if (supportConfig.support_type === 'url' && supportConfig.support_url) {
        return {
          title,
          message: t('support.useExternalLink'),
          buttonText: t('support.openSupport'),
        };
      }

      // profile и любой fallback — контакт в телеграме
      const supportUsername = supportConfig.support_username || '@support';
      return {
        title,
        message: t('support.contactSupport', { username: supportUsername }),
        buttonText: t('support.contactUs'),
      };
    };

    const supportMessage = getSupportMessage();

    return (
      <div className="mx-auto mt-12 max-w-md">
        <Card className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[var(--rd-radius-control)] bg-[var(--rd-field)]">
            <ChatIcon className="h-8 w-8 text-[var(--rd-caption)]" />
          </div>
          <h2 className="mb-2 text-xl font-semibold text-[var(--rd-heading)]">
            {supportMessage.title}
          </h2>
          <p className="mb-6 text-[var(--rd-caption)]">{supportMessage.message}</p>
          {contact && (
            <Button onClick={() => openSupportContact(supportConfig)} fullWidth>
              {supportMessage.buttonText}
            </Button>
          )}
        </Card>
      </div>
    );
  }

  // Attachments preview component
  const AttachmentsPreview = ({
    items,
    onRemove,
  }: {
    items: MediaAttachment[];
    onRemove: (idx: number) => void;
  }) =>
    items.length === 0 ? null : (
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((att, idx) => (
          <div key={idx} className="relative">
            {att.preview ? (
              <img
                src={att.preview}
                alt={t('common.preview')}
                loading="lazy"
                className="h-16 w-16 rounded-[var(--rd-radius-sm)] border border-[var(--rd-border)] object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-[var(--rd-radius-sm)] bg-[var(--rd-chip-hover)] text-xs text-[var(--rd-caption)]">
                {att.file.name.slice(-6)}
              </div>
            )}
            {att.uploading && (
              <div className="absolute inset-0 flex items-center justify-center rounded-[var(--rd-radius-sm)] bg-[var(--rd-page)]">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--rd-action)] border-t-transparent" />
              </div>
            )}
            {att.error && (
              <div className="absolute inset-0 flex items-center justify-center rounded-[var(--rd-radius-sm)] bg-[var(--rd-error-bg)]">
                <span className="text-xs text-[var(--rd-error-text)]">!</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => onRemove(idx)}
              className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--rd-chip-hover)] text-[var(--rd-body)] hover:bg-[var(--rd-error-bg)] hover:text-white"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    );

  const telegramContact = supportConfig ? resolveSupportContact(supportConfig) : null;
  const items = tickets?.items ?? [];
  const openCount = items.filter((tk) => tk.status !== 'closed').length;
  const visibleTickets =
    ticketFilter === 'open' ? items.filter((tk) => tk.status !== 'closed') : items;
  const statusOf = (status: string) =>
    status === 'closed'
      ? { tone: 'success' as const, icon: 'cabinet/check', label: t('postq.support.resolved') }
      : status === 'answered'
        ? {
            tone: 'warning' as const,
            icon: 'cabinet/clock-3',
            label: t('postq.support.waitingYou'),
          }
        : { tone: 'neutral' as const, icon: 'cabinet/clock-3', label: t('postq.support.inReview') };
  const StatusPill = ({ status, size = 'sm' }: { status: string; size?: 'sm' | 'md' }) => {
    const st = statusOf(status);
    return (
      <span
        className={`flex shrink-0 items-center gap-2 self-start whitespace-nowrap rounded-[8px] px-3 py-2 ${size === 'sm' ? 'rd-p-sm' : 'rd-p-md'} ${
          st.tone === 'success'
            ? 'bg-[var(--rd-success-bg)] text-[var(--rd-success-text)]'
            : st.tone === 'warning'
              ? 'bg-[var(--rd-warn-bg)] text-[var(--rd-warn-icon)]'
              : 'bg-[var(--rd-chip)] text-[var(--rd-caption)]'
        }`}
      >
        <RdIcon name={st.icon} size={14} />
        {st.label}
      </span>
    );
  };
  const dayLabel = (iso: string) =>
    new Date(iso).toLocaleDateString(uiLocale(), { day: 'numeric', month: 'long' });
  const timeLabel = (iso: string) =>
    new Date(iso).toLocaleTimeString(uiLocale(), { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <div
        className={`flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between ${listHidden ? 'hidden' : ''}`}
      >
        <h1 className="rd-h3 text-[var(--rd-heading)]">{t('support.title')}</h1>
        <button
          type="button"
          className="rd-btn w-full sm:w-auto"
          onClick={() => {
            setShowCreateForm(true);
            setSelectedTicket(null);
            setFormError(null);
            clearCreateAttachments();
          }}
        >
          <RdIcon name="cabinet/plus" size={20} />
          {t('postq.support.newTicket')}
        </button>
      </div>

      {!listHidden &&
      ((supportConfig?.support_type === 'both' && telegramContact) ||
        !supportConfig?.support_username) ? (
        // Phones: the user's own tickets come first, the Telegram shortcut
        // after them; on desktop it stays above the two columns.
        <div className="order-last lg:order-none">
          {/* The 3D plane, cropped by the card edge like the dashboard's gift:
              the right edge on phones, the bottom-left corner from `sm`. */}
          <section className="rd-card relative flex flex-col gap-6 overflow-hidden sm:flex-row sm:items-center sm:pl-32">
            <img
              src="/redesign/cabinet/telegram-3d.webp"
              alt=""
              aria-hidden
              width={128}
              height={116}
              draggable={false}
              decoding="async"
              className="pointer-events-none absolute top-4 -right-6 w-32 rotate-[8deg] select-none sm:top-auto sm:right-auto sm:-bottom-4 sm:-left-4 sm:w-28 sm:-rotate-[8deg]"
            />
            {/* Phones: tall enough that the button starts below the plane. */}
            <div className="relative flex min-h-28 min-w-0 flex-1 flex-col gap-2 pr-24 sm:min-h-0 sm:pr-0">
              <h2 className="text-balance text-[20px] font-bold leading-6 text-[var(--rd-heading)]">
                {t('postq.support.telegramTitle')}
              </h2>
              <p className="rd-p-md text-balance text-[var(--rd-caption)]">
                {t('postq.support.telegramText')}
              </p>
            </div>
            {supportConfig && telegramContact ? (
              <button
                type="button"
                onClick={() => openSupportContact(supportConfig)}
                className="rd-btn-soft relative w-full shrink-0 sm:w-auto"
              >
                {t('postq.support.writeTo', { name: supportConfig.support_username })}
              </button>
            ) : (
              <a
                href={SUPPORT_BOT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="rd-btn-soft relative w-full shrink-0 sm:w-auto"
              >
                {t('postq.support.writeTo', { name: '@postq_vpn_support_bot' })}
              </a>
            )}
          </section>
        </div>
      ) : null}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch">
        <section
          className={`rd-card flex flex-col gap-6 lg:w-[400px] lg:shrink-0 ${listHidden ? 'hidden' : ''}`}
        >
          <h2 className="rd-h6 text-[var(--rd-heading)]">{t('postq.support.myTickets')}</h2>
          <div role="tablist" className="flex gap-1 rounded-[12px] bg-[var(--rd-field)] p-1">
            {(['all', 'open'] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={ticketFilter === f}
                onClick={() => setTicketFilter(f)}
                className={`rd-p-md flex h-9 flex-1 items-center justify-center gap-2 rounded-[9px] transition-colors ${
                  ticketFilter === f
                    ? 'bg-[var(--rd-surface)] font-medium text-[var(--rd-heading)]'
                    : 'text-[var(--rd-caption)] hover:text-[var(--rd-heading)]'
                }`}
              >
                {f === 'all' ? t('postq.support.all') : t('postq.support.open')}
                <span>{f === 'all' ? items.length : openCount}</span>
              </button>
            ))}
          </div>

          {isLoading ? (
            <SkeletonGroup className="flex flex-col gap-3">
              <Skeleton variant="card" count={3} className="h-[140px]" />
            </SkeletonGroup>
          ) : visibleTickets.length > 0 ? (
            <div className="flex flex-col gap-3">
              {visibleTickets.map((ticket) => {
                const active = selectedTicket?.id === ticket.id;
                const last = ticket.last_message;
                return (
                  <button
                    key={ticket.id}
                    type="button"
                    onClick={() => {
                      setSelectedTicket(ticket as unknown as TicketDetail);
                      setShowCreateForm(false);
                      setFormError(null);
                      clearReplyAttachments();
                    }}
                    className={`flex w-full flex-col gap-3 rounded-[16px] border-2 p-5 text-left transition-colors ${
                      active
                        ? 'border-[var(--rd-border-accent)] bg-[var(--rd-help)]'
                        : 'border-transparent bg-[var(--rd-field)] hover:bg-[var(--rd-chip-hover)]'
                    }`}
                  >
                    <span className="rd-p-sm flex w-full justify-between gap-3">
                      <span
                        className={
                          active ? 'text-[var(--rd-action)]' : 'text-[var(--rd-placeholder)]'
                        }
                      >
                        № {ticket.id}
                      </span>
                      <span className="text-[var(--rd-placeholder)]">
                        {dayLabel(ticket.updated_at)}
                      </span>
                    </span>
                    <span className="flex w-full min-w-0 flex-col gap-1">
                      <span className="rd-p-lg truncate text-[var(--rd-heading)]">
                        {ticket.title}
                      </span>
                      {last?.message_text && (
                        <span className="rd-p-md truncate text-[var(--rd-caption)]">
                          {last.is_from_admin ? t('support.supportTeam') : t('support.you')}:{' '}
                          {last.message_text}
                        </span>
                      )}
                    </span>
                    <StatusPill status={ticket.status} />
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="rd-p-md py-8 text-center text-[var(--rd-caption)]">
              {t('support.noTickets')}
            </p>
          )}

          <p className="rd-p-md mt-auto flex gap-3 pt-1 text-[var(--rd-caption)]">
            <RdIcon name="cabinet/message-circle" size={18} className="mt-1" />
            {t('postq.support.tip')}
          </p>
        </section>

        <section
          className={`flex min-w-0 flex-col gap-4 lg:flex-1 lg:gap-6 ${
            listHidden && selectedTicket ? '' : 'rd-card rd-card--lg'
          } ${!isDesktop && !detailOpen ? 'hidden' : ''}`}
          // Phones: the chat is exactly one screen tall — messages scroll
          // inside, the reply box stays at the bottom. Inline, not a Tailwind
          // arbitrary class, and no flex-1 on phones — in the column it overrode the height.
          style={
            listHidden && selectedTicket
              ? {
                  height: keyboardHeight
                    ? // Down to the keyboard's edge: the composer sits right on it.
                      // Only main's 24px top padding and the top inset come off.
                      `calc(${keyboardHeight}px - var(--rd-top-inset, 0px) - 24px)`
                    : 'calc(100dvh - var(--rd-top-inset, 0px) - 32px - var(--mobile-nav-offset))',
                }
              : undefined
          }
        >
          {listHidden && showCreateForm && !capabilities.hasBackButton && (
            // The cabinet's one «Назад» (the header is hidden here); in Telegram
            // the native button does it, via the same handler.
            <div className="flex shrink-0">
              <BackButton variant="mobile" />
            </div>
          )}
          {showCreateForm ? (
            <div className="flex flex-col gap-6">
              <h2 className="rd-h5 text-[var(--rd-heading)]">{t('support.createTicket')}</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setFormError(null);
                  // Rate limit: max 3 tickets per 60 seconds
                  if (!checkRateLimit(RATE_LIMIT_KEYS.TICKET_CREATE, 3, 60000)) {
                    const resetTime = getRateLimitResetTime(RATE_LIMIT_KEYS.TICKET_CREATE);
                    setFormError(t('support.tooManyRequests', { seconds: resetTime }));
                    return;
                  }
                  createMutation.mutate();
                }}
                className="space-y-4"
              >
                <div>
                  <label htmlFor="support-subject" className="label">
                    {t('support.subject')}
                  </label>
                  <input
                    id="support-subject"
                    type="text"
                    className="input"
                    placeholder={t('support.subjectPlaceholder')}
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    required
                    minLength={3}
                    maxLength={255}
                  />
                </div>
                <div>
                  <label htmlFor="support-message" className="label">
                    {t('support.message')}
                  </label>
                  <textarea
                    id="support-message"
                    className="input min-h-[150px] !rounded-[16px]"
                    placeholder={t('support.messagePlaceholder')}
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    required
                    minLength={10}
                    maxLength={4000}
                  />
                </div>

                {/* Media attachments for create */}
                <div>
                  <input
                    ref={createFileInputRef}
                    type="file"
                    accept={Object.keys(MEDIA_TYPES).join(',')}
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      files.forEach((file) => handleFileSelect(file, setCreateAttachments));
                      e.target.value = '';
                    }}
                  />
                  <AttachmentsPreview
                    items={createAttachments}
                    onRemove={(idx) =>
                      setCreateAttachments((prev) => {
                        const removed = prev[idx];
                        if (removed?.preview) URL.revokeObjectURL(removed.preview);
                        return prev.filter((_, i) => i !== idx);
                      })
                    }
                  />
                  {createAttachments.length < 10 && (
                    <button
                      type="button"
                      onClick={() => createFileInputRef.current?.click()}
                      disabled={createAttachments.some((a) => a.uploading)}
                      className="rd-p-md rd-link mt-2 flex items-center gap-2 disabled:opacity-50"
                    >
                      <RdIcon name="cabinet/paperclip" size={18} />
                      {t('support.attachMedia')}{' '}
                      {createAttachments.length > 0 && `(${createAttachments.length}/10)`}
                    </button>
                  )}
                </div>

                {formError && (
                  <div
                    role="alert"
                    className="rd-p-md rounded-[var(--rd-radius-sm)] bg-[var(--rd-error-bg)] px-4 py-3 text-[var(--rd-error-text)]"
                  >
                    {formError}
                  </div>
                )}

                <div className="flex flex-wrap gap-3">
                  <button
                    type="submit"
                    className="rd-btn"
                    disabled={
                      createMutation.isPending || createAttachments.some((a) => a.uploading)
                    }
                  >
                    {createMutation.isPending ? t('common.loading') : t('support.send')}
                  </button>
                  <button
                    type="button"
                    className="rd-btn-soft !py-0"
                    onClick={() => {
                      setShowCreateForm(false);
                      setFormError(null);
                      clearCreateAttachments();
                    }}
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </form>
            </div>
          ) : selectedTicket ? (
            <>
              {/* Chat header. Phones: «Назад», then the subject over the number and status. */}
              <div className="flex shrink-0 items-center gap-3 lg:flex-col lg:items-stretch">
                {listHidden && !capabilities.hasBackButton && <BackButton variant="mobile" />}
                <div className="flex min-w-0 flex-1 flex-col gap-1 lg:gap-3">
                  <h2
                    className={
                      listHidden
                        ? 'truncate text-[20px] font-bold leading-6 text-[var(--rd-heading)]'
                        : 'rd-h5 text-[var(--rd-heading)]'
                    }
                  >
                    {ticketDetail?.title || selectedTicket.title}
                  </h2>
                  <div
                    className={`flex flex-wrap items-center gap-y-2 ${listHidden ? 'gap-x-2' : 'gap-x-4'}`}
                  >
                    <span
                      className={`${listHidden ? 'rd-p-sm' : 'rd-p-md'} text-[var(--rd-placeholder)]`}
                    >
                      {listHidden
                        ? `№ ${selectedTicket.id}`
                        : t('postq.support.numberCreated', {
                            id: selectedTicket.id,
                            date: dayLabel(selectedTicket.created_at),
                          })}
                    </span>
                    <StatusPill
                      status={ticketDetail?.status || selectedTicket.status}
                      size={listHidden ? 'sm' : 'md'}
                    />
                  </div>
                </div>
              </div>
              <div className="h-px w-full shrink-0 bg-[var(--rd-divider)]" />

              {detailLoading ? (
                <SkeletonGroup className="flex flex-col gap-3">
                  <Skeleton variant="card" count={3} className="h-[100px]" />
                </SkeletonGroup>
              ) : ticketDetail?.messages ? (
                // Messenger layout: the user's messages on the right, support on
                // the left with its mark; the time sits inside the bubble.
                <div
                  ref={messagesRef}
                  className="-mx-2 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden px-2 lg:max-h-[560px]"
                >
                  {ticketDetail.messages.map((msg, i) => {
                    const prev = ticketDetail.messages[i - 1];
                    const next = ticketDetail.messages[i + 1];
                    const sameDay = (a: string, b: string) =>
                      new Date(a).toDateString() === new Date(b).toDateString();
                    const newDay = !prev || !sameDay(prev.created_at, msg.created_at);
                    const mine = !msg.is_from_admin;
                    // Support's mark only under the last message of a run.
                    const lastOfRun =
                      !next ||
                      next.is_from_admin !== msg.is_from_admin ||
                      !sameDay(next.created_at, msg.created_at);
                    return (
                      <div key={msg.id} className="flex flex-col gap-2">
                        {newDay && (
                          <p className="rd-p-sm py-2 text-center text-[var(--rd-caption)]">
                            {dayLabel(msg.created_at)}
                          </p>
                        )}
                        <div className={`flex items-end gap-2 ${mine ? 'justify-end' : ''}`}>
                          {!mine && (
                            <span className="flex size-8 shrink-0 items-center justify-center">
                              {lastOfRun && (
                                <RdImg
                                  name="logo-mark"
                                  width={30}
                                  height={29}
                                  className="h-6 w-auto"
                                  alt={t('postq.support.team')}
                                />
                              )}
                            </span>
                          )}
                          <div
                            className={`flex min-w-0 max-w-[85%] flex-col gap-2 rounded-[20px] px-4 py-3 lg:max-w-[70%] ${
                              mine
                                ? 'rounded-br-[4px] bg-[var(--rd-action-soft)]'
                                : 'rounded-bl-[4px] bg-[var(--rd-field)]'
                            }`}
                          >
                            {msg.message_text && (
                              <div
                                className="rd-p-md whitespace-pre-wrap break-words text-[var(--rd-heading)] [&_a]:text-[var(--rd-action)] [&_a]:underline"
                                dangerouslySetInnerHTML={{ __html: linkifyText(msg.message_text) }}
                              />
                            )}
                            <MessageMediaGrid
                              message={msg}
                              translateError={t('support.imageLoadFailed')}
                            />
                            <span className="rd-p-sm self-end text-[var(--rd-caption)]">
                              {timeLabel(msg.created_at)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {ticketDetail?.status !== 'closed' && !ticketDetail?.is_reply_blocked && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setFormError(null);
                    // Rate limit: max 5 replies per 30 seconds
                    if (!checkRateLimit(RATE_LIMIT_KEYS.TICKET_REPLY, 5, 30000)) {
                      const resetTime = getRateLimitResetTime(RATE_LIMIT_KEYS.TICKET_REPLY);
                      setFormError(t('support.tooManyRequests', { seconds: resetTime }));
                      return;
                    }
                    replyMutation.mutate();
                  }}
                  className="flex shrink-0 flex-col gap-2"
                >
                  <input
                    ref={replyFileInputRef}
                    type="file"
                    accept={Object.keys(MEDIA_TYPES).join(',')}
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      files.forEach((file) => handleFileSelect(file, setReplyAttachments));
                      e.target.value = '';
                    }}
                  />
                  {/* One composer row: attach, the growing field, send. */}
                  {/* Phones, keyboard open: a full-width bar resting on the keyboard;
                      its fill runs on under the keyboard's rounded top corners, so
                      no page shows through beside them. */}
                  <div
                    className={`relative flex flex-col gap-2 bg-[var(--rd-field)] ${
                      keyboardHeight
                        ? '-mx-4 rounded-t-[24px] px-4 py-2 after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-12 after:bg-[var(--rd-field)]'
                        : 'rounded-[24px] border-2 border-transparent p-2 focus-within:border-[var(--rd-action)]'
                    }`}
                  >
                    <AttachmentsPreview
                      items={replyAttachments}
                      onRemove={(idx) =>
                        setReplyAttachments((prev) => {
                          const removed = prev[idx];
                          if (removed?.preview) URL.revokeObjectURL(removed.preview);
                          return prev.filter((_, i) => i !== idx);
                        })
                      }
                    />
                    <div className="flex items-end gap-2">
                      <button
                        type="button"
                        onClick={() => replyFileInputRef.current?.click()}
                        disabled={
                          replyAttachments.length >= 10 || replyAttachments.some((a) => a.uploading)
                        }
                        aria-label={t('postq.support.attachImage')}
                        title={t('postq.support.attachImage')}
                        className="flex size-10 shrink-0 items-center justify-center rounded-full text-[var(--rd-caption)] transition-colors hover:bg-[var(--rd-chip-hover)] hover:text-[var(--rd-heading)] disabled:opacity-40"
                      >
                        <RdIcon name="cabinet/paperclip" size={20} />
                      </button>
                      <textarea
                        ref={replyRef}
                        rows={1}
                        className="rd-p-md max-h-[calc(50dvh-136px)] min-h-[40px] flex-1 resize-none overflow-y-auto bg-transparent py-[10px] text-[var(--rd-heading)] outline-none placeholder:text-[var(--rd-placeholder)]"
                        placeholder={t('postq.support.replyPlaceholder')}
                        aria-label={t('postq.support.replyPlaceholder')}
                        value={replyMessage}
                        onChange={(e) => setReplyMessage(e.target.value)}
                        enterKeyHint="send"
                        onKeyDown={(e) => {
                          // Enter sends, Shift+Enter breaks the line; leave IME
                          // composition (e.g. picking a word) alone.
                          if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
                          e.preventDefault();
                          // Same rule as the disabled send button.
                          const canSend =
                            !replyMutation.isPending &&
                            !replyAttachments.some((a) => a.uploading) &&
                            (!!replyMessage.trim() || replyAttachments.some((a) => a.fileId));
                          if (canSend) e.currentTarget.form?.requestSubmit();
                        }}
                        maxLength={4000}
                      />
                      <button
                        type="submit"
                        aria-label={t('support.send')}
                        title={t('support.send')}
                        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--rd-action)] text-[var(--rd-on-action)] transition-colors hover:bg-[var(--rd-action-hover)] disabled:bg-[var(--rd-chip)] disabled:text-[var(--rd-placeholder)]"
                        disabled={
                          replyMutation.isPending ||
                          (!replyMessage.trim() &&
                            replyAttachments.filter((a) => a.fileId).length === 0) ||
                          replyAttachments.some((a) => a.uploading)
                        }
                      >
                        {replyMutation.isPending ? (
                          <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        ) : (
                          <RdIcon name="arrow-right" size={20} className="-rotate-90" />
                        )}
                      </button>
                    </div>
                  </div>
                  {formError && (
                    <p role="alert" className="rd-p-sm text-[var(--rd-error-text)]">
                      {formError}
                    </p>
                  )}
                  <p className="rd-p-sm hidden text-[var(--rd-placeholder)] lg:block">
                    {t('postq.support.safety')}
                  </p>
                </form>
              )}

              {ticketDetail?.is_reply_blocked && (
                <p className="rd-p-md text-center text-[var(--rd-caption)]">
                  {t('support.repliesDisabled')}
                </p>
              )}
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
              <span className="flex size-16 items-center justify-center rounded-[var(--rd-radius-md)] bg-[var(--rd-field)] text-[var(--rd-caption)]">
                <RdIcon name="cabinet/message-circle" size={28} />
              </span>
              <p className="rd-p-md text-[var(--rd-caption)]">{t('support.selectTicket')}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
