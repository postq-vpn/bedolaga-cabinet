import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { adminApi, type AdminTicket, type AdminTicketDetail } from '../api/admin';
import { ticketsApi } from '../api/tickets';
import { ticketNotificationsApi } from '../api/ticketNotifications';
import { MessageMediaGrid } from '../components/tickets/MessageMediaGrid';
import { backTo } from '@/components/admin';
import { RdIcon } from '@/components/postq/RdIcon';
import { BackButton } from '@/components/postq/BackButton';
import { useBackHandler } from '@/components/postq/backOverride';
import { useChatFocus } from '@/components/postq/chatFocus';
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton';
import { DocumentIcon } from '@/components/icons';
import { useVirtualKeyboard } from '@/hooks/useVirtualKeyboard';
import { useVisualViewportHeight } from '@/hooks/useVisualViewportHeight';
import { usePlatform } from '../platform/hooks/usePlatform';
import { copyToClipboard } from '../utils/clipboard';
import { linkifyText } from '../utils/linkify';
import { uiLocale } from '@/utils/uiLocale';
import logger from '../utils/logger';

interface MediaAttachment {
  id: string;
  file: File;
  preview: string;
  uploading: boolean;
  fileId?: string;
  mediaType: 'photo' | 'video' | 'document';
  error?: string;
}

const ALLOWED_FILE_TYPES: Record<string, MediaAttachment['mediaType']> = {
  'image/jpeg': 'photo',
  'image/png': 'photo',
  'image/gif': 'photo',
  'image/webp': 'photo',
  'video/mp4': 'video',
  'video/webm': 'video',
  'video/quicktime': 'video',
  'application/pdf': 'document',
  'application/msword': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'text/plain': 'document',
  'application/zip': 'document',
  'application/x-rar-compressed': 'document',
};
const ACCEPT_STRING = Object.keys(ALLOWED_FILE_TYPES).join(',');
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const STATUSES = ['open', 'pending', 'answered', 'closed'] as const;

const DESKTOP_QUERY = '(min-width: 1024px)';
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

const statusKey = (s: string) => `admin.tickets.status${s.charAt(0).toUpperCase() + s.slice(1)}`;

/** Admin's view of tickets: open and waiting ones need an answer — they're the loud ones. */
const statusTone = (s: string) =>
  s === 'closed' ? 'success' : s === 'answered' ? 'neutral' : 'warning';

/**
 * Admin tickets, postq design — laid out like the user's support chat: the list
 * and the conversation side by side on desktop; on a phone the list first and a
 * ticket opens over it as a full-screen chat (no app chrome, «Назад» to the list).
 */
