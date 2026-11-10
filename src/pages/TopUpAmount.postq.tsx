import { getLocalizedApiErrorMessage } from '../utils/api-error-display';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { RdIcon } from '@/components/postq/RdIcon';
import { PaymentHeading, PaymentSidebar } from '@/components/postq/payment/PaymentSidebar';
import { useMutation, useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';

import { useAuthStore } from '../store/auth';
import { balanceApi } from '../api/balance';
import { useCurrency } from '../hooks/useCurrency';
import { checkRateLimit, getRateLimitResetTime, RATE_LIMIT_KEYS } from '../utils/rateLimit';
import { useCloseOnSuccessNotification } from '../store/successNotification';
import { useHaptic, usePlatform } from '@/platform';
import { staggerContainer, staggerItem } from '@/components/motion/transitions';
import type { PaymentMethod, PaymentMethodOption } from '../types';
import { saveTopUpPendingInfo } from '../utils/topUpStorage';
import { getSafeRedirectPath } from '../utils/safeRedirect';
import { openPaymentUrl } from '../utils/openPaymentUrl';
import { getApiErrorMessage } from '../utils/api-error';
import { copyToClipboard } from '@/utils/clipboard';
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton';
import { CheckIcon, CopyIcon, ExternalLinkIcon } from '@/components/icons';
import { stripLeadingEmoji } from '@/utils/stripLeadingEmoji';

const getPreferredOptionId = (options?: PaymentMethod['options']) => {
  if (!options || options.length === 0) return null;

  const sbpOption = options.find((option) => {
    const normalizedId = option.id.toLowerCase();
    const normalizedName = option.name.toLowerCase();
    return (
      normalizedId.includes('sbp') ||
      normalizedName.includes('сбп') ||
      normalizedName.includes('sbp')
    );
  });

  return sbpOption?.id ?? options[0].id;
};

const sortOptionsWithSbpFirst = (options?: PaymentMethod['options']) => {
  if (!options || options.length <= 1) return options ?? [];

  const isPreferredOption = (option: PaymentMethodOption) => {
    const normalizedId = option.id.toLowerCase();
    const normalizedName = option.name.toLowerCase();
    return (
      normalizedId.includes('sbp') ||
      normalizedName.includes('сбп') ||
      normalizedName.includes('sbp')
    );
  };

  return [...options].sort((left, right) => {
    const leftIsPreferred = isPreferredOption(left);
    const rightIsPreferred = isPreferredOption(right);

    if (leftIsPreferred === rightIsPreferred) return 0;
    return leftIsPreferred ? -1 : 1;
  });
};

export default function TopUpAmount() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { methodId } = useParams<{ methodId: string }>();
  const [searchParams] = useSearchParams();
  const { formatAmount, currencySymbol, convertAmount, convertToRub, targetCurrency } =
    useCurrency();
  const { openInvoice, openTelegramLink, openLink, platform } = usePlatform();
  const haptic = useHaptic();
  const inputRef = useRef<HTMLInputElement>(null);

  const returnTo = searchParams.get('returnTo');
  const initialAmountRubles = searchParams.get('amount')
    ? parseFloat(searchParams.get('amount')!)
    : undefined;

  // Fetch payment methods with a real query (dedupes with the method-selection page and
  // Balance via the shared ['payment-methods'] key). A non-reactive getQueryData read used
  // to dead-end on an infinite spinner whenever the cache was cold — reload, browser-back
  // from the provider page, or a deep link straight to this route.
  const { data: methods, isLoading: isMethodsLoading } = useQuery({
    queryKey: ['payment-methods'],
    queryFn: balanceApi.getPaymentMethods,
  });
  const method = methods?.find((m) => m.id === methodId);

  const handleNavigateBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const handleSuccess = useCallback(() => {
    // returnTo arrives via query string — validate as an in-app path before
    // navigate(), otherwise an absolute or encoded URL produces ugly
    // path artefacts in the URL bar. The validator returns '/' for invalid
    // input; treat that case as "no returnTo" and use the /balance default.
    const safe = getSafeRedirectPath(returnTo);
    navigate(returnTo && safe !== '/' ? safe : '/balance', { replace: true });
  }, [navigate, returnTo]);

  // Keyboard: Escape to go back
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleNavigateBack();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleNavigateBack]);

  // Auto-redirect when success notification appears (e.g., balance topped up via WebSocket)
  useCloseOnSuccessNotification(handleSuccess);

  const getInitialAmount = (): string => {
    if (!initialAmountRubles || initialAmountRubles <= 0) return '';
    const converted = convertAmount(initialAmountRubles);
    return targetCurrency === 'IRR' || targetCurrency === 'RUB'
      ? Math.ceil(converted).toString()
      : converted.toFixed(2);
  };

  const initialDisplayAmount = getInitialAmount();
  const userEmail = useAuthStore((state) => state.user?.email);
  const [paymentEmail, setPaymentEmail] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const customerEmail = paymentEmail ?? userEmail ?? '';
  const [amount, setAmount] = useState(initialDisplayAmount);
  const [error, setError] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(
    getPreferredOptionId(method?.options),
  );
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [qrPayload, setQrPayload] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  // Canonical RUB amount when the user picked a quick-amount chip. The input shows a
  // rounded display-currency value; validating/charging the canonical RUB avoids the FX
  // round-trip that could push a min-amount chip just below the allowed minimum. Cleared
  // as soon as the user edits the field by hand.
  const [quickRub, setQuickRub] = useState<number | null>(null);

  // Once methods have loaded, redirect to method selection if this method id is unknown.
  useEffect(() => {
    if (methods && !method) {
      const params = new URLSearchParams();
      const amount = searchParams.get('amount');
      const rt = searchParams.get('returnTo');
      if (amount) params.set('amount', amount);
      if (rt) params.set('returnTo', rt);
      const qs = params.toString();
      navigate(`/balance/top-up${qs ? `?${qs}` : ''}`, { replace: true });
    }
  }, [methods, method, navigate, searchParams]);

  useEffect(() => {
    if (!method?.options || method.options.length === 0) {
      if (selectedOption !== null) {
        setSelectedOption(null);
      }
      return;
    }

    const optionExists = method.options.some((option) => option.id === selectedOption);
    if (!optionExists) {
      setSelectedOption(getPreferredOptionId(method.options));
    }
  }, [method?.id, method?.options, selectedOption]);

  const starsPaymentMutation = useMutation({
    mutationFn: (amountKopeks: number) => balanceApi.createStarsInvoice(amountKopeks),
    onSuccess: async (data) => {
      if (!data.invoice_url) {
        setError(t('balance.errors.noPaymentLink'));
        return;
      }
      try {
        const status = await openInvoice(data.invoice_url);
        if (status === 'paid') {
          haptic.notification('success');
          setError(null);
          handleSuccess();
        } else if (status === 'failed') {
          haptic.notification('error');
          setError(t('wheel.starsPaymentFailed'));
        }
      } catch (e) {
        setError(t('balance.errors.generic', { details: String(e) }));
      }
    },
    onError: (err: unknown) => {
      haptic.notification('error');
      setError(getLocalizedApiErrorMessage(err, t('balance.errors.invoiceFailed'), t));
    },
  });

  const topUpMutation = useMutation<
    {
      payment_id: string;
      payment_url?: string;
      invoice_url?: string;
      amount_kopeks: number;
      amount_rubles: number;
      status: string;
      expires_at: string | null;
      qr_payload?: string | null;
    },
    unknown,
    number
  >({
    mutationFn: (amountKopeks: number) => {
      if (!method) throw new Error('Method not loaded');
      if (method.id === 'antilopay') {
        return balanceApi.createTopUp(
          amountKopeks,
          method.id,
          selectedOption || undefined,
          customerEmail.trim(),
        );
      }
      return balanceApi.createTopUp(amountKopeks, method.id, selectedOption || undefined);
    },
    onSuccess: (data) => {
      const redirectUrl = data.payment_url || data.invoice_url;
      if (redirectUrl) {
        // Save payment info for the result page (do BEFORE possible redirect,
        // иначе после window.location.href этот код не выполнится).
        if (method && data.payment_id) {
          const methodKey = method.id.toLowerCase().replace(/-/g, '_');
          const displayName =
            method.name || t(`balance.paymentMethods.${methodKey}.name`, { defaultValue: '' });
          saveTopUpPendingInfo({
            amount_kopeks: data.amount_kopeks,
            method_id: method.id,
            method_name: displayName,
            payment_id: data.payment_id,
            created_at: Date.now(),
          });
        }

        // open_url_direct: seamless флоу как при покупке подарка.
        // window.location.href внутри Telegram MiniApp WebView навигирует
        // в том же контейнере без открытия внешнего браузера. После
        // оплаты return_url возвращает на /balance/top-up/result.
        //
        // t.me/ URL (Telegram Stars, CryptoBot) — всегда через нативный
        // handler (openInvoice / openTelegramLink в setPaymentUrl-ветке).
        // Stars уже отбит раньше через starsPaymentMutation, здесь — защита
        // на случай CryptoBot и других Telegram-deep-link провайдеров.
        // toLowerCase для устойчивости к редким провайдерам, которые могут вернуть
        // URL в нестандартном регистре. Также покрываем tg:// scheme на всякий случай.
        const lowerUrl = redirectUrl.toLowerCase();
        const isTelegramDeepLink =
          lowerUrl.startsWith('https://t.me/') ||
          lowerUrl.startsWith('http://t.me/') ||
          lowerUrl.startsWith('tg://');
        // Свой экран оплаты: QR показываем здесь же — уводить на страницу провайдера незачем.
        if (data.qr_payload) {
          setQrPayload(data.qr_payload);
          setPaymentUrl(redirectUrl);
          return;
        }

        if (method?.open_url_direct && !isTelegramDeepLink) {
          // In the Telegram WebView, same-container navigation to the provider page breaks
          // when it hands off to a bank app via a custom scheme (SBP) — Android shows
          // ERR_UNKNOWN_URL_SCHEME, iOS opens nothing (bug #654272). Open externally there;
          // on web keep same-tab navigation.
          openPaymentUrl(redirectUrl, platform, openLink);
          return;
        }

        setPaymentUrl(redirectUrl);
      }
    },
    onError: (err: unknown) => {
      const detail = getApiErrorMessage(err, '');
      setError(
        detail.includes('not yet implemented')
          ? t('balance.useBot')
          : getLocalizedApiErrorMessage(err, t('common.error'), t),
      );
    },
  });

  // Auto-focus input (only on desktop — mobile keyboard hides bottom nav)
  useEffect(() => {
    if (platform === 'telegram') return;
    const timer = setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [platform]);

  // Spinner only while methods are actually loading. Once the query has resolved without
  // this method, the redirect effect above navigates away (so we render nothing here rather
  // than spinning forever on a cold cache).
  if (!method) {
    if (!isMethodsLoading) {
      return null;
    }
    return (
      <SkeletonGroup className="space-y-3">
        <Skeleton variant="card" count={3} className="h-16" />
      </SkeletonGroup>
    );
  }

  const hasOptions = method.options && method.options.length > 0;
  const orderedOptions = sortOptionsWithSbpFirst(method.options);
  const selectedOptionMinimum =
    method.options?.find((option) => option.id === selectedOption)?.min_amount_kopeks ?? 0;
  const minRubles = Math.max(method.min_amount_kopeks, selectedOptionMinimum) / 100;
  const maxRubles = method.max_amount_kopeks / 100;
  const methodKey = method.id.toLowerCase().replace(/-/g, '_');
  const isStarsMethod = methodKey.includes('stars');
  const methodName =
    method.name || t(`balance.paymentMethods.${methodKey}.name`, { defaultValue: '' });

  const handleSubmit = () => {
    setError(null);
    setPaymentUrl(null);
    setQrPayload(null);
    inputRef.current?.blur();
    if (
      method.id === 'antilopay' &&
      (!customerEmail.trim() || !emailRef.current?.checkValidity())
    ) {
      setError(t('balance.paymentEmailInvalid'));
      emailRef.current?.focus();
      return;
    }

    if (!checkRateLimit(RATE_LIMIT_KEYS.PAYMENT, 3, 30000)) {
      setError(
        t('balance.errors.rateLimit', { seconds: getRateLimitResetTime(RATE_LIMIT_KEYS.PAYMENT) }),
      );
      return;
    }
    if (hasOptions && !selectedOption) {
      setError(t('balance.errors.selectMethod'));
      return;
    }
    const amountCurrency = parseFloat(amount);
    if (isNaN(amountCurrency) || amountCurrency <= 0) {
      setError(t('balance.errors.enterAmount'));
      return;
    }
    const amountRubles = convertToRub(amountCurrency);

    // Resolve the canonical RUB amount. Prefer an exact source — an unedited prefill or a
    // quick-amount chip — over the display value, whose FX round-trip rounding (e.g. 150₽ at
    // rate 90.66 → "1.65" USD → back to 149.59₽) could push a min selection just below the
    // allowed minimum and block the top-up. quickRub is cleared on any manual edit, so a
    // non-null value means the field still holds that chip's exact amount.
    const userEditedAmount = amount.trim() !== initialDisplayAmount.trim();
    const usingPrefill = !userEditedAmount && !!initialAmountRubles && initialAmountRubles > 0;
    const usingQuick = quickRub !== null;

    let canonicalRubles = amountRubles;
    if (usingPrefill) {
      canonicalRubles = initialAmountRubles as number;
    } else if (usingQuick && quickRub !== null) {
      canonicalRubles = quickRub;
    } else if (targetCurrency !== 'RUB') {
      // Hand-typed non-RUB amount: snap up to the minimum when it lands within one
      // display-currency rounding step below it, so typing the advertised (rounded)
      // minimum isn't rejected by FX rounding.
      const decimals = targetCurrency === 'IRR' ? 0 : 2;
      const roundingStep = convertToRub(10 ** -decimals);
      if (canonicalRubles < minRubles && canonicalRubles >= minRubles - roundingStep) {
        canonicalRubles = minRubles;
      }
    }

    if (canonicalRubles < minRubles || canonicalRubles > maxRubles) {
      setError(t('balance.errors.amountRange', { min: minRubles, max: maxRubles }));
      return;
    }

    // Round exact sources; ceil genuine fractional kopeks for hand-typed FX amounts.
    // Remove only floating-point noise at this magnitude (e.g. 6407.000000000001).
    const kopeks = canonicalRubles * 100;
    const amountKopeks =
      targetCurrency === 'RUB' || usingPrefill || usingQuick
        ? Math.round(kopeks)
        : Math.ceil(kopeks - Number.EPSILON * Math.abs(kopeks));
    if (isStarsMethod) {
      starsPaymentMutation.mutate(amountKopeks);
    } else {
      topUpMutation.mutate(amountKopeks);
    }
  };

  const quickAmounts = (
    method.quick_amounts != null
      ? method.quick_amounts.map((kopeks) => kopeks / 100)
      : [100, 300, 500, 1000]
  ).filter((a) => a >= minRubles && a <= maxRubles);
  const currencyDecimals = targetCurrency === 'IRR' || targetCurrency === 'RUB' ? 0 : 2;
  const getQuickValue = (rub: number) =>
    targetCurrency === 'IRR'
      ? Math.round(convertAmount(rub)).toString()
      : convertAmount(rub).toFixed(currencyDecimals);
  const isPending = topUpMutation.isPending || starsPaymentMutation.isPending;

  const handleOpenPayment = () => {
    if (!paymentUrl) return;
    if (paymentUrl.includes('t.me/')) {
      openTelegramLink(paymentUrl);
    } else {
      openLink(paymentUrl);
    }
  };

  const handleCopyUrl = async () => {
    if (!paymentUrl) return;
    try {
      await copyToClipboard(paymentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard write failed silently
    }
  };

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <PaymentHeading />
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="hidden lg:contents">
          <PaymentSidebar />
        </div>
        <motion.div
          className="rd-card rd-card--lg flex min-w-0 flex-1 flex-col gap-6"
          variants={staggerContainer}
          initial="initial"
          animate="animate"
        >
          {/* Method: name and limits, no icon tile. */}
          <motion.div variants={staggerItem} className="flex flex-col gap-1">
            <h2 className="rd-h5 text-[var(--rd-heading)]">{methodName}</h2>
            <p className="rd-p-md text-[var(--rd-caption)]">
              {t('balance.paymentRange', {
                min: formatAmount(minRubles, 0),
                max: formatAmount(maxRubles, 0),
              })}
              {'\u00A0'}
              {currencySymbol}
            </p>
          </motion.div>

          {/* Payment options: a plain segmented switch. */}
          {hasOptions && orderedOptions.length > 0 && (
            <motion.div
              variants={staggerItem}
              role="radiogroup"
              aria-label={t('postq.payment.methodOption')}
              className="flex gap-1 rounded-[12px] bg-[var(--rd-field)] p-1"
            >
              {orderedOptions.map((opt) => {
                const selected = selectedOption === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setSelectedOption(opt.id)}
                    className={`rd-p-md h-10 min-w-0 flex-1 truncate rounded-[8px] px-3 transition-colors ${
                      selected
                        ? 'bg-[var(--rd-surface)] text-[var(--rd-heading)] [box-shadow:var(--rd-shadow-soft)]'
                        : 'text-[var(--rd-caption)] hover:text-[var(--rd-heading)]'
                    }`}
                  >
                    {stripLeadingEmoji(opt.name)}
                  </button>
                );
              })}
            </motion.div>
          )}

          {method.id === 'antilopay' && (
            <motion.div variants={staggerItem} className="space-y-2">
              <label htmlFor="payment-email" className="rd-p-md text-[var(--rd-heading)]">
                {t('balance.paymentEmail')}
              </label>
              <input
                ref={emailRef}
                id="payment-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                maxLength={254}
                value={customerEmail}
                onChange={(event) => {
                  setPaymentEmail(event.target.value);
                  setError(null);
                }}
                aria-describedby="payment-email-help"
                className="input w-full"
              />
              <p id="payment-email-help" className="rd-p-md text-[var(--rd-caption)]">
                {t('balance.paymentEmailHelp')}
              </p>
            </motion.div>
          )}

          {/* Amount, quick amounts under it, one button below. */}
          <motion.div variants={staggerItem} className="flex flex-col gap-3">
            <label htmlFor="topup-amount" className="sr-only">
              {t('postq.payment.amount')}
            </label>
            <div
              className={`relative rounded-[var(--rd-radius-sm)] border-2 bg-[var(--rd-field)] transition-colors ${
                isInputFocused ? 'border-[var(--rd-action)]' : 'border-transparent'
              }`}
            >
              <input
                ref={inputRef}
                id="topup-amount"
                type="number"
                inputMode="decimal"
                enterKeyHint="done"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setQuickRub(null);
                }}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder={t('postq.payment.amount')}
                className="rd-p-lg h-14 w-full bg-transparent px-5 pr-12 text-[var(--rd-heading)] placeholder:text-[var(--rd-placeholder)] focus:outline-none"
                autoComplete="off"
              />
              <span className="rd-p-lg absolute right-5 top-1/2 -translate-y-1/2 text-[var(--rd-caption)]">
                {currencySymbol}
              </span>
            </div>

            {quickAmounts.length > 0 && (
              // Even grid instead of flex-wrap: four in a row when they fit, 2×2 on
              // narrow screens — never a ragged 3 + 1.
              <div
                className={`grid gap-2 ${
                  quickAmounts.length === 1
                    ? 'grid-cols-1'
                    : quickAmounts.length === 3
                      ? 'grid-cols-3'
                      : 'grid-cols-2 min-[400px]:grid-cols-4'
                }`}
              >
                {quickAmounts.map((a) => {
                  const val = getQuickValue(a);
                  const isSelected = amount === val;
                  return (
                    <button
                      key={a}
                      type="button"
                      onClick={() => {
                        setAmount(val);
                        setQuickRub(a);
                        inputRef.current?.blur();
                        if (
                          method.id === 'antilopay' &&
                          (!customerEmail.trim() || !emailRef.current?.checkValidity())
                        ) {
                          setError(t('balance.paymentEmailInvalid'));
                          emailRef.current?.focus();
                          return;
                        }
                      }}
                      aria-pressed={isSelected}
                      className={`rd-p-md h-10 whitespace-nowrap rounded-[12px] px-2 transition-colors ${
                        isSelected
                          ? 'bg-[var(--rd-chip-hover)] text-[var(--rd-heading)]'
                          : 'bg-[var(--rd-field)] text-[var(--rd-body)] hover:bg-[var(--rd-chip-hover)]'
                      }`}
                    >
                      {formatAmount(a, 0)}
                      {'\u00A0'}
                      {currencySymbol}
                    </button>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={isPending || !amount || parseFloat(amount) <= 0}
              className="rd-btn mt-3 w-full"
            >
              {isPending ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <span>{t('balance.topUp')}</span>
              )}
            </button>
          </motion.div>

          {/* Error message */}
          {error && (
            <motion.div
              variants={staggerItem}
              role="alert"
              className="rd-p-md flex items-center gap-3 rounded-[var(--rd-radius-md)] bg-[var(--rd-error-bg)] px-6 py-4 text-[var(--rd-error-text)]"
            >
              <RdIcon name="cabinet/circle-alert" size={20} className="text-[var(--rd-error)]" />
              <span>{error}</span>
            </motion.div>
          )}

          {/* Payment link display - shown when URL is received */}
          {paymentUrl && (
            <motion.div
              variants={staggerItem}
              className="flex flex-col gap-4 rounded-[var(--rd-radius-md)] bg-[var(--rd-field)] p-6"
            >
              <div className="rd-p-lg flex items-center gap-2 text-[var(--rd-heading)]">
                <CheckIcon className="h-5 w-5 text-[var(--rd-success-text)]" />
                <span>{t('balance.paymentReady')}</span>
              </div>

              {qrPayload ? (
                <div className="flex flex-col items-center gap-2">
                  <div
                    className="rounded-[var(--rd-radius-sm)] bg-white p-3"
                    data-testid="topup-qr"
                  >
                    <QRCodeSVG value={qrPayload} size={192} level="M" includeMargin={false} />
                  </div>
                  <p className="rd-p-md text-center text-[var(--rd-caption)]">
                    {t(
                      'balance.scanQrToPay',
                      'Отсканируйте QR-код в приложении банка или откройте оплату',
                    )}
                  </p>
                </div>
              ) : (
                <p className="rd-p-md text-[var(--rd-caption)]">
                  {t('balance.clickToOpenPayment')}
                </p>
              )}

              <button type="button" onClick={handleOpenPayment} className="rd-btn w-full">
                <ExternalLinkIcon />
                <span>{t('balance.openPaymentPage')}</span>
              </button>

              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1 rounded-[var(--rd-radius-sm)] bg-[var(--rd-surface)] px-4 py-3">
                  <p className="rd-p-sm truncate text-[var(--rd-caption)]">{paymentUrl}</p>
                </div>
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  className={`shrink-0 rounded-[var(--rd-radius-sm)] bg-[var(--rd-surface)] p-3 transition-colors ${
                    copied
                      ? 'text-[var(--rd-success-text)]'
                      : 'text-[var(--rd-caption)] hover:text-[var(--rd-heading)]'
                  }`}
                  title={t('common.copy')}
                >
                  {copied ? <CheckIcon className="h-5 w-5" /> : <CopyIcon className="h-5 w-5" />}
                </button>
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
