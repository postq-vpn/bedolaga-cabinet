import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { copyToClipboard } from '@/utils/clipboard';
import { cn } from '@/lib/utils';
import { RdIcon } from './RdIcon';

/** 48px text field on a grey fill; the action border on focus. */
export const RD_FIELD =
  'rd-p-md h-12 w-full rounded-[var(--rd-radius-sm)] border-2 border-transparent bg-[var(--rd-field)] px-4 text-[var(--rd-heading)] outline-none placeholder:text-[var(--rd-placeholder)] focus:border-[var(--rd-action)]';

/** Grey tile inside a card (Figma "Устройства", "Трафик"): 24px radius, 124px tall. */
export function StatTile({
  label,
  aside,
  value,
  footer,
  className,
  onClick,
}: {
  label: React.ReactNode;
  aside?: React.ReactNode;
  value: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  /** The whole tile is the button (e.g. devices → manage dialog). */
  onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={cn(
        'flex min-h-[112px] min-w-0 flex-1 flex-col gap-3 rounded-[var(--rd-radius-md)] bg-[var(--rd-field)] p-4 text-left sm:min-h-[124px] sm:p-6',
        onClick && 'transition-colors hover:bg-[var(--rd-chip-hover)]',
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <span className="rd-p-md truncate text-[var(--rd-caption)]">{label}</span>
          {aside}
        </div>
        <span className="truncate text-[clamp(15px,4.4vw,18px)] font-bold leading-6 text-[var(--rd-heading)] sm:text-[24px] sm:leading-8">
          {value}
        </span>
      </div>
      {footer && <div className="mt-auto">{footer}</div>}
    </Tag>
  );
}

/** 8px progress track: pink on a pale-pink track, or grey when inactive. */
export function ProgressTrack({
  percent,
  muted = false,
  label,
}: {
  percent: number;
  muted?: boolean;
  label?: string;
}) {
  const value = Math.max(0, Math.min(100, percent));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        'h-2 w-full overflow-hidden rounded-[var(--rd-radius-sm)]',
        muted ? 'bg-[var(--rd-border)]' : 'bg-[var(--rd-help)]',
      )}
    >
      <div
        className={cn(
          'h-full rounded-[var(--rd-radius-sm)] transition-[width] duration-500',
          muted ? 'bg-[var(--rd-placeholder)]' : 'bg-[var(--rd-action)]',
        )}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

/** Round "more" button in a card corner (Figma "Настройки подписки"). */
export function CornerLink({
  to,
  label,
  icon = 'ellipsis',
}: {
  to: string;
  label: string;
  icon?: 'ellipsis' | 'arrow';
}) {
  return (
    <Link
      to={to}
      aria-label={label}
      title={label}
      className="rd-icon-btn size-8 bg-[var(--rd-field)] text-[var(--rd-body)]"
    >
      <RdIcon name={icon === 'ellipsis' ? 'cabinet/ellipsis' : 'arrow-right'} size={20} />
    </Link>
  );
}

/** Coloured notice inside a card (Figma "Доступ приостановлен"). */
export function Notice({
  tone,
  title,
  text,
}: {
  tone: 'error' | 'warning';
  title: string;
  text?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        'flex min-h-[76px] items-center gap-4 rounded-[var(--rd-radius-md)] px-6 py-4',
        tone === 'error' ? 'bg-[var(--rd-error-bg)]' : 'bg-[var(--rd-warn-bg)]',
      )}
    >
      <RdIcon
        name={tone === 'error' ? 'cabinet/circle-alert' : 'cabinet/clock'}
        size={24}
        className={tone === 'error' ? 'text-[var(--rd-error)]' : 'text-[var(--rd-warn-icon)]'}
      />
      <div className="rd-p-md flex min-w-0 flex-col gap-1">
        <span
          className={cn(
            'font-medium',
            tone === 'error' ? 'text-[var(--rd-error)]' : 'text-[var(--rd-heading)]',
          )}
        >
          {title}
        </span>
        {text && <span className="text-[var(--rd-caption)]">{text}</span>}
      </div>
    </div>
  );
}

/** Read-only link with a copy button (Figma "Скопировать ссылку"). */
export function CopyField({
  label,
  value,
  surface = false,
}: {
  label: string;
  value: string;
  /** On a grey tile the field is white instead of grey. */
  surface?: boolean;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = () => {
    copyToClipboard(value)
      .then(() => {
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1000);
      })
      .catch(() => {});
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      <span className="rd-p-md text-[var(--rd-heading)]">{label}</span>
      <button
        type="button"
        onClick={copy}
        className={cn(
          'flex h-14 w-full items-center gap-3 rounded-[var(--rd-radius-sm)] px-4 text-left transition-colors hover:bg-[var(--rd-chip-hover)]',
          surface ? 'bg-[var(--rd-surface)]' : 'bg-[var(--rd-field)]',
        )}
        aria-label={`${label}: ${value}`}
      >
        <span className="rd-p-md min-w-0 flex-1 truncate text-[var(--rd-placeholder)]">
          {copied ? t('postq.dashboard.copied') : value}
        </span>
        <RdIcon
          name="cabinet/copy"
          size={18}
          className={copied ? 'text-[var(--rd-action)]' : 'text-[var(--rd-caption)]'}
        />
      </button>
    </div>
  );
}

/** Caption + big number (Figma "Показатель"). */
export function Metric({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <span className="rd-p-md truncate text-[var(--rd-caption)]">{label}</span>
      <span className="rd-h4 truncate text-[var(--rd-heading)]">{value}</span>
    </div>
  );
}

/** Promo card with an icon badge: badge + title on one line, text below,
 *  action under it on phones and on the right from `sm`. */
export function IconCard({
  icon,
  tone = 'action',
  title,
  text,
  action,
}: {
  icon: React.ReactNode;
  /** Badge tint: brand pink or Telegram blue. */
  tone?: 'action' | 'telegram';
  title: React.ReactNode;
  text: React.ReactNode;
  action: React.ReactNode;
}) {
  return (
    <section className="rd-card flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
        <div className="flex items-center gap-3 sm:contents">
          <span
            aria-hidden
            className={cn(
              'flex size-12 shrink-0 items-center justify-center rounded-[var(--rd-radius-sm)] sm:size-14 sm:rounded-[16px]',
              tone === 'telegram'
                ? 'bg-[#2aabee]/[0.12] text-[#2aabee]'
                : 'bg-[var(--rd-action-soft)] text-[var(--rd-action)]',
            )}
          >
            {icon}
          </span>
          <h2 className="text-balance text-[20px] font-bold leading-6 text-[var(--rd-heading)] sm:hidden">
            {title}
          </h2>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="hidden text-[20px] font-bold leading-7 text-[var(--rd-heading)] sm:block">
            {title}
          </h2>
          <p className="rd-p-md text-[var(--rd-caption)]">{text}</p>
        </div>
      </div>
      {action}
    </section>
  );
}