export default function AdminTickets() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { ticketId } = useParams<{ ticketId: string }>();
  const queryClient = useQueryClient();
  const { capabilities } = usePlatform();

  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  // Deep link /admin/tickets/:ticketId (admin-chat notification buttons) opens
  // that ticket; the bare /admin/tickets clears it. Both routes share this
  // instance, so the URL param is mirrored into the selection.
  useEffect(() => {
    if (!ticketId) {
      setSelectedTicketId(null);
      return;
    }
    const id = Number(ticketId);
    if (Number.isInteger(id) && id > 0) setSelectedTicketId(id);
  }, [ticketId]);

  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [replyText, setReplyText] = useState('');
  const [replyError, setReplyError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<MediaAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadIdRef = useRef(0);
  const blobUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const uploadRef = uploadIdRef;
    const urls = blobUrlsRef;
    return () => {
      uploadRef.current++;
      urls.current.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  const { data: stats } = useQuery({
    queryKey: ['admin-ticket-stats'],
    queryFn: adminApi.getTicketStats,
  });

  const { data: ticketsData, isLoading: ticketsLoading } = useQuery({
    queryKey: ['admin-tickets', page, statusFilter],
    queryFn: () => adminApi.getTickets({ page, per_page: 20, status: statusFilter || undefined }),
    refetchInterval: 30000,
  });

  const { data: ticket, isLoading: ticketLoading } = useQuery({
    queryKey: ['admin-ticket', selectedTicketId],
    queryFn: () => adminApi.getTicket(selectedTicketId!),
    enabled: !!selectedTicketId,
    // A user may write while the chat is open.
    refetchInterval: 20000,
  });

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['admin-ticket', selectedTicketId] });
    queryClient.invalidateQueries({ queryKey: ['admin-tickets'] });
    queryClient.invalidateQueries({ queryKey: ['admin-ticket-stats'] });
  }, [queryClient, selectedTicketId]);

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      adminApi.updateTicketStatus(id, status),
    onSuccess: invalidateAll,
  });

  // Phones: one pane at a time.
  const isDesktop = useIsDesktop();
  const listHidden = !isDesktop && !!selectedTicketId;
  const keyboardOpen = useVirtualKeyboard();
  const visibleHeight = useVisualViewportHeight();
  const setChatFocus = useChatFocus((st) => st.setChatFocus);
  useEffect(() => {
    setChatFocus(listHidden);
  }, [listHidden, setChatFocus]);
  useEffect(() => () => setChatFocus(false), [setChatFocus]);

  const clearAttachments = useCallback(() => {
    uploadIdRef.current++;
    setAttachments((prev) => {
      prev.forEach((a) => {
        if (a.preview) {
          URL.revokeObjectURL(a.preview);
          blobUrlsRef.current.delete(a.preview);
        }
      });
      return [];
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const openTicket = (id: number) => {
    setReplyText('');
    setReplyError(null);
    clearAttachments();
    if (ticketId) navigate(`/admin/tickets/${id}`, { replace: true });
    else setSelectedTicketId(id);
  };
  const closeTicket = () => {
    setReplyError(null);
    if (ticketId) navigate('/admin/tickets', { replace: true });
    else setSelectedTicketId(null);
  };
  // «Назад» (header, or Telegram's) closes the chat back to the list.
  useBackHandler(listHidden, closeTicket);

  // Opening a ticket clears its admin notifications (the bell's counter).
  const openId = ticket?.id;
  const lastMessageId = ticket?.messages?.[ticket.messages.length - 1]?.id;
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new message re-marks the ticket
  useEffect(() => {
    if (!openId) return;
    ticketNotificationsApi
      .markAdminTicketAsRead(openId)
      .then((r) => {
        if (r.marked_count > 0) {
          queryClient.invalidateQueries({ queryKey: ['admin-ticket-notifications-count'] });
          queryClient.invalidateQueries({ queryKey: ['admin-ticket-notifications'] });
        }
      })
      .catch(() => {});
  }, [openId, lastMessageId, queryClient]);

  // Open on the latest message and follow new ones.
  const messagesRef = useRef<HTMLDivElement>(null);
  const replyRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!lastMessageId) return;
    requestAnimationFrame(() => {
      const el = messagesRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, [lastMessageId]);

  // Phones: the keyboard opening/closing scrolls the page — keep the chat in place.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyboard and viewport changes are the triggers
  useEffect(() => {
    if (!listHidden) return;
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0 });
      const el = messagesRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, [keyboardOpen, visibleHeight, listHidden]);

  // The reply box grows with the text; the history stays pinned to the bottom.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure on every text change
  useLayoutEffect(() => {
    const ta = replyRef.current;
    if (!ta) return;
    const list = messagesRef.current;
    const atBottom = !list || list.scrollHeight - list.scrollTop - list.clientHeight < 8;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
    if (list && atBottom) list.scrollTop = list.scrollHeight;
  }, [replyText, selectedTicketId]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (fileInputRef.current) fileInputRef.current.value = '';
    const toAdd = files.slice(0, 10 - attachments.length);
    for (const file of toAdd) {
      const mediaType = ALLOWED_FILE_TYPES[file.type];
      if (!mediaType) {
        setReplyError(t('admin.tickets.invalidFileType'));
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        setReplyError(t('admin.tickets.fileTooLarge'));
        continue;
      }
      const preview = mediaType === 'photo' ? URL.createObjectURL(file) : '';
      if (preview) blobUrlsRef.current.add(preview);
      const id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `att_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const token = uploadIdRef.current;
      setAttachments((prev) => [...prev, { id, file, preview, uploading: true, mediaType }]);
      ticketsApi
        .uploadMedia(file, mediaType)
        .then((result) => {
          if (uploadIdRef.current !== token) return;
          setAttachments((prev) =>
            prev.map((a) => (a.id === id ? { ...a, uploading: false, fileId: result.file_id } : a)),
          );
        })
        .catch(() => {
          if (uploadIdRef.current !== token) return;
          setAttachments((prev) =>
            prev.map((a) =>
              a.id === id ? { ...a, uploading: false, error: t('admin.tickets.uploadFailed') } : a,
            ),
          );
        });
    }
  };

  const removeAttachment = (id: string) =>
    setAttachments((prev) => {
      const removed = prev.find((a) => a.id === id);
      if (removed?.preview) URL.revokeObjectURL(removed.preview);
      return prev.filter((a) => a.id !== id);
    });

  const replyMutation = useMutation({
    mutationFn: async () => {
      const ready = attachments.filter(
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
      await adminApi.replyToTicket(selectedTicketId!, replyText, media);
    },
    onSuccess: () => {
      setReplyText('');
      setReplyError(null);
      clearAttachments();
      invalidateAll();
    },
    onError: (err) => {
      logger.error('Ticket reply failed:', err);
      setReplyError(
        err instanceof Error ? err.message : t('admin.tickets.replyFailed', 'Failed to send reply'),
      );
    },
  });

  const canSend =
    !replyMutation.isPending &&
    !attachments.some((a) => a.uploading || a.error) &&
    (!!replyText.trim() || attachments.some((a) => a.fileId));

  const formatUser = (tk: AdminTicket | AdminTicketDetail) => {
    if (!tk.user) return 'Unknown';
    const { first_name, last_name, username } = tk.user;
    if (first_name || last_name) return `${first_name || ''} ${last_name || ''}`.trim();
    if (username) return `@${username}`;
    return 'User';
  };
  const dayLabel = (iso: string) =>
    new Date(iso).toLocaleDateString(uiLocale(), { day: 'numeric', month: 'long' });
  const shortDate = (iso: string) => {
    const d = new Date(iso);
    return d.toDateString() === new Date().toDateString()
      ? timeLabel(iso)
      : d.toLocaleDateString(uiLocale(), { day: 'numeric', month: 'short' });
  };
  const timeLabel = (iso: string) =>
    new Date(iso).toLocaleTimeString(uiLocale(), { hour: '2-digit', minute: '2-digit' });

  const StatusPill = ({ status }: { status: string }) => {
    const tone = statusTone(status);
    return (
      <span
        className={`rd-p-sm flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[8px] px-2.5 py-1 ${
          tone === 'success'
            ? 'bg-[var(--rd-success-bg)] text-[var(--rd-success-text)]'
            : tone === 'warning'
              ? 'bg-[var(--rd-warn-bg)] text-[var(--rd-warn-icon)]'
              : 'bg-[var(--rd-chip)] text-[var(--rd-caption)]'
        }`}
      >
        <RdIcon name={status === 'closed' ? 'cabinet/check' : 'cabinet/clock-3'} size={14} />
        {t(statusKey(status))}
      </span>
    );
  };

  const filters: { value: string; label: string; count?: number }[] = [
    { value: '', label: t('admin.tickets.total'), count: stats?.total },
    ...STATUSES.map((s) => ({ value: s, label: t(statusKey(s)), count: stats?.[s] })),
  ];

  const items = ticketsData?.items ?? [];

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <div className={`flex items-center justify-between gap-4 ${listHidden ? 'hidden' : ''}`}>
        <h1 className="rd-h3 text-[var(--rd-heading)]">{t('admin.tickets.list')}</h1>
        <button
          type="button"
          onClick={() => navigate('/admin/tickets/settings')}
          className="rd-btn-soft shrink-0"
        >
          {t('admin.tickets.settings')}
        </button>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch">
        {/* List */}
        <section
          className={`rd-card flex min-w-0 flex-col gap-5 lg:w-[420px] lg:shrink-0 ${listHidden ? 'hidden' : ''}`}
        >
          {/* Status filter with counts — the stats and the filter in one row. */}
          <div
            role="tablist"
            className="-mx-1 flex gap-1 overflow-x-auto rounded-[12px] bg-[var(--rd-field)] p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {filters.map((f) => (
              <button
                key={f.value || 'all'}
                type="button"
                role="tab"
                aria-selected={statusFilter === f.value}
                onClick={() => {
                  setStatusFilter(f.value);
                  setPage(1);
                }}
                className={`rd-p-sm flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[9px] px-3 transition-colors lg:flex-1 lg:px-2 ${
                  statusFilter === f.value
                    ? 'bg-[var(--rd-surface)] font-medium text-[var(--rd-heading)]'
                    : 'text-[var(--rd-caption)] hover:text-[var(--rd-heading)]'
                }`}
              >
                {f.label}
                {f.count !== undefined && (
                  <span className="text-[var(--rd-placeholder)]">{f.count}</span>
                )}
              </button>
            ))}
          </div>

          {ticketsLoading ? (
            <SkeletonGroup className="flex flex-col gap-3">
              <Skeleton variant="card" count={4} className="h-[112px]" />
            </SkeletonGroup>
          ) : items.length === 0 ? (
            <p className="rd-p-md py-10 text-center text-[var(--rd-caption)]">
              {t('admin.tickets.noTickets')}
            </p>
          ) : (
            <div className="flex flex-col gap-2 lg:max-h-[640px] lg:overflow-y-auto lg:pr-1">
              {items.map((tk) => {
                const active = selectedTicketId === tk.id;
                const last = tk.last_message;
                const preview = last
                  ? last.message_text ||
                    (last.has_media ? `📎 ${last.media_type ?? ''}`.trim() : '')
                  : '';
                return (
                  <button
                    key={tk.id}
                    type="button"
                    onClick={() => openTicket(tk.id)}
                    className={`flex w-full flex-col gap-2 rounded-[16px] border-2 px-4 py-3.5 text-left transition-colors ${
                      active
                        ? 'border-[var(--rd-border-accent)] bg-[var(--rd-help)]'
                        : 'border-transparent bg-[var(--rd-field)] hover:bg-[var(--rd-chip-hover)]'
                    }`}
                  >
                    <span className="rd-p-sm flex w-full items-center justify-between gap-3 text-[var(--rd-placeholder)]">
                      <span className="min-w-0 truncate">
                        <span className={active ? 'text-[var(--rd-action)]' : ''}>№ {tk.id}</span>
                        {' · '}
                        {formatUser(tk)}
                      </span>
                      <span className="shrink-0">{shortDate(tk.updated_at)}</span>
                    </span>
                    <span className="rd-p-lg w-full truncate font-medium text-[var(--rd-heading)]">
                      {tk.title}
                    </span>
                    <span className="flex w-full items-center justify-between gap-3">
                      <span className="rd-p-md min-w-0 truncate text-[var(--rd-caption)]">
                        {preview &&
                          `${last?.is_from_admin ? t('admin.tickets.you') : t('admin.tickets.user')}: ${preview}`}
                      </span>
                      <StatusPill status={tk.status} />
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {ticketsData && ticketsData.pages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                aria-label={t('common.back')}
                className="flex size-10 items-center justify-center rounded-full bg-[var(--rd-field)] text-[var(--rd-heading)] transition-colors hover:bg-[var(--rd-chip-hover)] disabled:opacity-40"
              >
                <RdIcon name="cabinet/chevron-up" size={20} className="-rotate-90" />
              </button>
              <span className="rd-p-md text-[var(--rd-caption)]">
                {page} / {ticketsData.pages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(ticketsData.pages, p + 1))}
                disabled={page === ticketsData.pages}
                aria-label={t('common.next')}
                className="flex size-10 items-center justify-center rounded-full bg-[var(--rd-field)] text-[var(--rd-heading)] transition-colors hover:bg-[var(--rd-chip-hover)] disabled:opacity-40"
              >
                <RdIcon name="cabinet/chevron-up" size={20} className="rotate-90" />
              </button>
            </div>
          )}
        </section>

        {/* Conversation */}
        <section
          className={`flex min-w-0 flex-col gap-4 lg:flex-1 ${listHidden ? '' : 'rd-card rd-card--lg'} ${
            !isDesktop && !selectedTicketId ? 'hidden' : ''
          }`}
          // Phones: exactly one screen tall — messages scroll inside, the reply
          // box stays at the bottom (same sizing as the user's support chat).
          style={
            listHidden
              ? {
                  height:
                    keyboardOpen && visibleHeight
                      ? `calc(${visibleHeight}px - var(--rd-top-inset, 0px) - 32px)`
                      : 'calc(100dvh - var(--rd-top-inset, 0px) - 32px - var(--mobile-nav-offset))',
                }
              : undefined
          }
        >
          {!selectedTicketId ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
              <span className="flex size-16 items-center justify-center rounded-[var(--rd-radius-md)] bg-[var(--rd-field)] text-[var(--rd-caption)]">
                <RdIcon name="cabinet/message-circle" size={28} />
              </span>
              <p className="rd-p-md text-[var(--rd-caption)]">{t('admin.tickets.selectTicket')}</p>
            </div>
          ) : ticketLoading || !ticket ? (
            <>
              {listHidden && !capabilities.hasBackButton && (
                <div className="flex shrink-0">
                  <BackButton variant="mobile" />
                </div>
              )}
              <SkeletonGroup className="flex flex-col gap-3">
                <Skeleton variant="card" count={3} className="h-[90px]" />
              </SkeletonGroup>
            </>
          ) : (
            <>
              {/* Header: back (phones), subject, number · author · status. */}
              <div className="flex shrink-0 items-start gap-3">
                {listHidden && !capabilities.hasBackButton && <BackButton variant="mobile" />}
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <h2
                    className={`${listHidden ? 'text-[20px] font-bold leading-6' : 'rd-h5'} line-clamp-2 text-[var(--rd-heading)] [overflow-wrap:anywhere]`}
                  >
                    {ticket.title}
                  </h2>
                  <div className="rd-p-sm flex flex-wrap items-center gap-x-2 gap-y-1 text-[var(--rd-placeholder)]">
                    <span>№ {ticket.id}</span>
                    <span>·</span>
                    {ticket.user ? (
                      <Link
                        to={`/admin/users/${ticket.user.id}`}
                        {...backTo(location)}
                        title={t('admin.tickets.viewUser')}
                        className="font-medium text-[var(--rd-action)] hover:underline"
                      >
                        {formatUser(ticket)}
                      </Link>
                    ) : (
                      <span>{formatUser(ticket)}</span>
                    )}
                    {ticket.user?.telegram_id && (
                      <button
                        type="button"
                        onClick={() => void copyToClipboard(String(ticket.user!.telegram_id))}
                        title={t('admin.tickets.copyTelegramId')}
                        className="flex items-center gap-1 rounded-[6px] bg-[var(--rd-chip)] px-1.5 py-0.5 text-[var(--rd-caption)] transition-colors hover:bg-[var(--rd-chip-hover)]"
                      >
                        TG {ticket.user.telegram_id}
                        <RdIcon name="cabinet/copy" size={12} />
                      </button>
                    )}
                    {!listHidden && (
                      <span>
                        · {t('admin.tickets.created')} {dayLabel(ticket.created_at)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Status: one tap; scrolls sideways on narrow phones. */}
              <div className="-mx-1 flex shrink-0 gap-1.5 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {STATUSES.map((s) => {
                  const current = ticket.status === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => statusMutation.mutate({ id: ticket.id, status: s })}
                      disabled={current || statusMutation.isPending}
                      aria-pressed={current}
                      className={`rd-p-sm flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 transition-colors ${
                        current
                          ? 'bg-[var(--rd-action)] text-[var(--rd-on-action)]'
                          : 'bg-[var(--rd-field)] text-[var(--rd-caption)] hover:bg-[var(--rd-chip-hover)] hover:text-[var(--rd-heading)] disabled:opacity-50'
                      }`}
                    >
                      {current && <RdIcon name="cabinet/check" size={14} />}
                      {t(statusKey(s))}
                    </button>
                  );
                })}
              </div>
              <div className="h-px w-full shrink-0 bg-[var(--rd-divider)]" />

              {/* Messages: the user on the left, admins on the right. */}
              <div
                ref={messagesRef}
                className="-mx-2 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden px-2 lg:max-h-[560px] lg:min-h-[320px]"
              >
                {ticket.messages.map((msg, i) => {
                  const prev = ticket.messages[i - 1];
                  const newDay =
                    !prev ||
                    new Date(prev.created_at).toDateString() !==
                      new Date(msg.created_at).toDateString();
                  const mine = msg.is_from_admin;
                  return (
                    <div key={msg.id} className="flex flex-col gap-2">
                      {newDay && (
                        <p className="rd-p-sm py-2 text-center text-[var(--rd-caption)]">
                          {dayLabel(msg.created_at)}
                        </p>
                      )}
                      <div className={`flex ${mine ? 'justify-end' : ''}`}>
                        <div
                          className={`flex min-w-0 max-w-[85%] flex-col gap-2 rounded-[20px] px-4 py-3 lg:max-w-[75%] ${
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
                            {mine ? `${t('admin.tickets.adminLabel')} · ` : ''}
                            {timeLabel(msg.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {ticket.status === 'closed' ? (
                <p className="rd-p-md shrink-0 text-center text-[var(--rd-caption)]">
                  {t(statusKey('closed'))}
                </p>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (canSend) replyMutation.mutate();
                  }}
                  className="flex shrink-0 flex-col gap-2"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPT_STRING}
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <div className="flex flex-col gap-2 rounded-[24px] border-2 border-transparent bg-[var(--rd-field)] p-2 focus-within:border-[var(--rd-action)]">
                    {attachments.length > 0 && (
                      <div className="flex flex-wrap gap-2 px-1 pt-1">
                        {attachments.map((att) => (
                          <div key={att.id} className="relative">
                            {att.preview ? (
                              <img
                                src={att.preview}
                                alt={t('common.preview')}
                                className="size-14 rounded-[10px] object-cover"
                              />
                            ) : (
                              <div className="flex size-14 flex-col items-center justify-center gap-0.5 rounded-[10px] bg-[var(--rd-chip)] text-[10px] text-[var(--rd-caption)]">
                                <DocumentIcon className="h-4 w-4" />
                                {att.file.name.slice(-6)}
                              </div>
                            )}
                            {att.uploading && (
                              <div className="absolute inset-0 flex items-center justify-center rounded-[10px] bg-black/40">
                                <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                              </div>
                            )}
                            {att.error && (
                              <div
                                title={att.error}
                                className="absolute inset-0 flex items-center justify-center rounded-[10px] bg-[var(--rd-error-bg)] text-xs text-[var(--rd-error-text)]"
                              >
                                !
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => removeAttachment(att.id)}
                              aria-label={t('common.delete', 'Удалить')}
                              className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-[var(--rd-heading)] text-[var(--rd-page)]"
                            >
                              <RdIcon name="cabinet/x-small" size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex items-end gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={attachments.length >= 10 || attachments.some((a) => a.uploading)}
                        aria-label={t('admin.tickets.attachMedia')}
                        title={t('admin.tickets.attachMedia')}
                        className="flex size-10 shrink-0 items-center justify-center rounded-full text-[var(--rd-caption)] transition-colors hover:bg-[var(--rd-chip-hover)] hover:text-[var(--rd-heading)] disabled:opacity-40"
                      >
                        <RdIcon name="cabinet/paperclip" size={20} />
                      </button>
                      <textarea
                        ref={replyRef}
                        rows={1}
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder={t('admin.tickets.replyPlaceholder')}
                        aria-label={t('admin.tickets.replyPlaceholder')}
                        enterKeyHint="send"
                        onKeyDown={(e) => {
                          // Desktop: Enter sends, Shift+Enter breaks the line.
                          // Phones: Enter is a new line, the button sends.
                          if (!isDesktop) return;
                          if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
                          e.preventDefault();
                          if (canSend) e.currentTarget.form?.requestSubmit();
                        }}
                        className="rd-p-md max-h-[calc(50dvh-136px)] min-h-[40px] flex-1 resize-none overflow-y-auto bg-transparent py-[10px] text-[var(--rd-heading)] outline-none placeholder:text-[var(--rd-placeholder)]"
                      />
                      <button
                        type="submit"
                        disabled={!canSend}
                        aria-label={t('admin.tickets.sendReply')}
                        title={t('admin.tickets.sendReply')}
                        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--rd-action)] text-[var(--rd-on-action)] transition-colors hover:bg-[var(--rd-action-hover)] disabled:bg-[var(--rd-chip)] disabled:text-[var(--rd-placeholder)]"
                      >
                        {replyMutation.isPending ? (
                          <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        ) : (
                          <RdIcon name="arrow-right" size={20} className="-rotate-90" />
                        )}
                      </button>
                    </div>
                  </div>
                  {replyError && (
                    <p role="alert" className="rd-p-sm px-2 text-[var(--rd-error-text)]">
                      {replyError}
                    </p>
                  )}
                </form>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
