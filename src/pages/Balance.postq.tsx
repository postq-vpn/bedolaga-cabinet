import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSearchParams, useNavigate } from 'react-router';

import { useAuthStore } from '../store/auth';
import { balanceApi } from '../api/balance';
import { API } from '../config/constants';
import type { PaginatedResponse, Transaction } from '../types';

import { RdIcon } from '@/components/postq/RdIcon';
import {
  PaymentHeading,
  PaymentMethodGlyph,
  PaymentSidebar,
} from '@/components/postq/payment/PaymentSidebar';
import { isPaidStatus, isFailedStatus } from '../utils/paymentStatus';
import { transactionTypeLabelKey } from '../utils/transactionType';
import { useCurrency } from '../hooks/useCurrency';
import { uiLocale } from '@/utils/uiLocale';
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton';

export default function Balance() {
  const { t } = useTranslation();
  const refreshUser = useAuthStore((state) => state.refreshUser);
  const { formatAmount, currencySymbol } = useCurrency();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const paymentHandledRef = useRef(false);

  // Fetch balance from API
  // Keeps the balance fresh on every visit; PaymentSidebar reads the same query.
  useQuery({
    queryKey: ['balance'],
    queryFn: balanceApi.getBalance,
    staleTime: API.BALANCE_STALE_TIME_MS,
    refetchOnMount: 'always',
  });

  // Refresh user data on mount to sync balance in store
  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  // Handle payment return from payment gateway
  useEffect(() => {
    if (paymentHandledRef.current) return;

    const paymentStatus = searchParams.get('payment') || searchParams.get('status');

    const normalised = paymentStatus?.toLowerCase() ?? '';
    const isSuccess = isPaidStatus(normalised) || searchParams.get('success') === 'true';
    const isFailed = isFailedStatus(normalised);

    if (isSuccess) {
      paymentHandledRef.current = true;
      navigate('/balance/top-up/result?status=success', { replace: true });
    } else if (isFailed) {
      paymentHandledRef.current = true;
      navigate('/balance/top-up/result?status=failed', { replace: true });
    }
  }, [searchParams, navigate]);

  const [transactionsPage, setTransactionsPage] = useState(1);
  const [isHistoryOpen, setIsHistoryOpen] = useState(true);

  const { data: transactions, isLoading } = useQuery<PaginatedResponse<Transaction>>({
    queryKey: ['transactions', transactionsPage],
    queryFn: () => balanceApi.getTransactions({ per_page: 20, page: transactionsPage }),
    placeholderData: (previousData) => previousData,
  });

  const { data: paymentMethods } = useQuery({
    queryKey: ['payment-methods'],
    queryFn: balanceApi.getPaymentMethods,
  });

  // Coming from «Пополнить» elsewhere (insufficient balance, expired card): keep
  // the suggested amount and where to return after paying.
  const forwardParams = new URLSearchParams();
  for (const key of ['amount', 'returnTo']) {
    const value = searchParams.get(key);
    if (value) forwardParams.set(key, value);
  }
  const forwardQuery = forwardParams.size ? `?${forwardParams.toString()}` : '';

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <PaymentHeading />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <PaymentSidebar />

        <div className="contents lg:flex lg:min-w-0 lg:flex-1 lg:flex-col lg:gap-8">
          {paymentMethods && paymentMethods.length > 0 && (
            <section className="rd-card rd-card--lg order-2 flex flex-col gap-6 lg:order-none">
              <div className="flex flex-col gap-2">
                <h2 className="rd-h5 text-[var(--rd-heading)]">{t('postq.payment.topUpTitle')}</h2>
                <p className="rd-p-md text-[var(--rd-caption)]">
                  {t('postq.payment.topUpSubtitle')}
                </p>
              </div>
              {/* Compact tiles: glyph top-left, name at the bottom. Limits and
                  details live on the method's own page. */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(168px,1fr))]">
                {paymentMethods.map((method) => {
                  const methodKey = method.id.toLowerCase().replace(/-/g, '_');
                  const name =
                    method.name ||
                    t(`balance.paymentMethods.${methodKey}.name`, { defaultValue: method.id });
                  return (
                    <button
                      key={method.id}
                      type="button"
                      disabled={!method.is_available}
                      onClick={() => navigate(`/balance/top-up/${method.id}${forwardQuery}`)}
                      title={method.is_available ? undefined : t('postq.payment.unavailable')}
                      className="flex min-h-[104px] flex-col justify-between gap-4 rounded-[var(--rd-radius-control)] border-2 border-transparent bg-[var(--rd-field)] p-4 text-left transition-colors hover:border-[var(--rd-border)] focus-visible:border-[var(--rd-action)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-transparent"
                    >
                      <PaymentMethodGlyph methodId={method.id} size={36} />
                      <span className="rd-p-md text-[var(--rd-heading)]">{name}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          <section className="rd-card rd-card--lg order-3 flex flex-col gap-6 lg:order-none">
            <div className="flex items-center justify-between gap-4">
              <h2 className="rd-h5 text-[var(--rd-heading)]">{t('postq.payment.historyTitle')}</h2>
              <button
                type="button"
                onClick={() => setIsHistoryOpen(!isHistoryOpen)}
                aria-expanded={isHistoryOpen}
                aria-label={t('postq.payment.historyToggle')}
                className="rd-icon-btn size-8 bg-[var(--rd-field)] text-[var(--rd-body)]"
              >
                <RdIcon
                  name="cabinet/chevron-up"
                  size={16}
                  className={`transition-transform duration-200 ${isHistoryOpen ? '' : 'rotate-180'}`}
                />
              </button>
            </div>

            {isHistoryOpen &&
              (isLoading ? (
                <SkeletonGroup className="flex flex-col gap-3">
                  <Skeleton variant="card" count={3} className="h-16" />
                </SkeletonGroup>
              ) : transactions?.items && transactions.items.length > 0 ? (
                // Table rows, no cards: type and description on the left,
                // amount and date on the right, hairlines between rows.
                <ul className="flex flex-col divide-y divide-[var(--rd-divider)]">
                  {transactions.items.map((tx) => {
                    const isZero = tx.amount_rubles === 0;
                    const isPositive = tx.amount_rubles > 0;
                    const sign = isZero ? '' : isPositive ? '+' : '-';
                    return (
                      <li
                        key={tx.id}
                        className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0"
                      >
                        <div className="flex min-w-0 flex-col gap-1">
                          <span className="rd-p-md text-[var(--rd-heading)]">
                            {t(transactionTypeLabelKey(tx.type))}
                          </span>
                          {tx.description && (
                            <span className="rd-p-sm text-[var(--rd-caption)] [overflow-wrap:anywhere]">
                              {tx.description}
                            </span>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                          <span
                            className={`rd-p-md whitespace-nowrap font-medium ${
                              isZero
                                ? 'text-[var(--rd-caption)]'
                                : isPositive
                                  ? 'text-[var(--rd-success-text)]'
                                  : 'text-[var(--rd-heading)]'
                            }`}
                          >
                            {sign}
                            {formatAmount(Math.abs(tx.amount_rubles))}
                            {'\u00A0'}
                            {currencySymbol}
                          </span>
                          <span className="rd-p-sm whitespace-nowrap text-[var(--rd-caption)]">
                            {new Date(tx.created_at).toLocaleDateString(uiLocale())}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="flex flex-col items-center gap-3 pb-6 pt-4 text-center">
                  <span className="flex size-16 items-center justify-center rounded-[var(--rd-radius-md)] bg-[var(--rd-field)] text-[var(--rd-caption)]">
                    <RdIcon name="cabinet/receipt-text" size={28} />
                  </span>
                  <p className="rd-p-lg text-[var(--rd-heading)]">
                    {t('postq.payment.noTransactions')}
                  </p>
                  <p className="rd-p-md text-[var(--rd-caption)]">
                    {t('postq.payment.noTransactionsText')}
                  </p>
                </div>
              ))}

            {isHistoryOpen && transactions && transactions.pages > 1 && (
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <button
                  type="button"
                  className="rd-btn-soft !py-3"
                  onClick={() => setTransactionsPage((prev) => Math.max(1, prev - 1))}
                  disabled={transactions.page <= 1}
                >
                  {t('common.back')}
                </button>
                <span className="rd-p-md whitespace-nowrap text-center text-[var(--rd-caption)]">
                  {t('balance.page', { current: transactions.page, total: transactions.pages })}
                </span>
                <button
                  type="button"
                  className="rd-btn-soft !py-3"
                  onClick={() =>
                    setTransactionsPage((prev) =>
                      transactions.pages ? Math.min(transactions.pages, prev + 1) : prev + 1,
                    )
                  }
                  disabled={transactions.page >= transactions.pages}
                >
                  {t('common.next')}
                </button>
              </div>
            )}
          </section>

          {/* Saved cards (SavedCardsSection) return here once recurrent payments work. */}
        </div>
      </div>
    </div>
  );
}
