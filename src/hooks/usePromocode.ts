import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { balanceApi } from '../api/balance';
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
        setSuccess({
          message: result.bonus_description || t('balance.promocode.success'),
          amount: (result.balance_after || 0) - (result.balance_before || 0),
        });
        setCode('');
        reset();
        onSuccess?.();
        await refreshUser();
        for (const key of [
          'balance',
          'transactions',
          'purchase-options',
          'subscriptions-list',
          'subscription',
        ]) {
          queryClient.invalidateQueries({ queryKey: [key] });
        }
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
