import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { balanceApi } from '../api/balance';
import { type ActiveDiscount, promoApi } from '../api/promo';

/**
 * Everything a code can change: a discount code changes every price the server
 * quotes, a balance code what's missing, a days code the subscription.
 */
export function invalidatePromoDependents(queryClient: QueryClient) {
  for (const key of [
    'balance',
    'transactions',
    'purchase-options',
    'subscriptions-list',
    'subscription',
    'active-discount',
    'tariff-device-quote',
    'tariff-recurrent-quote',
  ]) {
    queryClient.invalidateQueries({ queryKey: [key] });
  }
}

/** «💸 Получена скидка» → «Получена скидка». */
export function stripLeadingEmoji(text: string) {
  return text.replace(/^(?:\p{Extended_Pictographic}|️|‍|\s)+/u, '');
}
import { useAuthStore } from '../store/auth';

export interface PromoSubscriptionChoice {
  id: number;
  tariff_name: string;
  days_left: number;
}

// Stable machine codes from the backend (detail = { code, message }), mapped to
// localized strings. Anything else reads as a server error.
const KNOWN_ERRORS = [
  'not_found',
  'expired',
  'inactive',
  'not_yet_valid',
  'used',
  'already_used_by_user',
  'active_discount_exists',
  'no_subscription_for_days',
  'subscription_not_found',
  'not_first_purchase',
  'daily_limit',
  'trial_subscription_exists',
  'trial_provisioning_failed',
  'user_not_found',
  'server_error',
];

/**
 * Promo code activation shared by the dashboard balance card and the payment
 * page. A code that grants days to one of several subscriptions comes back
 * with `select_subscription`; the caller shows `choices` and calls
 * `activate(id)` with the chosen one.
 */
export function usePromocode({ onSuccess }: { onSuccess?: () => void } = {}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const refreshUser = useAuthStore((s) => s.refreshUser);

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ message: string; amount: number } | null>(null);
  const [choices, setChoices] = useState<PromoSubscriptionChoice[] | null>(null);
  const [pendingCode, setPendingCode] = useState<string | null>(null);

  const reset = () => {
    setChoices(null);
    setPendingCode(null);
  };

  const activate = async (subscriptionId?: number) => {
    const value = subscriptionId ? pendingCode || '' : code.trim();
    if (!value) return;

    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await balanceApi.activatePromocode(value, subscriptionId);

      if (result.error === 'select_subscription' && result.eligible_subscriptions) {
        setChoices(result.eligible_subscriptions);
        setPendingCode(result.code || value);
        return;
      }

      if (result.success) {
        // A discount code is shown by its applied chip (PromoCodeField):
        // its own message would only repeat it.
        const hadDiscount =
          queryClient.getQueryData<ActiveDiscount>(['active-discount'])?.is_active ?? false;
        const discount = await queryClient
          .fetchQuery({ queryKey: ['active-discount'], queryFn: promoApi.getActiveDiscount })
          .catch(() => undefined);
        const newDiscount = !hadDiscount && !!discount?.is_active;
        setSuccess(
          newDiscount
            ? null
            : {
                // The bot's texts start with an emoji; the cabinet doesn't use them.
                message: stripLeadingEmoji(
                  result.bonus_description || t('balance.promocode.success'),
                ),
                amount: (result.balance_after || 0) - (result.balance_before || 0),
              },
        );
        setCode('');
        reset();
        onSuccess?.();
        await refreshUser();
        invalidatePromoDependents(queryClient);
      }
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: { code?: string } | string } } })
        .response?.data?.detail;
      const errCode = typeof detail === 'object' && detail ? detail.code : undefined;
      const key = errCode && KNOWN_ERRORS.includes(errCode) ? errCode : 'server_error';
      setError(t(`balance.promocode.errors.${key}`));
      reset();
    } finally {
      setLoading(false);
    }
  };

  return {
    code,
    setCode,
    loading,
    error,
    success,
    choices,
    activate,
    cancelChoice: reset,
  };
}
