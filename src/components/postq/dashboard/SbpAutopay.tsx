import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { subscriptionApi } from '@/api/subscription';
import { useToast } from '@/components/Toast';
import { useCurrency } from '@/hooks/useCurrency';
import { usePlatform } from '@/platform';
import { useDestructiveConfirm } from '@/platform/hooks/useNativeDialog';
import type { Subscription } from '@/types';
import { getLocalizedApiErrorMessage } from '@/utils/api-error-display';
import { showsAutopayToggle } from '@/utils/legacySubscription';
import { openPaymentUrl } from '@/utils/openPaymentUrl';
import { isRecurringFeatureOff } from '@/utils/recurringFeature';
import {
  isSbpFeatureDisabledError,
  sbpIntervalLabelKey,
  sbpUiState,
  type SbpUiState,
} from '@/utils/sbpRecurring';
import { uiLocale } from '@/utils/uiLocale';
import { cn } from '@/lib/utils';

/** What the SBP row needs to know about a subscription (full or list item). */
type SbpSubscription = Pick<Subscription, 'id' | 'is_trial'> &
  Partial<Pick<Subscription, 'is_daily' | 'requires_tariff_selection'>>;

/**
 * SBP auto-debit (Platega recurrent) of one subscription: whether it's offered
 * at all, and its state. The dashboard card asks first, so it can hide the
 * balance auto-renewal while the bank pays — the bot cancels one when the other
 * is switched on, two «auto-renewal» rows would only confuse.
 */
export function useSbpAutopay(subscription: SbpSubscription) {
  const offered = showsAutopayToggle({
    is_trial: subscription.is_trial,
    is_daily: !!subscription.is_daily,
    requires_tariff_selection: subscription.requires_tariff_selection,
  } as Pick<Subscription, 'is_trial' | 'is_daily' | 'requires_tariff_selection'>);
  const { info, disabled } = useSbpRecurring(subscription.id, offered);
  // Not known yet, or failed otherwise: show nothing rather than a wrong «off».
  const state: SbpUiState =
    !offered || (info === undefined && !disabled) ? 'hidden' : sbpUiState(info, disabled);
  return { state, info };
}

/**
 * The SBP binding of a subscription, asked only when the feature is on
 * (otherwise the backend answers 403). `bound`: a binding is alive — pending,
 * active or past due.
 */
export function useSbpRecurring(subscriptionId: number | undefined, enabled = true) {
  const ask = enabled && subscriptionId !== undefined;
  const options = useQuery({
    queryKey: ['purchase-options', subscriptionId],
    queryFn: () => subscriptionApi.getPurchaseOptions(subscriptionId),
    enabled: ask,
  });
  const settled = options.isSuccess || options.isError;
  const flagOff = isRecurringFeatureOff(options.data, 'platega_recurrent_enabled');
  const query = useQuery({
    queryKey: ['sbp-recurring', subscriptionId],
    queryFn: () => subscriptionApi.getSbpRecurring(subscriptionId),
    enabled: ask && settled && !flagOff,
    retry: false,
    // While the bank confirms the binding, ask again until it flips.
    refetchInterval: (q) => (q.state.data?.status === 'PENDING' ? 8000 : false),
  });
  const status = query.data?.status;
  return {
    info: query.data,
    disabled: flagOff || isSbpFeatureDisabledError(query.error),
    bound: status === 'PENDING' || status === 'ACTIVE' || status === 'PAST_DUE',
  };
}

/**
 * «Автосписание через СБП» — the same row as «Автопродление» (title, caption,
 * switch). On: the bot creates the binding and the bank page opens to confirm
 * it. Off: asks, then cancels. Used on the dashboard card and in the profile.
 */
