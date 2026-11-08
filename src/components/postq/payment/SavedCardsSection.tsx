import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { balanceApi } from '@/api/balance';
import { subscriptionApi } from '@/api/subscription';
import { useToast } from '@/components/Toast';
import { useDestructiveConfirm } from '@/platform/hooks/useNativeDialog';
import { uiLocale } from '@/utils/uiLocale';
import { cn } from '@/lib/utils';

const SBP_STATUS: Record<string, string> = {
  PENDING: 'subscription.sbpRecurring.statusPending',
  ACTIVE: 'subscription.sbpRecurring.statusActive',
  PAST_DUE: 'subscription.sbpRecurring.statusPastDue',
};

/**
 * Saved cards and the SBP autopay binding, meant for the payment page (no
 * separate screen in postq). NOT RENDERED yet: recurrent payments don't work —
 * put <SavedCardsSection /> back into Balance.postq.tsx once they do.
 */
export function SavedCardsSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const confirm = useDestructiveConfirm();
  const [busy, setBusy] = useState<string | null>(null);

  const { data: saved } = useQuery({
    queryKey: ['saved-cards'],
    queryFn: balanceApi.getSavedCards,
    staleTime: 5 * 60 * 1000,
  });

  // One subscription in postq: its SBP binding, if the feature answers at all
  // (it replies 403 when switched off — hence no retries).
  const { data: subs } = useQuery({
    queryKey: ['subscriptions-list'],
    queryFn: subscriptionApi.getSubscriptions,
  });
  const sub = (subs?.subscriptions ?? []).find((s) => !s.is_trial);
  const { data: sbp } = useQuery({
    queryKey: ['sbp-recurring', sub?.id],
    queryFn: () => subscriptionApi.getSbpRecurring(sub?.id ?? 0),
    enabled: !!sub,
    retry: false,
  });

  const cards = saved?.cards ?? [];
  const sbpBound = !!sbp && sbp.status !== 'none';
  if (!saved?.recurrent_enabled && !cards.length && !sbpBound) return null;

  const run = async (
    key: string,
    question: string,
    action: string,
    fn: () => Promise<unknown>,
    ok: string,
    fail: string,
  ) => {
    if (busy) return;
    if (!(await confirm(question, action))) return;
    setBusy(key);
    try {
      await fn();
      showToast({ type: 'success', title: ok, message: '', duration: 3000 });
    } catch {
      showToast({ type: 'error', title: fail, message: '', duration: 3000 });
    } finally {
      setBusy(null);
    }
  };

  const rows = [
    ...cards.map((card) => ({
      key: `card-${card.id}`,
      title: card.card_last4
        ? `${card.card_type || t('balance.savedCards.card')} •••• ${card.card_last4}`
        : card.title || t('balance.savedCards.card'),
      detail: t('balance.savedCards.linkedAt', {
        date: new Date(card.created_at).toLocaleDateString(uiLocale()),
      }),
      action: t('balance.savedCards.unlink'),
      onAction: () =>
        run(
          `card-${card.id}`,
          t('balance.savedCards.confirmUnlink'),
          t('balance.savedCards.unlink'),
          async () => {
            await balanceApi.deleteSavedCard(card.id);
            await queryClient.invalidateQueries({ queryKey: ['saved-cards'] });
          },
          t('balance.savedCards.unlinkSuccess'),
          t('balance.savedCards.unlinkError'),
        ),
    })),
    ...(sbpBound && sub
      ? [
          {
            key: 'sbp',
            title: t('balance.savedCards.sbpSection'),
            detail: t(SBP_STATUS[sbp.status] ?? 'balance.savedCards.sbpBinding'),
            action: t('subscription.sbpRecurring.cancel'),
            onAction: () =>
              run(
                'sbp',
                t('subscription.sbpRecurring.confirmCancel'),
                t('subscription.sbpRecurring.cancel'),
                async () => {
                  await subscriptionApi.cancelSbpRecurring(sub.id);
                  await queryClient.invalidateQueries({ queryKey: ['sbp-recurring', sub.id] });
                },
                t('subscription.sbpRecurring.cancelled'),
                t('subscription.sbpRecurring.cancelError'),
              ),
          },
        ]
      : []),
  ];

  return (
    <section className="rd-card rd-card--lg flex flex-col gap-2">
      <h2 className="rd-h6 text-[var(--rd-heading)]">{t('postq.payment.savedCards')}</h2>
      {rows.length === 0 ? (
        <p className="rd-p-md pt-2 text-[var(--rd-caption)]">{t('balance.savedCards.noCards')}</p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((row, i) => (
            <li
              key={row.key}
              className={cn(
                'flex items-center justify-between gap-4 py-4',
                i < rows.length - 1 && 'border-b border-[var(--rd-divider)]',
              )}
            >
              <div className="rd-p-md flex min-w-0 flex-col gap-1">
                <span className="truncate font-medium text-[var(--rd-heading)]">{row.title}</span>
                <span className="text-[var(--rd-caption)]">{row.detail}</span>
              </div>
              <button
                type="button"
                onClick={row.onAction}
                disabled={busy !== null}
                className="rd-p-md shrink-0 text-[var(--rd-caption)] transition-colors hover:text-[var(--rd-error-text)] disabled:opacity-50"
              >
                {busy === row.key ? t('common.loading') : row.action}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
