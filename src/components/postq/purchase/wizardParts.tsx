import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { RdIcon } from '../RdIcon';

/**
 * Pieces shared by the step-by-step checkouts (subscription purchase and the
 * gift): the «Назад / Шаг N из M» row, the progress bars, the period tile and
 * the phone bar with the total. Both flows render them, so they stay alike.
 */

/** «Назад» (or a link out on the first step) and a plain «Шаг 2 из 3». */
export function WizardNav({
  step,
  total,
  onBack,
  exit,
}: {
  step: number;
  total: number;
  onBack: () => void;
  /** Where the first step leads back to; nothing is shown when omitted. */
  exit?: { to: string; label: string };
}) {
  const { t } = useTranslation();
  const linkClass = 'flex items-center gap-2 transition-colors hover:text-[var(--rd-heading)]';
  return (
    <div className="rd-p-md flex items-center justify-between gap-4 font-medium text-[var(--rd-caption)]">
      {step > 1 ? (
        <button type="button" onClick={onBack} className={linkClass}>
          <RdIcon name="arrow-right" size={20} className="rotate-180" />
          {t('common.back')}
        </button>
      ) : exit ? (
        <Link to={exit.to} className={linkClass}>
          <RdIcon name="arrow-right" size={20} className="rotate-180" />
          {exit.label}
        </Link>
      ) : (
        <span />
      )}
      <span>{t('postq.purchase.stepOf', { step, total })}</span>
    </div>
  );
}