export function SbpAutopayRow({
  subscription,
  sbp,
  className,
}: {
  subscription: SbpSubscription;
  sbp: ReturnType<typeof useSbpAutopay>;
  className?: string;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { platform, openLink } = usePlatform();
  const { showToast } = useToast();
  const confirm = useDestructiveConfirm();
  const { formatAmount, currencySymbol } = useCurrency();
  const money = (kopeks: number) =>
    `${formatAmount(kopeks / 100, kopeks % 100 === 0 ? 0 : 2)} ${currencySymbol}`;
  const subscriptionId = subscription.id;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['sbp-recurring', subscriptionId] });
    // Enabling SBP switches balance auto-renewal off on the server.
    queryClient.invalidateQueries({ queryKey: ['subscription'] });
    queryClient.invalidateQueries({ queryKey: ['subscriptions-list'] });
  };
  const fail = (error: unknown, fallback: string) =>
    showToast({ type: 'error', message: getLocalizedApiErrorMessage(error, t(fallback), t) });

  const enable = useMutation({
    mutationFn: () => subscriptionApi.enableSbpRecurring(subscriptionId),
    onSuccess: (data) => {
      refresh();
      if (data.redirect_url) openPaymentUrl(data.redirect_url, platform, openLink);
    },
    onError: (e) => fail(e, 'subscription.sbpRecurring.enableError'),
  });
  const cancel = useMutation({
    mutationFn: () => subscriptionApi.cancelSbpRecurring(subscriptionId),
    onSuccess: () => {
      refresh();
      showToast({ type: 'success', message: t('postq.sbp.disabled') });
    },
    onError: (e) => fail(e, 'subscription.sbpRecurring.cancelError'),
  });

  const { state, info } = sbp;
  if (state === 'hidden') return null;

  const on = state !== 'off';
  const busy = enable.isPending || cancel.isPending;
  const toggle = async () => {
    if (busy) return;
    if (!on) return enable.mutate();
    const ok = await confirm(
      t('postq.sbp.confirmDisable'),
      t('postq.sbp.disable'),
      t('postq.sbp.confirmDisableTitle'),
    );
    if (ok) cancel.mutate();
  };

  const next = info?.next_charge_at
    ? new Date(info.next_charge_at).toLocaleDateString(uiLocale(), {
        day: 'numeric',
        month: 'long',
      })
    : null;
  const bankUrl = state === 'pending' ? info?.redirect_url : null;
  // Platega gives 30 minutes to confirm in the bank, then drops the attempt
  // (the row turns off by itself; balance auto-renewal stays as it was).
  const confirmUntil =
    state === 'pending' && info?.confirm_until ? new Date(info.confirm_until) : null;
  const confirmExpired = !!confirmUntil && confirmUntil.getTime() <= Date.now();
  const caption =
    state === 'off' ? (
      t('postq.sbp.offText')
    ) : state === 'pending' ? (
      <>
        {confirmExpired
          ? t('postq.sbp.pendingExpired')
          : confirmUntil
            ? t('postq.sbp.pendingUntil', {
                time: confirmUntil.toLocaleTimeString(uiLocale(), {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              })
            : t('postq.sbp.pendingText')}
        {bankUrl && !confirmExpired && (
          <>
            <br />
            <button
              type="button"
              onClick={() => openPaymentUrl(bankUrl, platform, openLink)}
              className="rd-link-action"
            >
              {t('postq.sbp.openBank')}
            </button>
          </>
        )}
      </>
    ) : state === 'past_due' ? (
      t('postq.sbp.pastDueText')
    ) : info?.amount_kopeks !== undefined ? (
      [
        t('postq.sbp.amountEvery', {
          amount: money(info.amount_kopeks),
          interval: t(sbpIntervalLabelKey(info.interval)),
        }),
        next && t('postq.sbp.nextCharge', { date: next }),
      ]
        .filter(Boolean)
        .join(', ')
    ) : (
      t('postq.sbp.activeText')
    );

  return (
    <div
      className={cn(
        'flex min-h-[76px] items-center justify-between gap-4 rounded-[var(--rd-radius-md)] bg-[var(--rd-field)] px-6 py-4',
        className,
      )}
    >
      <div className="rd-p-md flex min-w-0 flex-col gap-1">
        <span className="text-[var(--rd-heading)]">{t('postq.sbp.title')}</span>
        <span
          className={
            state === 'past_due' ? 'text-[var(--rd-error-text)]' : 'text-[var(--rd-caption)]'
          }
        >
          {caption}
        </span>
      </div>
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={busy}
        role="switch"
        aria-checked={on}
        aria-label={t('postq.sbp.title')}
        className="rd-switch shrink-0"
      />
    </div>
  );
}
