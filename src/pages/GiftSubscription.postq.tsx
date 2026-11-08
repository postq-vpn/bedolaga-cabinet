import { getLocalizedApiErrorMessage } from '../utils/api-error-display';
import { uiLocale } from '@/utils/uiLocale';
import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PaymentMethodGlyph } from '@/components/postq/payment/PaymentSidebar';
import { useToast } from '@/components/Toast';
import { CopyField } from '@/components/postq/ui';
import { giftApi } from '../api/gift';
import {
  canUseTelegramScanner,
  loadHtml5Qrcode,
  parseGiftCode,
  scanWithTelegram,
  type Html5QrcodeInstance,
} from '@/utils/qrScanner';
import { brandingApi, type TelegramWidgetConfig } from '../api/branding';
import type {
  GiftConfig,
  GiftTariff,
  GiftTariffPeriod,
  GiftPaymentMethod,
  GiftPurchaseRequest,
  SentGift,
  ReceivedGift,
} from '../api/gift';

import { cn } from '../lib/utils';
import { copyToClipboard } from '../utils/clipboard';
import { buildGiftClaimArtifacts } from '../utils/giftShare';
import { getApiErrorMessage } from '../utils/api-error';
import { formatPrice } from '../utils/format';
import { pickBestValue } from '../utils/bestValue';
import { useCurrency } from '../hooks/useCurrency';
import { usePlatform, useHaptic } from '@/platform';
import { openPaymentUrl } from '../utils/openPaymentUrl';
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton';
import { WarningCircleIcon, BanIcon } from '@/components/icons';
import { stripLeadingEmoji } from '@/utils/stripLeadingEmoji';

function formatPeriodLabel(
  days: number,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const key = `landing.periodLabels.d${days}`;
  const result = t(key);
  if (result !== key) return result;

  const months = Math.floor(days / 30);
  const remainder = days % 30;
  if (months > 0 && remainder === 0) {
    return t('landing.periodLabels.nMonths', { count: months });
  }
  return t('landing.periodLabels.nDays', { count: days });
}

function getGiftStatusKey(status: string): string {
  const statusMap: Record<string, string> = {
    pending_activation: 'gift.statusPendingActivation',
    delivered: 'gift.statusDelivered',
    paid: 'gift.statusAvailable',
    pending: 'gift.statusPending',
    failed: 'gift.statusFailed',
    expired: 'gift.statusExpired',
  };
  return statusMap[status] ?? 'gift.statusPending';
}

function isGiftAvailable(status: string): boolean {
  return status === 'paid' || status === 'delivered' || status === 'pending_activation';
}

function isGiftActivated(gift: SentGift): boolean {
  return gift.status === 'delivered' && gift.activated_by_username != null;
}

function formatGiftDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString(uiLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

type TabId = 'buy' | 'activate' | 'myGifts';

function LoadingSkeleton() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--rd-border)] border-t-[var(--rd-action)]" />
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--rd-error-bg)]">
          <WarningCircleIcon className="h-8 w-8 text-[var(--rd-error-text)]" />
        </div>
        <h2 className="rd-p-lg font-semibold text-[var(--rd-heading)]">{t('gift.failedTitle')}</h2>
        <p className="rd-p-md text-[var(--rd-body)]">{message}</p>
      </div>
    </div>
  );
}

function DisabledState() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => navigate('/'), 3000);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--rd-field)]">
          <BanIcon className="h-8 w-8 text-[var(--rd-caption)]" />
        </div>
        <h2 className="rd-p-lg font-semibold text-[var(--rd-heading)]">
          {t('gift.featureDisabled')}
        </h2>
        <p className="rd-p-md text-[var(--rd-body)]">{t('gift.redirecting')}</p>
      </div>
    </div>
  );
}

function TariffCard({
  tariff,
  isSelected,
  onSelect,
}: {
  tariff: GiftTariff;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      role="radio"
      aria-checked={isSelected}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-4 rounded-[var(--rd-radius-md)] border-2 p-4 text-left transition-colors',
        isSelected
          ? 'border-[var(--rd-action)] bg-[var(--rd-help)]'
          : 'border-transparent bg-[var(--rd-field)] hover:bg-[var(--rd-chip-hover)]',
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="rd-p-lg text-[var(--rd-heading)]">{tariff.name}</span>
        <span className="rd-p-sm text-[var(--rd-caption)]">
          {tariff.traffic_limit_gb > 0
            ? `${tariff.traffic_limit_gb} ${t('gift.gbShort')}`
            : t('postq.dashboard.trafficUnlimited')}
          {', '}
          {t('gift.deviceCount', { count: tariff.device_limit })}
        </span>
      </span>
      <span
        aria-hidden
        className={cn(
          'shrink-0 rounded-full bg-[var(--rd-surface)]',
          isSelected
            ? 'size-5 border-[6px] border-[var(--rd-action)]'
            : 'size-6 border-2 border-[var(--rd-border)]',
        )}
      />
    </button>
  );
}