/** Progress bars with step titles (tablets and up). Done steps can be reopened. */
export function WizardProgress({
  titles,
  step,
  onStep,
}: {
  titles: string[];
  step: number;
  onStep: (step: number) => void;
}) {
  return (
    <ol
      className="hidden gap-3 sm:grid sm:gap-6"
      style={{ gridTemplateColumns: `repeat(${titles.length}, minmax(0, 1fr))` }}
    >
      {titles.map((title, i) => {
        const n = i + 1;
        const done = n < step;
        const current = n === step;
        return (
          <li key={title} className="flex min-w-0 flex-col gap-4">
            <span
              className={cn(
                'h-2 w-full rounded-[4px]',
                done || current ? 'bg-[var(--rd-action)]' : 'bg-[var(--rd-border)]',
              )}
            />
            <button
              type="button"
              disabled={n > step}
              onClick={() => onStep(n)}
              className="rd-p-lg flex min-w-0 items-center gap-1 text-left disabled:cursor-default"
            >
              {done ? (
                <RdIcon name="cabinet/check" size={18} className="text-[var(--rd-action)]" />
              ) : (
                <span className={current ? 'text-[var(--rd-action)]' : 'text-[var(--rd-caption)]'}>
                  {n}.
                </span>
              )}
              <span
                className={cn(
                  'truncate',
                  done || current ? 'text-[var(--rd-body)]' : 'text-[var(--rd-caption)]',
                )}
              >
                {title}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** Step heading under the progress bars. */
export function WizardHeading({
  title,
  text,
  as: Tag = 'h1',
}: {
  title: string;
  text: string;
  /** h2 when the page already has its own title (the gift page). */
  as?: 'h1' | 'h2';
}) {
  return (
    <div className="flex flex-col gap-3 pt-3">
      <Tag className={cn(Tag === 'h1' ? 'rd-h3' : 'rd-h4', 'text-[var(--rd-heading)]')}>
        {title}
      </Tag>
      <p className="rd-p-lg text-[var(--rd-caption)]">{text}</p>
    </div>
  );
}

/**
 * The «Срок подписки» tile: a compact row on phones (period and discount on
 * the left, price on the right), a tall card with a radio from tablets up.
 */
export function PeriodTile({
  label,
  priceKopeks,
  originalKopeks,
  discountPercent,
  selected,
  onSelect,
  money,
  moneyShort,
}: {
  label: string;
  priceKopeks: number;
  originalKopeks?: number | null;
  discountPercent?: number | null;
  selected: boolean;
  onSelect: () => void;
  money: (kopeks: number) => string;
  moneyShort: (kopeks: number) => string;
}) {
  const hasDiscount = !!originalKopeks && originalKopeks > priceKopeks;
  const percent = hasDiscount && discountPercent ? discountPercent : null;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex h-16 items-center rounded-[var(--rd-radius-md)] border-2 px-4 text-left transition-colors sm:h-[180px] sm:items-stretch sm:p-6',
        selected
          ? 'border-[var(--rd-action)] bg-[var(--rd-help)]'
          : 'border-transparent bg-[var(--rd-field)] hover:bg-[var(--rd-chip-hover)]',
      )}
    >
      <span className="flex h-full w-full items-center justify-between gap-3 sm:hidden">
        <span className="flex min-w-0 items-center gap-2">
          <span className="rd-p-md truncate font-medium text-[var(--rd-heading)]">{label}</span>
          {percent ? (
            <span
              className={cn(
                'rd-p-sm flex h-6 shrink-0 items-center rounded-[8px] px-2 font-medium',
                selected
                  ? 'bg-[var(--rd-action)] text-[var(--rd-on-action)]'
                  : 'bg-[var(--rd-surface)] text-[var(--rd-body)]',
              )}
            >
              −{percent}%
            </span>
          ) : null}
        </span>
        <span className="flex shrink-0 flex-col items-end">
          {hasDiscount && (
            <s className="rd-p-sm text-[var(--rd-placeholder)]">{moneyShort(originalKopeks)}</s>
          )}
          <span className="rd-p-md font-medium text-[var(--rd-heading)]">
            {moneyShort(priceKopeks)}
          </span>
        </span>
      </span>

      <span className="hidden w-full flex-col justify-between sm:flex">
        <span className="flex w-full items-center justify-between gap-3">
          <span className="rd-h6 text-[var(--rd-heading)]">{label}</span>
          <span
            aria-hidden
            className={cn(
              'shrink-0 rounded-full bg-[var(--rd-surface)]',
              selected
                ? 'size-5 border-[6px] border-[var(--rd-action)]'
                : 'size-6 border-2 border-[var(--rd-border)]',
            )}
          />
        </span>
        <span className="flex w-full items-end justify-between gap-3">
          <span className="flex flex-col gap-2">
            {hasDiscount && (
              <s className="rd-p-md font-medium text-[var(--rd-placeholder)]">
                {money(originalKopeks)}
              </s>
            )}
            <span className="rd-h6 text-[var(--rd-heading)]">{money(priceKopeks)}</span>
          </span>
          {percent ? (
            <span
              className={cn(
                'rd-p-md shrink-0 rounded-[12px] px-3 py-2 font-medium',
                selected
                  ? 'bg-[var(--rd-help)] text-[var(--rd-action)]'
                  : 'bg-[var(--rd-surface)] text-[var(--rd-body)]',
              )}
            >
              −{percent}%
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}

/** A row of the confirmation step: caption, value and a link back to its step. */
export function ConfirmRow({
  label,
  value,
  action,
}: {
  label: string;
  value: ReactNode;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col gap-2 rounded-[var(--rd-radius-md)] bg-[var(--rd-field)] p-4 sm:p-6">
      <div className="rd-p-md flex items-center justify-between gap-4">
        <span className="text-[var(--rd-caption)]">{label}</span>
        {action && (
          <button
            type="button"
            className="rd-link-action shrink-0 whitespace-nowrap"
            onClick={action.onClick}
          >
            {action.label}
          </button>
        )}
      </div>
      <span className="rd-h6 text-[var(--rd-heading)]">{value}</span>
    </div>
  );
}

/** Phones: the total and the step's action stay on screen. */
export function MobileTotalBar({
  discountPercent,
  caption,
  strike,
  amount,
  dim,
  action,
}: {
  discountPercent: number;
  /** Small line above the total; `strike` crosses it out (the old price). */
  caption?: string | null;
  strike?: boolean;
  amount: string;
  dim?: boolean;
  action: ReactNode;
}) {
  return (
    <>
      <div className="h-20 lg:hidden" aria-hidden />
      <div
        className="fixed z-40 lg:hidden"
        style={{
          bottom: 'max(8px, env(safe-area-inset-bottom, 0px))',
          left: 'max(16px, env(safe-area-inset-left, 0px))',
          right: 'max(16px, env(safe-area-inset-right, 0px))',
        }}
      >
        <div className="rd-liquid-glass relative flex items-center gap-4 rounded-[24px] p-2 pl-4">
          {/* The discount as a small card peeking out over the bar's top edge. */}
          {discountPercent > 0 && (
            <span className="rd-p-sm pointer-events-none absolute -top-3 left-2 flex h-6 -rotate-3 items-center rounded-[8px] bg-[var(--rd-action)] px-2 font-medium text-[var(--rd-on-action)]">
              −{discountPercent}%
            </span>
          )}
          <div className="flex min-w-0 flex-1 flex-col">
            {caption &&
              (strike ? (
                <s className="rd-p-sm truncate text-[var(--rd-caption)]">{caption}</s>
              ) : (
                <span className="rd-p-sm truncate text-[var(--rd-caption)]">{caption}</span>
              ))}
            <span
              className={cn(
                'truncate text-[20px] font-bold leading-6 text-[var(--rd-heading)]',
                dim && 'opacity-60',
              )}
            >
              {amount}
            </span>
          </div>
          {action}
        </div>
      </div>
    </>
  );
}
