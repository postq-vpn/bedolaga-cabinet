import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { balanceApi } from '@/api/balance';
import { giftApi } from '@/api/gift';
import { subscriptionApi } from '@/api/subscription';
import { useToast } from '@/components/Toast';
import { useAuthStore } from '@/store/auth';
import { getInsufficientBalanceError } from '@/utils/subscriptionHelpers';
import {
  PENDING_PURCHASE_EVENT,
  clearPendingGift,
  clearPendingPurchase,
  loadPendingGift,
  loadPendingPurchase,
} from './pendingPurchase';

const POLL_MS = 5000;
/** How long to wait for the payment to land after coming back. */
const WAIT_MS = 15 * 60 * 1000;

/**
 * Issues the subscription automatically after a top-up: while a pending
 * purchase is saved, polls the balance and, once it covers the price, buys
 * with the saved checkout id (idempotent) and returns to the dashboard.
 * Mounted once in AppShell, so it runs on whatever page the payment provider
 * sends the user back to.
 */
export function usePendingPurchase() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const busy = useRef(false);
  // Latest callbacks without restarting the polling chain on every render.
  const deps = useRef({ navigate, queryClient, showToast, t });
  deps.current = { navigate, queryClient, showToast, t };
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const onSaved = () => setRevision((r) => r + 1);
    window.addEventListener(PENDING_PURCHASE_EVENT, onSaved);
    return () => window.removeEventListener(PENDING_PURCHASE_EVENT, onSaved);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: revision restarts polling after a new intent is saved
  useEffect(() => {
    if (!isAuthenticated || (!loadPendingPurchase() && !loadPendingGift())) return;
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const schedule = () => {
      if (!stopped && Date.now() - startedAt < WAIT_MS) timer = setTimeout(tick, POLL_MS);
    };
    const tick = async () => {
      const pending = loadPendingPurchase();
      const gift = loadPendingGift();
      if (stopped || (!pending && !gift)) return;
      if (busy.current) {
        schedule();
        return;
      }
      busy.current = true;
      const { navigate, queryClient, showToast, t } = deps.current;
      const finish = () => {
        clearPendingPurchase();
        for (const key of ['subscription', 'subscriptions-list', 'balance', 'purchase-options']) {
          queryClient.invalidateQueries({ queryKey: [key] });
        }
        showToast({ type: 'success', message: t('postq.purchase.autoDone') });
        navigate('/', { replace: true });
      };
      try {
        const balance = await balanceApi.getBalance();
        if (gift && balance.balance_kopeks >= gift.totalKopeks) {
          // Dropped first: a second tab must not buy the same gift again.
          clearPendingGift();
          try {
            await giftApi.createPurchase({
              tariff_id: gift.tariffId,
              period_days: gift.days,
              payment_mode: 'balance',
            });
            for (const key of ['balance', 'gift-config', 'gift-sent']) {
              queryClient.invalidateQueries({ queryKey: [key] });
            }
            showToast({ type: 'success', message: t('postq.gift.autoDone') });
            navigate('/gift?tab=myGifts', { replace: true });
          } catch {
            showToast({ type: 'error', message: t('postq.gift.autoFailed') });
          }
          if (!pending) return;
        }
        if (pending && balance.balance_kopeks >= pending.totalKopeks) {
          // No device selection to bind — buy straight away; the price is
          // re-checked server-side. (Renewals can get here without a quote.)
          if (pending.devices === undefined) {
            await subscriptionApi.purchaseTariff(
              pending.tariffId,
              pending.days,
              undefined,
              pending.subscriptionId,
              pending.checkoutId,
            );
            finish();
            return;
          }
          // Fresh quote for the device selection; the price is re-checked server-side.
          const quote = await subscriptionApi.previewTariffPurchase({
            tariff_id: pending.tariffId,
            period_days: pending.days,
            subscription_id: pending.subscriptionId,
            selected_device_limit: pending.devices,
          });
          if (quote.missing_kopeks <= 0) {
            await subscriptionApi.purchaseTariff(
              pending.tariffId,
              pending.days,
              undefined,
              pending.subscriptionId,
              pending.checkoutId,
              quote.device_selection.selectable && pending.devices !== undefined
                ? { selected_device_limit: pending.devices, quote_id: quote.quote_id }
                : undefined,
            );
            finish();
            return;
          }
        }
      } catch (err) {
        // Not enough yet (another charge raced us) — keep waiting; anything
        // else (tariff gone, invalid) drops the intent so it can't loop.
        if (!getInsufficientBalanceError(err)) {
          clearPendingPurchase();
          showToast({ type: 'error', message: t('postq.purchase.autoFailed') });
          return;
        }
      } finally {
        busy.current = false;
      }
      schedule();
    };

    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [isAuthenticated, revision]);
}