function PeriodCard({
  period,
  isSelected,
  onSelect,
}: {
  period: GiftTariffPeriod;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const hasDiscount =
    period.original_price_kopeks != null && period.original_price_kopeks > period.price_kopeks;

  // Same tile as the purchase wizard's «Срок подписки».
  return (
    <button
      type="button"
      role="radio"
      aria-checked={isSelected}
      onClick={onSelect}
      className={cn(
        'flex min-h-[132px] sm:min-h-[180px] flex-col justify-between gap-4 rounded-[var(--rd-radius-md)] border-2 p-6 text-left transition-colors',
        isSelected
          ? 'border-[var(--rd-action)] bg-[var(--rd-help)]'
          : 'border-transparent bg-[var(--rd-field)] hover:bg-[var(--rd-chip-hover)]',
      )}
    >
      <span className="flex w-full items-start justify-between gap-3">
        <span className="rd-h6 text-[var(--rd-heading)]">{formatPeriodLabel(period.days, t)}</span>
        <span
          aria-hidden
          className={cn(
            'mt-1 shrink-0 rounded-full bg-[var(--rd-surface)]',
            isSelected
              ? 'size-5 border-[6px] border-[var(--rd-action)]'
              : 'size-6 border-2 border-[var(--rd-border)]',
          )}
        />
      </span>
      <span className="flex w-full items-end justify-between gap-3">
        <span className="flex flex-col gap-2">
          {hasDiscount && period.original_price_kopeks != null && (
            <s className="rd-p-md font-medium text-[var(--rd-placeholder)]">
              {formatPrice(period.original_price_kopeks)}
            </s>
          )}
          <span className="rd-h6 text-[var(--rd-heading)]">{formatPrice(period.price_kopeks)}</span>
        </span>
        {hasDiscount && period.discount_percent != null && (
          <span
            className={cn(
              'rd-p-md rounded-[12px] px-3 py-2 font-medium',
              isSelected
                ? 'bg-[var(--rd-surface)] text-[var(--rd-action)]'
                : 'bg-[var(--rd-surface)] text-[var(--rd-body)]',
            )}
          >
            −{period.discount_percent}%
          </span>
        )}
      </span>
    </button>
  );
}
function PaymentModeToggle({
  mode,
  onToggle,
  balanceLabel,
}: {
  mode: 'balance' | 'gateway';
  onToggle: (mode: 'balance' | 'gateway') => void;
  balanceLabel: string;
}) {
  const { t } = useTranslation();
  const item = (active: boolean) =>
    cn(
      'rd-p-md h-11 flex-1 rounded-[12px] px-3 transition-colors',
      active
        ? 'bg-[var(--rd-surface)] font-medium text-[var(--rd-action)]'
        : 'text-[var(--rd-caption)] hover:text-[var(--rd-heading)]',
    );

  return (
    <div
      role="group"
      aria-label={t('gift.paymentMode')}
      className="flex rounded-[16px] bg-[var(--rd-field)] p-1"
    >
      <button
        type="button"
        onClick={() => onToggle('balance')}
        aria-pressed={mode === 'balance'}
        className={item(mode === 'balance')}
      >
        {balanceLabel}
      </button>
      <button
        type="button"
        onClick={() => onToggle('gateway')}
        aria-pressed={mode === 'gateway'}
        className={item(mode === 'gateway')}
      >
        {t('gift.viaGateway')}
      </button>
    </div>
  );
}
function PaymentMethodCard({
  method,
  isSelected,
  selectedSubOption,
  onSelect,
  onSelectSubOption,
}: {
  method: GiftPaymentMethod;
  isSelected: boolean;
  selectedSubOption: string | null;
  onSelect: () => void;
  onSelectSubOption: (subOptionId: string) => void;
}) {
  const hasSubOptions = method.sub_options && method.sub_options.length > 1;

  // Same row as the top-up popup.
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-[var(--rd-radius-md)] border-2 transition-colors',
        isSelected
          ? 'border-[var(--rd-action)] bg-[var(--rd-help)]'
          : 'border-transparent bg-[var(--rd-field)] hover:bg-[var(--rd-chip-hover)]',
      )}
    >
      <button
        type="button"
        role="radio"
        aria-checked={isSelected}
        onClick={onSelect}
        className="flex w-full items-center gap-4 p-4 text-start"
      >
        {method.icon_url ? (
          <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-[var(--rd-radius-sm)] bg-[var(--rd-surface)]">
            <img src={method.icon_url} alt="" className="h-6 w-6 object-contain" />
          </span>
        ) : (
          <PaymentMethodGlyph methodId={method.method_id} />
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="rd-p-lg truncate text-[var(--rd-heading)]">{method.display_name}</span>
          {method.description && (
            <span className="rd-p-sm truncate text-[var(--rd-caption)]">{method.description}</span>
          )}
        </span>
        <span
          aria-hidden
          className={cn(
            'shrink-0 rounded-full bg-[var(--rd-surface)]',
            isSelected
              ? 'size-5 border-[6px] border-[var(--rd-action)]'
              : 'size-6 border-2 border-[var(--rd-border)]',
          )}
        />
      </button>

      {isSelected && hasSubOptions && (
        <div className="mx-4 mb-4 flex gap-1 rounded-[12px] bg-[var(--rd-surface)] p-1">
          {method.sub_options!.map((opt) => (
            <button
              key={opt.id}
              type="button"
              aria-pressed={selectedSubOption === opt.id}
              onClick={() => onSelectSubOption(opt.id)}
              className={cn(
                'rd-p-md h-10 flex-1 rounded-[9px] transition-colors',
                selectedSubOption === opt.id
                  ? 'bg-[var(--rd-help)] font-medium text-[var(--rd-action)]'
                  : 'text-[var(--rd-caption)] hover:text-[var(--rd-heading)]',
              )}
            >
              {stripLeadingEmoji(opt.name)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
function BuyTabContent({
  config,
  onPurchaseComplete,
}: {
  config: GiftConfig;
  onPurchaseComplete: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { openInvoice, capabilities, openLink, platform } = usePlatform();
  const haptic = useHaptic();

  // Selection state
  const [selectedTariffId, setSelectedTariffId] = useState<number | null>(null);
  const [selectedPeriodDays, setSelectedPeriodDays] = useState<number | null>(null);
  const [paymentMode, setPaymentMode] = useState<'balance' | 'gateway'>('balance');
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [selectedSubOption, setSelectedSubOption] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Тариф и период выбираются ОДНИМ эффектом: отмеченные оператором выгодными,
  // иначе первые по счёту. Двумя эффектами это разъезжалось — второй записывал
  // «прошлый тариф» уже после того, как первый выбрал период, и затирал выбор,
  // сделанный человеком между этими двумя проходами.
  const lastTariffIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (config.tariffs.length === 0) return;
    const tariff = selectedTariffId
      ? config.tariffs.find((t) => t.id === selectedTariffId)
      : (pickBestValue(config.tariffs) ?? config.tariffs[0]);
    if (!tariff) return;
    if (selectedTariffId !== tariff.id) setSelectedTariffId(tariff.id);
    // Период пересчитываем только при смене тарифа: внутри одного тарифа выбор
    // человека важнее отметки оператора.
    if (lastTariffIdRef.current === tariff.id) return;
    lastTariffIdRef.current = tariff.id;
    if (tariff.periods.length > 0) {
      const period = pickBestValue(tariff.periods) ?? tariff.periods[0];
      setSelectedPeriodDays(period.days);
    }
  }, [config.tariffs, selectedTariffId]);

  // Способ оплаты по умолчанию — первый из доступных.
  useEffect(() => {
    if (config.payment_methods.length > 0 && selectedMethod === null) {
      const firstMethod = config.payment_methods[0];
      setSelectedMethod(firstMethod.method_id);
      if (firstMethod.sub_options && firstMethod.sub_options.length >= 1) {
        setSelectedSubOption(firstMethod.sub_options[0].id);
      } else {
        setSelectedSubOption(null);
      }
    }
  }, [config.payment_methods, selectedMethod]);

  // Derived data
  const selectedTariff = useMemo(
    () => config.tariffs.find((tr) => tr.id === selectedTariffId),
    [config.tariffs, selectedTariffId],
  );

  const selectedPeriod = useMemo(
    () => selectedTariff?.periods.find((p) => p.days === selectedPeriodDays),
    [selectedTariff, selectedPeriodDays],
  );

  const currentPrice = selectedPeriod?.price_kopeks ?? 0;

  const insufficientBalance = paymentMode === 'balance' && config.balance_kopeks < currentPrice;

  // Validation
  const canSubmit = useMemo(() => {
    if (!selectedTariffId || !selectedPeriodDays) return false;
    if (paymentMode === 'gateway' && !selectedMethod) return false;
    if (insufficientBalance) return false;
    return true;
  }, [selectedTariffId, selectedPeriodDays, paymentMode, selectedMethod, insufficientBalance]);

  // Purchase mutation
  const purchaseMutation = useMutation({
    mutationFn: (data: GiftPurchaseRequest) => giftApi.createPurchase(data),
    onSuccess: async (result) => {
      if (result.payment_url) {
        // Telegram Stars: open invoice natively instead of redirect
        const isStars = selectedMethod === 'telegram_stars';
        if (isStars && capabilities.hasInvoice) {
          try {
            const status = await openInvoice(result.payment_url);
            if (status === 'paid') {
              haptic.notification('success');
              queryClient.invalidateQueries({ queryKey: ['balance'] });
              queryClient.invalidateQueries({ queryKey: ['gift-config'] });
              queryClient.invalidateQueries({ queryKey: ['gift-sent'] });
              onPurchaseComplete();
            } else if (status === 'failed') {
              haptic.notification('error');
              setSubmitError(t('gift.failedDesc'));
            }
            // 'cancelled' — user closed the invoice, do nothing
          } catch {
            setSubmitError(t('gift.failedDesc'));
          }
          return;
        }
        // Non-Stars provider (RollyPay/YooKassa/SBP …): open externally inside Telegram so
        // a bank-app hand-off via custom scheme doesn't dead-end in the WebView (#654272).
        openPaymentUrl(result.payment_url, platform, openLink);
      } else {
        // Balance purchase: switch to MyGifts tab so the new code is visible
        queryClient.invalidateQueries({ queryKey: ['balance'] });
        queryClient.invalidateQueries({ queryKey: ['gift-config'] });
        queryClient.invalidateQueries({ queryKey: ['gift-sent'] });
        onPurchaseComplete();
      }
    },
    onError: (err) => {
      const msg = getLocalizedApiErrorMessage(err, t('gift.failedDesc'), t);
      setSubmitError(msg);
    },
  });

  // Submit handler
  const handleSubmit = () => {
    if (!selectedTariffId || !selectedPeriodDays || !canSubmit || purchaseMutation.isPending)
      return;

    setSubmitError(null);

    let paymentMethod: string | undefined;
    if (paymentMode === 'gateway' && selectedMethod) {
      paymentMethod = selectedMethod;
      if (selectedSubOption) {
        paymentMethod = `${paymentMethod}_${selectedSubOption}`;
      }
    }

    const data: GiftPurchaseRequest = {
      tariff_id: selectedTariffId,
      period_days: selectedPeriodDays,
      payment_mode: paymentMode,
      payment_method: paymentMethod,
    };

    purchaseMutation.mutate(data);
  };

  // Balance label with current amount
  const balanceLabel = useMemo(() => {
    return `${t('gift.fromBalance')} (${formatPrice(config.balance_kopeks)})`;
  }, [config, t]);

  const showTariffCards = config.tariffs.length > 1;

  // Periods for the selected tariff (for period cards)
  const periodsForDisplay = useMemo(() => {
    if (selectedTariff) {
      return [...selectedTariff.periods].sort((a, b) => a.days - b.days);
    }
    return [];
  }, [selectedTariff]);

  const originalPrice =
    selectedPeriod?.original_price_kopeks != null &&
    selectedPeriod.original_price_kopeks > currentPrice
      ? selectedPeriod.original_price_kopeks
      : null;

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <section className="rd-card rd-card--lg flex min-w-0 flex-1 flex-col gap-8">
        {/* Tariff selection */}
        {showTariffCards && (
          <div className="flex flex-col gap-4">
            <h2 className="rd-p-lg text-[var(--rd-heading)]">{t('gift.selectTariff')}</h2>
            <div
              role="radiogroup"
              aria-label={t('gift.chooseTariff')}
              className="flex flex-col gap-3"
            >
              {config.tariffs.map((tariff) => (
                <TariffCard
                  key={tariff.id}
                  tariff={tariff}
                  isSelected={tariff.id === selectedTariffId}
                  onSelect={() => setSelectedTariffId(tariff.id)}
                />
              ))}
            </div>
          </div>
        )}

        {selectedTariff?.description && (
          <p className="rd-p-md rounded-[var(--rd-radius-sm)] bg-[var(--rd-field)] px-6 py-4 text-[var(--rd-body)]">
            {selectedTariff.description}
          </p>
        )}

        {config.promo_group_name && (
          <p className="rd-p-md rounded-[var(--rd-radius-sm)] bg-[var(--rd-success-bg)] px-6 py-4 text-[var(--rd-success-text)]">
            {t('subscription.promoGroup.yourGroup', { name: config.promo_group_name })}.{' '}
            {t('subscription.promoGroup.personalDiscountsApplied')}
          </p>
        )}
        {config.active_discount_percent != null && config.active_discount_percent > 0 && (
          <p className="rd-p-md rounded-[var(--rd-radius-sm)] bg-[var(--rd-help)] px-6 py-4 text-[var(--rd-on-soft)]">
            {t('promo.discountApplied')} −{config.active_discount_percent}%
          </p>
        )}

        {/* Period selection */}
        {periodsForDisplay.length > 0 && (
          <div className="flex flex-col gap-4">
            <h2 className="rd-p-lg text-[var(--rd-heading)]">{t('postq.purchase.period')}</h2>
            <div role="radiogroup" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {periodsForDisplay.map((period) => (
                <PeriodCard
                  key={period.days}
                  period={period}
                  isSelected={period.days === selectedPeriodDays}
                  onSelect={() => setSelectedPeriodDays(period.days)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Payment */}
        <div className="flex flex-col gap-4">
          <h2 className="rd-p-lg text-[var(--rd-heading)]">{t('gift.paymentMode')}</h2>
          <PaymentModeToggle
            mode={paymentMode}
            onToggle={setPaymentMode}
            balanceLabel={balanceLabel}
          />
          {paymentMode === 'gateway' && config.payment_methods.length > 0 && (
            <div
              role="radiogroup"
              aria-label={t('gift.paymentMethod')}
              className="flex flex-col gap-3"
            >
              {config.payment_methods.map((method) => (
                <PaymentMethodCard
                  key={method.method_id}
                  method={method}
                  isSelected={method.method_id === selectedMethod}
                  selectedSubOption={method.method_id === selectedMethod ? selectedSubOption : null}
                  onSelect={() => {
                    setSelectedMethod(method.method_id);
                    if (method.sub_options && method.sub_options.length >= 1) {
                      setSelectedSubOption(method.sub_options[0].id);
                    } else {
                      setSelectedSubOption(null);
                    }
                  }}
                  onSelectSubOption={setSelectedSubOption}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Summary — same card as «Ваш выбор» in the purchase wizard */}
      <aside className="rd-card rd-card--lg flex flex-col gap-6 lg:sticky lg:top-[138px] lg:w-[440px] lg:shrink-0">
        <h2 className="rd-h6 text-[var(--rd-heading)]">{t('postq.purchase.yourChoice')}</h2>
        <dl className="rd-p-md flex flex-col gap-4">
          {selectedTariff && (
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--rd-caption)]">{t('postq.gift.plan')}</dt>
              <dd className="text-right text-[var(--rd-body)]">{selectedTariff.name}</dd>
            </div>
          )}
          {selectedPeriod && (
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--rd-caption)]">{t('postq.purchase.period')}</dt>
              <dd className="text-[var(--rd-body)]">{formatPeriodLabel(selectedPeriod.days, t)}</dd>
            </div>
          )}
          {paymentMode === 'balance' && (
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--rd-caption)]">{t('gift.yourBalance')}</dt>
              <dd className="text-[var(--rd-body)]">{formatPrice(config.balance_kopeks)}</dd>
            </div>
          )}
        </dl>
        <div className="h-px w-full bg-[var(--rd-border)]" />
        <div className="flex flex-col gap-2">
          {originalPrice && (
            <s className="rd-p-md font-medium text-[var(--rd-caption)]">
              {formatPrice(originalPrice)}
            </s>
          )}
          <span className="rd-h4 text-[var(--rd-heading)]">{formatPrice(currentPrice)}</span>
          {originalPrice && selectedPeriod?.discount_percent != null && (
            <span className="rd-p-md text-[var(--rd-success-text)]">
              {t('postq.purchase.savings', {
                amount: formatPrice(originalPrice - currentPrice),
                percent: selectedPeriod.discount_percent,
              })}
            </span>
          )}
        </div>

        {insufficientBalance && (
          <div className="rd-p-md flex flex-col gap-1 rounded-[var(--rd-radius-md)] bg-[var(--rd-error-bg)] px-6 py-4">
            <span className="font-medium text-[var(--rd-error)]">
              {t('gift.insufficientBalance')}
            </span>
            <Link to="/balance" className="rd-link-action self-start">
              {t('gift.topUpBalance')}
            </Link>
          </div>
        )}
        {submitError && (
          <p role="alert" className="rd-p-sm text-[var(--rd-error-text)]">
            {submitError}
          </p>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || purchaseMutation.isPending}
          className="rd-btn !min-h-16 w-full !rounded-[var(--rd-radius-control)] disabled:!cursor-not-allowed disabled:!bg-[var(--rd-chip)] disabled:!text-[var(--rd-placeholder)] disabled:!opacity-100"
        >
          {purchaseMutation.isPending ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <>
              {t('gift.giftButton')} {currentPrice > 0 ? formatPrice(currentPrice) : ''}
            </>
          )}
        </button>
      </aside>
    </div>
  );
}

function ActivateTabContent({ initialCode }: { initialCode?: string | null }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [code, setCode] = useState(initialCode ?? '');

  // Sync when initialCode changes (e.g. URL param update while tab is active)
  useEffect(() => {
    if (initialCode) setCode(initialCode);
  }, [initialCode]);
  const [activateError, setActivateError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef<Html5QrcodeInstance | null>(null);

  const stopScan = useCallback(() => {
    if (scannerRef.current) {
      scannerRef.current
        .stop()
        .catch(() => undefined)
        .finally(() => {
          scannerRef.current?.clear();
          scannerRef.current = null;
        });
    }
    setScanning(false);
  }, []);

  // Веб-сканер держит камеру: гасим его при уходе с вкладки/размонтировании,
  // иначе индикатор камеры остаётся гореть.
  useEffect(() => stopScan, [stopScan]);

  const applyScannedCode = useCallback(
    (decoded: string) => {
      const parsed = parseGiftCode(decoded);
      if (!parsed) {
        setActivateError(t('gift.scanNotRecognized'));
        return;
      }
      setCode(parsed);
      setActivateError(null);
    },
    [t],
  );

  const handleScan = useCallback(async () => {
    setActivateError(null);

    if (canUseTelegramScanner()) {
      try {
        const decoded = await scanWithTelegram(
          t('gift.scanDescription'),
          (v) => parseGiftCode(v) !== null,
        );
        if (decoded) applyScannedCode(decoded);
      } catch {
        setActivateError(t('gift.scanError'));
      }
      return;
    }

    const Html5Qrcode = await loadHtml5Qrcode();
    if (!Html5Qrcode) {
      setActivateError(t('gift.scanNoCamera'));
      return;
    }

    setScanning(true);
    const scanner = new Html5Qrcode('gift-qr-reader');
    scannerRef.current = scanner;
    const config = { fps: 10, qrbox: { width: 220, height: 220 } };
    const onDecoded = (decoded: string) => {
      if (parseGiftCode(decoded) === null) return;
      stopScan();
      applyScannedCode(decoded);
    };
    try {
      await scanner.start({ facingMode: 'environment' }, config, onDecoded, () => undefined);
    } catch {
      try {
        await scanner.start({ facingMode: 'user' }, config, onDecoded, () => undefined);
      } catch {
        setActivateError(t('gift.scanNoCamera'));
        scannerRef.current = null;
        setScanning(false);
      }
    }
  }, [applyScannedCode, stopScan, t]);

  const activateMutation = useMutation({
    mutationFn: (giftCode: string) => giftApi.activateGiftCode(giftCode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gift-received'] });
      queryClient.invalidateQueries({ queryKey: ['gift-sent'] });
      queryClient.invalidateQueries({ queryKey: ['balance'] });
    },
    onError: (err) => {
      const raw = getApiErrorMessage(err, '');
      const msg =
        raw === 'Cannot activate your own gift'
          ? t('gift.activateSelfError')
          : getLocalizedApiErrorMessage(err, t('gift.activateError'), t);
      setActivateError(msg);
    },
  });

  const handleActivate = () => {
    const trimmed = code.trim();
    if (!trimmed || activateMutation.isPending) return;
    setActivateError(null);
    activateMutation.mutate(trimmed);
  };

  if (activateMutation.isSuccess && activateMutation.data) {
    const result = activateMutation.data;
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h2 className="rd-h5 text-[var(--rd-heading)]">{t('postq.gift.activatedTitle')}</h2>
          <p className="rd-p-md text-[var(--rd-caption)]">
            {t('gift.activateSuccessDesc', {
              tariff: result.tariff_name ?? '',
              days: result.period_days ?? 0,
            })}
          </p>
        </div>
        <Link to="/" className="rd-btn-tile rd-btn-tile--primary">
          {t('postq.gift.toDashboard')}
        </Link>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-8"
      onSubmit={(e) => {
        e.preventDefault();
        handleActivate();
      }}
    >
      <div className="flex flex-col gap-2">
        <h2 className="rd-h5 text-[var(--rd-heading)]">{t('gift.activateTitle')}</h2>
        <p className="rd-p-md text-[var(--rd-caption)]">{t('gift.activateDescription')}</p>
      </div>

      <div className="flex flex-col gap-3">
        <label className="rd-field">
          <input
            type="text"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setActivateError(null);
            }}
            placeholder={t('gift.activateCodePlaceholder')}
            autoComplete="off"
            spellCheck={false}
            aria-label={t('gift.activateTitle')}
            className="bg-transparent uppercase tracking-[0.04em] outline-none placeholder:text-[var(--rd-placeholder)]"
          />
        </label>

        {/* Контейнер веб-сканера: html5-qrcode рендерит превью камеры внутрь */}
        <div
          id="gift-qr-reader"
          className={cn('overflow-hidden rounded-[var(--rd-radius-sm)]', !scanning && 'hidden')}
        />

        {activateError && (
          <p role="alert" className="rd-p-md text-[var(--rd-error-text)]">
            {activateError}
          </p>
        )}
        <p className="rd-p-md text-[var(--rd-caption)]">{t('postq.gift.activateHint')}</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="submit"
          disabled={!code.trim() || activateMutation.isPending}
          className="rd-btn-tile rd-btn-tile--primary flex-1"
        >
          {activateMutation.isPending ? t('gift.activating') : t('gift.activateButton')}
        </button>
        {/* Скан QR: в Telegram — нативный сканер (в WebView камера через
            getUserMedia работает ненадёжно), в вебе — html5-qrcode. */}
        <button
          type="button"
          onClick={scanning ? stopScan : handleScan}
          className="rd-btn-tile flex-1"
        >
          {scanning ? t('gift.scanCancel') : t('postq.gift.scan')}
        </button>
      </div>
    </form>
  );
}

function SentGiftCard({ gift }: { gift: SentGift }) {
  const { t } = useTranslation();
  const { showToast } = useToast();

  // Runtime bot username (env var is only a fallback) so the "activate via bot"
  // line never silently disappears when VITE_TELEGRAM_BOT_USERNAME is unset.
  const { data: widgetConfig } = useQuery<TelegramWidgetConfig>({
    queryKey: ['telegram-widget-config'],
    queryFn: brandingApi.getTelegramWidgetConfig,
    staleTime: 60000,
  });
  const botUsername =
    widgetConfig?.bot_username || import.meta.env.VITE_TELEGRAM_BOT_USERNAME || '';

  const artifacts = buildGiftClaimArtifacts(gift, {
    botUsername,
    origin: window.location.origin,
  });
  const giftCode = artifacts.code;
  const isActivated = isGiftActivated(gift);
  const isAvailable = !isActivated && isGiftAvailable(gift.status);

  const statusText = isActivated
    ? t('postq.gift.statusActivated')
    : isAvailable
      ? t('postq.gift.statusAvailable')
      : sentenceCase(t(getGiftStatusKey(gift.status)));

  const buildShareMessage = useCallback(() => {
    // Literal "GIFT_" prefix: Telegram forwards the start param to the bot
    // verbatim (no URL-decoding), so the previously-encoded "%5F" never matched
    // the bot's `start_parameter.startswith('GIFT_')` handler.
    return [
      t('gift.shareText'),
      '',
      artifacts.botLink ? `${t('gift.shareModalActivateVia')} ${artifacts.botLink}` : null,
      `${t('gift.shareModalActivateViaCabinet')} ${artifacts.cabinetLink}`,
    ]
      .filter(Boolean)
      .join('\n');
  }, [artifacts.botLink, artifacts.cabinetLink, t]);

  const handleShare = useCallback(async () => {
    await copyToClipboard(buildShareMessage());
    showToast({ type: 'success', message: t('postq.gift.shareCopied') });
  }, [buildShareMessage, showToast, t]);

  return (
    <article className="flex flex-col gap-6 rounded-[var(--rd-radius-md)] bg-[var(--rd-field)] p-6">
      <GiftCardHead
        title={gift.tariff_name ?? t('gift.tariff')}
        status={statusText}
        tone={isAvailable ? 'action' : 'muted'}
        details={giftDetails(gift, t)}
      />

      {!isActivated && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <CopyField label={t('postq.gift.code')} value={giftCode} surface />
          <button type="button" onClick={handleShare} className="rd-btn h-14 !py-0 sm:w-auto">
            {t('postq.gift.share')}
          </button>
        </div>
      )}

      {(isActivated && gift.activated_by_username) || gift.gift_recipient_value ? (
        <p className="rd-p-md text-[var(--rd-caption)]">
          {[
            isActivated && gift.activated_by_username
              ? t('gift.activatedBy', { username: gift.activated_by_username })
              : null,
            gift.gift_recipient_value
              ? t('gift.sentTo', { recipient: gift.gift_recipient_value })
              : null,
          ]
            .filter(Boolean)
            .join(', ')}
        </p>
      ) : null}
    </article>
  );
}

function giftDetails(
  gift: { created_at: string | null; period_days: number; device_limit: number },
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  return [
    formatGiftDate(gift.created_at),
    formatPeriodLabel(gift.period_days, t),
    t('gift.deviceCount', { count: gift.device_limit }),
  ]
    .filter(Boolean)
    .join(', ');
}

function GiftCardHead({
  title,
  status,
  tone,
  details,
}: {
  title: string;
  status: string;
  tone: 'action' | 'muted';
  details: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h3 className="rd-p-lg font-medium text-[var(--rd-heading)]">{title}</h3>
        <p className="rd-p-md text-[var(--rd-caption)]">{details}</p>
      </div>
      <span
        className={cn(
          'rd-p-md shrink-0 rounded-[12px] px-3 py-2 font-medium',
          tone === 'action'
            ? 'bg-[var(--rd-help)] text-[var(--rd-action)]'
            : 'bg-[var(--rd-surface)] text-[var(--rd-caption)]',
        )}
      >
        {status}
      </span>
    </div>
  );
}

function ReceivedGiftCard({ gift }: { gift: ReceivedGift }) {
  const { t } = useTranslation();

  return (
    <article className="flex flex-col gap-4 rounded-[var(--rd-radius-md)] bg-[var(--rd-field)] p-6">
      <GiftCardHead
        title={gift.tariff_name ?? t('gift.tariff')}
        status={sentenceCase(t(getGiftStatusKey(gift.status)))}
        tone="muted"
        details={giftDetails(gift, t)}
      />
      {gift.sender_display && (
        <p className="rd-p-md text-[var(--rd-caption)]">
          {t('gift.pending.from', { sender: gift.sender_display })}
        </p>
      )}
      {gift.gift_message && (
        <p className="rd-p-md rounded-[var(--rd-radius-sm)] bg-[var(--rd-surface)] px-4 py-3 text-[var(--rd-body)]">
          {gift.gift_message}
        </p>
      )}
    </article>
  );
}

/** Old status strings are in caps («ДОСТУПЕН»); the new design uses sentence case. */
function sentenceCase(text: string): string {
  const lower = text.toLocaleLowerCase();
  return lower.charAt(0).toLocaleUpperCase() + lower.slice(1);
}

function MyGiftsTabContent({ onBuy }: { onBuy: () => void }) {
  const { t } = useTranslation();

  const {
    data: sentGifts,
    isLoading: sentLoading,
    error: sentError,
  } = useQuery({
    queryKey: ['gift-sent'],
    queryFn: giftApi.getSentGifts,
    staleTime: 30_000,
  });

  const {
    data: receivedGifts,
    isLoading: receivedLoading,
    error: receivedError,
  } = useQuery({
    queryKey: ['gift-received'],
    queryFn: giftApi.getReceivedGifts,
    staleTime: 30_000,
  });

  const isLoading = sentLoading || receivedLoading;

  // Split sent gifts into active (awaiting activation) and activated
  const activeGifts = useMemo(
    () => (sentGifts ?? []).filter((g) => !isGiftActivated(g)),
    [sentGifts],
  );
  const activatedGifts = useMemo(
    () => (sentGifts ?? []).filter((g) => isGiftActivated(g)),
    [sentGifts],
  );
  const received = receivedGifts ?? [];

  if (isLoading) {
    return (
      <SkeletonGroup className="space-y-3">
        <Skeleton variant="card" count={3} className="h-24" />
      </SkeletonGroup>
    );
  }

  if (sentError && receivedError) {
    return (
      <section className="rd-card rd-card--lg">
        <p role="alert" className="rd-p-md text-[var(--rd-error-text)]">
          {t('gift.failedDesc')}
        </p>
      </section>
    );
  }

  if (activeGifts.length + activatedGifts.length + received.length === 0) {
    return (
      <section className="rd-card rd-card--lg flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h2 className="rd-h5 text-[var(--rd-heading)]">{t('gift.myGiftsEmpty')}</h2>
          <p className="rd-p-md text-[var(--rd-caption)]">{t('gift.myGiftsEmptyDesc')}</p>
        </div>
        <button
          type="button"
          onClick={onBuy}
          className="rd-btn-tile rd-btn-tile--primary sm:self-start sm:px-12"
        >
          {t('postq.gift.emptyAction')}
        </button>
      </section>
    );
  }

  const groups = [
    { key: 'active', title: t('gift.activeGiftsTitle'), sent: activeGifts },
    { key: 'activated', title: t('gift.activatedGiftsTitle'), sent: activatedGifts },
  ];

  return (
    <div className="flex flex-col gap-6">
      {groups.map(
        (group) =>
          group.sent.length > 0 && (
            <section key={group.key} className="rd-card rd-card--lg flex flex-col gap-6">
              <h2 className="rd-h6 text-[var(--rd-heading)]">{group.title}</h2>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {group.sent.map((gift) => (
                  <SentGiftCard key={gift.token} gift={gift} />
                ))}
              </div>
            </section>
          ),
      )}
      {received.length > 0 && (
        <section className="rd-card rd-card--lg flex flex-col gap-6">
          <h2 className="rd-h6 text-[var(--rd-heading)]">{t('gift.receivedGiftsTitle')}</h2>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {received.map((gift) => (
              <ReceivedGiftCard key={gift.token} gift={gift} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default function GiftSubscription() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();

  // Прогреваем кэш курсов валют для formatPrice (см. QuickPurchase).
  useCurrency();

  // URL params: ?tab=activate&code=TOKEN for auto-activation
  const urlTab = searchParams.get('tab') as TabId | null;
  const rawCode = searchParams.get('code');
  // Strip GIFT- or GIFT_ prefix if user pasted the full display code
  const urlCode = rawCode?.replace(/^GIFT[-_]/i, '') ?? rawCode;
  const [activeTab, setActiveTab] = useState<TabId>(
    urlTab === 'activate' || urlTab === 'myGifts' ? urlTab : 'buy',
  );

  // Fetch config
  const {
    data: config,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['gift-config'],
    queryFn: giftApi.getConfig,
    staleTime: 30_000,
  });

  // Loading state
  if (isLoading) {
    return <LoadingSkeleton />;
  }

  // Error state
  if (error || !config) {
    const errMsg = getLocalizedApiErrorMessage(error, t('gift.notFound'), t);
    return <ErrorState message={errMsg} />;
  }

  // Disabled state
  if (!config.is_enabled) {
    return <DisabledState />;
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: 'buy', label: t('gift.tabBuy') },
    { id: 'activate', label: t('gift.tabActivate') },
    { id: 'myGifts', label: t('gift.tabMyGifts') },
  ];

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="rd-h3 text-[var(--rd-heading)]">{t('gift.pageTitle')}</h1>
        <p className="rd-p-lg text-[var(--rd-caption)]">{t('postq.gift.subtitle')}</p>
      </div>

      <div
        className="flex max-w-[560px] rounded-[16px] bg-[var(--rd-surface)] p-1"
        role="tablist"
        aria-label={t('gift.pageTitle')}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`tabpanel-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'rd-p-md h-11 min-w-0 flex-1 basis-0 whitespace-nowrap rounded-[12px] px-2 transition-colors',
              activeTab === tab.id
                ? 'bg-[var(--rd-help)] font-medium text-[var(--rd-action)]'
                : 'text-[var(--rd-caption)] hover:text-[var(--rd-heading)]',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`tabpanel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>
        {activeTab === 'buy' && (
          <BuyTabContent config={config} onPurchaseComplete={() => setActiveTab('myGifts')} />
        )}
        {activeTab === 'activate' && (
          <section className="rd-card rd-card--lg max-w-[760px]">
            <ActivateTabContent initialCode={urlCode} />
          </section>
        )}
        {activeTab === 'myGifts' && <MyGiftsTabContent onBuy={() => setActiveTab('buy')} />}
      </div>
    </div>
  );
}
