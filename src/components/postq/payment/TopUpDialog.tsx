import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import { balanceApi } from '@/api/balance';
import { useCurrency } from '@/hooks/useCurrency';
import { usePlatform } from '@/platform';
import { openPaymentUrl } from '@/utils/openPaymentUrl';
import { saveTopUpPendingInfo } from '@/utils/topUpStorage';
import { getLocalizedApiErrorMessage } from '@/utils/api-error-display';
import { cn } from '@/lib/utils';
import { RdDialog } from '../RdDialog';
import { RdIcon } from '../RdIcon';
import { PaymentMethodGlyph } from './PaymentSidebar';
import { stripLeadingEmoji } from '@/utils/stripLeadingEmoji';

/**
 * Top-up in a popup (no frame yet, same system): pick a payment method and
 * its option, the amount is what's missing (raised to the method minimum),
 * then go to the provider. `onBeforePay` runs right before leaving — the
 * purchase wizard saves its pending purchase there, so the subscription is
 * issued automatically once the money lands.
 */
export function TopUpDialog({
  open,
  onOpenChange,
  amountKopeks,
  onBeforePay,
  autoText,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amountKopeks: number;
  onBeforePay?: () => void | Promise<void>;
  /** Subtitle when something completes after the payment (default: the subscription). */
  autoText?: string;
}) {
  const { t } = useTranslation();
  const { formatAmount, currencySymbol } = useCurrency();
  const { platform, openLink } = usePlatform();
  const money = (kopeks: number) => `${formatAmount(kopeks / 100)} ${currencySymbol}`;

  const { data: methods, isLoading } = useQuery({
    queryKey: ['payment-methods'],
    queryFn: balanceApi.getPaymentMethods,
    enabled: open,
  });
  const available = useMemo(() => (methods ?? []).filter((m) => m.is_available), [methods]);

  const [methodId, setMethodId] = useState<string | null>(null);
  const [optionId, setOptionId] = useState<string | null>(null);
  const [qr, setQr] = useState<{ payload: string; url: string } | null>(null);
  const method = available.find((m) => m.id === methodId) ?? available[0];
  useEffect(() => {
    if (!open) {
      setQr(null);
      return;
    }
    if (method && method.id !== methodId) setMethodId(method.id);
  }, [open, method, methodId]);
  useEffect(() => {
    setOptionId(method?.options?.[0]?.id ?? null);
  }, [method]);

  const optionMin = method?.options?.find((o) => o.id === optionId)?.min_amount_kopeks ?? 0;
  // Whole rubles, never below what the method accepts.
  const amount = method
    ? Math.min(
        method.max_amount_kopeks,
        Math.max(Math.ceil(amountKopeks / 100) * 100, method.min_amount_kopeks, optionMin),
      )
    : Math.ceil(amountKopeks / 100) * 100;

  const pay = useMutation({
    mutationFn: () => {
      if (!method) throw new Error('No payment method');
      return balanceApi.createTopUp(amount, method.id, optionId || undefined);
    },
    onSuccess: async (data) => {
      const url = data.payment_url;
      if (!url || !method) return;
      await onBeforePay?.();
      saveTopUpPendingInfo({
        amount_kopeks: data.amount_kopeks,
        method_id: method.id,
        method_name: method.name || method.id,
        payment_id: data.payment_id,
        created_at: Date.now(),
      });
      if (data.qr_payload) {
        setQr({ payload: data.qr_payload, url });
        return;
      }
      openPaymentUrl(url, platform, openLink);
    },
  });

  return (
    <RdDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('postq.topUp.title', { amount: money(amount) })}
      description={
        onBeforePay ? (autoText ?? t('postq.topUp.subtitleAuto')) : t('postq.topUp.subtitle')
      }
    >
      {qr ? (
        <div className="flex flex-col items-center gap-4">
          <div className="rounded-[var(--rd-radius-sm)] bg-white p-4">
            <QRCodeSVG value={qr.payload} size={200} level="M" includeMargin={false} />
          </div>
          <p className="rd-p-md text-center text-[var(--rd-caption)]">
            {t('balance.scanQrToPay', 'Отсканируйте QR-код в приложении банка или откройте оплату')}
          </p>
          <button
            type="button"
            className="rd-btn w-full"
            onClick={() => openPaymentUrl(qr.url, platform, openLink)}
          >
            {t('balance.openPaymentPage')}
          </button>
        </div>
      ) : (
        <>
          {/* Compact tiles like on the payment page: glyph top-left, name at
                  the bottom; the chosen one gets an action border and a check. */}
          <div role="radiogroup" className="grid grid-cols-2 gap-3">
            {isLoading ? (
              <p className="rd-p-md col-span-2 text-[var(--rd-caption)]">{t('common.loading')}</p>
            ) : (
              available.map((m) => {
                const selected = m.id === method?.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setMethodId(m.id)}
                    className={cn(
                      'flex min-h-[104px] flex-col justify-between gap-4 rounded-[var(--rd-radius-control)] border-2 bg-[var(--rd-field)] p-4 text-left transition-colors',
                      selected
                        ? 'border-[var(--rd-action)]'
                        : 'border-transparent hover:border-[var(--rd-border)]',
                    )}
                  >
                    <span className="flex w-full items-start justify-between">
                      <PaymentMethodGlyph methodId={m.id} size={36} />
                      {selected && (
                        <span
                          aria-hidden
                          className="flex size-6 items-center justify-center rounded-full bg-[var(--rd-action)] text-[var(--rd-on-action)]"
                        >
                          <RdIcon name="cabinet/check" size={16} />
                        </span>
                      )}
                    </span>
                    <span className="rd-p-md text-[var(--rd-heading)]">{m.name || m.id}</span>
                  </button>
                );
              })
            )}
          </div>

          {method?.options && method.options.length > 1 && (
            <div className="flex gap-1 rounded-[12px] bg-[var(--rd-field)] p-1">
              {method.options.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={o.id === optionId}
                  onClick={() => setOptionId(o.id)}
                  className={cn(
                    'rd-p-md h-10 flex-1 rounded-[8px] transition-colors',
                    o.id === optionId
                      ? 'bg-[var(--rd-surface)] font-medium text-[var(--rd-heading)]'
                      : 'text-[var(--rd-caption)] hover:text-[var(--rd-heading)]',
                  )}
                >
                  {stripLeadingEmoji(o.name)}
                </button>
              ))}
            </div>
          )}

          {amount > Math.ceil(amountKopeks / 100) * 100 && (
            <p className="rd-p-sm text-[var(--rd-caption)]">
              {t('postq.topUp.minimum', { amount: money(amount) })}
            </p>
          )}
          {pay.isError && (
            <p role="alert" className="rd-p-sm text-[var(--rd-error-text)]">
              {getLocalizedApiErrorMessage(pay.error, t('common.error'), t)}
            </p>
          )}

          <button
            type="button"
            className="rd-btn !min-h-16 w-full !rounded-[var(--rd-radius-control)]"
            disabled={!method || pay.isPending}
            onClick={() => pay.mutate()}
          >
            {pay.isPending ? t('common.loading') : t('postq.topUp.pay', { amount: money(amount) })}
          </button>
        </>
      )}
    </RdDialog>
  );
}
