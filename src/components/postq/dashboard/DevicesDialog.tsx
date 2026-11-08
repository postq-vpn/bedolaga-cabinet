import { useEffect, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { subscriptionApi } from '@/api/subscription';
import { useCurrency } from '@/hooks/useCurrency';
import { getErrorMessage, getInsufficientBalanceError } from '@/utils/subscriptionHelpers';
import { uiLocale } from '@/utils/uiLocale';
import { cn } from '@/lib/utils';
import { RdIcon } from '../RdIcon';
import { RdDialog } from '../RdDialog';
import { ProgressTrack } from '../ui';
import { TopUpDialog } from '../payment/TopUpDialog';

const CONFIRM_WINDOW = 5;

const MENU_ITEM =
  'rd-p-md flex cursor-pointer select-none rounded-[var(--rd-radius-sm)] px-4 py-3 text-[var(--rd-heading)] outline-none transition-colors data-[highlighted]:bg-[var(--rd-field)]';

function platformIcon(platform: string) {
  const p = platform.toLowerCase();
  if (/ios|iphone|ipad|mac|darwin/.test(p)) return 'cabinet/os-apple-fill';
  if (/android/.test(p)) return 'cabinet/os-android-fill';
  if (/windows|win/.test(p)) return 'cabinet/os-windows-fill';
  if (/tv/.test(p)) return 'cabinet/os-tv-fill';
  return 'cabinet/os-windows-fill';
}

/**
 * Device management from the dashboard's «Изменить» (no frame yet, same
 * system): connected devices with removal, and the device limit — raising it
 * buys slots from the balance, lowering it gives them back.
 */
export function DevicesDialog({
  open,
  onOpenChange,
  subscriptionId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscriptionId: number;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { formatAmount, currencySymbol } = useCurrency();
  const money = (kopeks: number) =>
    `${formatAmount(kopeks / 100, kopeks % 100 === 0 ? 0 : 2)} ${currencySymbol}`;

  const devicesQuery = useQuery({
    queryKey: ['devices', subscriptionId],
    queryFn: () => subscriptionApi.getDevices(subscriptionId),
    enabled: open,
  });
  const devices = devicesQuery.data?.devices ?? [];
  const currentLimit = devicesQuery.data?.device_limit ?? 0;

  const [target, setTarget] = useState(currentLimit);
  useEffect(() => {
    if (open) setTarget(currentLimit);
  }, [open, currentLimit]);
  const delta = target - currentLimit;

  const reductionQuery = useQuery({
    queryKey: ['device-reduction', subscriptionId],
    queryFn: () => subscriptionApi.getDeviceReductionInfo(subscriptionId),
    enabled: open,
  });
  const priceQuery = useQuery({
    queryKey: ['device-price', subscriptionId, delta],
    queryFn: () => subscriptionApi.getDevicePrice(delta, subscriptionId),
    enabled: open && delta > 0,
  });
  const firstPrice = useQuery({
    queryKey: ['device-price', subscriptionId, 1],
    queryFn: () => subscriptionApi.getDevicePrice(1, subscriptionId),
    enabled: open,
  });

  const minLimit = Math.max(
    1,
    reductionQuery.data?.available ? reductionQuery.data.min_device_limit : currentLimit,
  );
  const maxLimit =
    firstPrice.data?.available && firstPrice.data.max_device_limit
      ? firstPrice.data.max_device_limit
      : firstPrice.data?.available
        ? currentLimit + (firstPrice.data.can_add ?? 0)
        : currentLimit;

  const refresh = () => {
    for (const key of [
      'devices',
      'subscription',
      'subscriptions-list',
      'balance',
      'device-reduction',
      'device-price',
    ]) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  };

  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<number | null>(null);
  const [confirmHwid, setConfirmHwid] = useState<string | null>(null);
  const [topUpOpen, setTopUpOpen] = useState(false);

  const [editing, setEditing] = useState<{ hwid: string; name: string } | null>(null);
  // «Удалить все» without a dialog on top of the dialog: the first press arms
  // the button («Точно?»), the second one deletes; it disarms by itself.
  const [armedIn, setArmedIn] = useState<number | null>(null);
  useEffect(() => {
    if (!open) setArmedIn(null);
  }, [open]);

  const renameDevice = useMutation({
    mutationFn: ({ hwid, name }: { hwid: string; name: string | null }) =>
      subscriptionApi.renameDevice(hwid, name, subscriptionId),
    onSuccess: () => {
      setEditing(null);
      refresh();
    },
    onError: (e) => setError(getErrorMessage(e, t)),
  });

  const removeAll = useMutation({
    mutationFn: () => subscriptionApi.deleteAllDevices(subscriptionId),
    onSuccess: refresh,
    onError: (e) => setError(getErrorMessage(e, t)),
  });

  useEffect(() => {
    if (armedIn === null) return;
    // 5 → 0 one step per second (the bar drains to empty), then disarm: no
    // second press within the window means nothing happens.
    const timer = setTimeout(() => setArmedIn((v) => (v === null || v === 0 ? null : v - 1)), 1000);
    return () => clearTimeout(timer);
  }, [armedIn]);

  const removeDevice = useMutation({
    mutationFn: (hwid: string) => subscriptionApi.deleteDevice(hwid, subscriptionId),
    onSuccess: () => {
      setConfirmHwid(null);
      refresh();
    },
    onError: (e) => setError(getErrorMessage(e, t)),
  });

  const applyLimit = useMutation({
    mutationFn: async (): Promise<unknown> =>
      delta > 0
        ? subscriptionApi.purchaseDevices(delta, subscriptionId)
        : subscriptionApi.reduceDevices(target, subscriptionId),
    onMutate: () => {
      setError(null);
      setMissing(null);
    },
    onSuccess: refresh,
    onError: (e) => {
      const insufficient = getInsufficientBalanceError(e);
      if (insufficient) {
        setMissing(
          insufficient.missingAmount || Math.max(0, insufficient.required - insufficient.balance),
        );
      } else setError(getErrorMessage(e, t));
    },
  });

  const price = priceQuery.data?.available ? (priceQuery.data.total_price_kopeks ?? 0) : null;
  const perDevice = firstPrice.data?.available
    ? firstPrice.data.price_per_device_kopeks
    : undefined;

  return (
    <>
      <RdDialog
        open={open}
        onOpenChange={onOpenChange}
        title={t('postq.devices.title')}
        description={t('postq.devices.connected', { used: devices.length, limit: currentLimit })}
      >
        {currentLimit > 0 && (
          <ProgressTrack
            percent={(devices.length / currentLimit) * 100}
            label={t('postq.devices.title')}
          />
        )}

        {/* Connected devices: one compact tile each — icon, name, a short
              detail line; rename / remove sit in the «…» menu (same as the
              subscription card), confirmations happen right in the tile. */}
        <div className="flex flex-col gap-2">
          {devicesQuery.isLoading ? (
            <p className="rd-p-md text-[var(--rd-caption)]">{t('common.loading')}</p>
          ) : devices.length === 0 ? (
            <p className="rd-p-md rounded-[var(--rd-radius-sm)] bg-[var(--rd-field)] px-6 py-4 text-[var(--rd-caption)]">
              {t('postq.devices.empty')}
            </p>
          ) : (
            devices.map((d) => (
              <div
                key={d.hwid}
                className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-3 rounded-[var(--rd-radius-sm)] bg-[var(--rd-field)] px-4 py-3"
              >
                <RdIcon
                  name={platformIcon(d.platform)}
                  size={24}
                  className="shrink-0 text-[var(--rd-heading)]"
                />
                {editing?.hwid === d.hwid ? (
                  <form
                    className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      renameDevice.mutate({ hwid: d.hwid, name: editing.name.trim() || null });
                    }}
                  >
                    <input
                      value={editing.name}
                      onChange={(e) => setEditing({ hwid: d.hwid, name: e.target.value })}
                      onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}
                      placeholder={d.device_model || t('postq.devices.renamePlaceholder')}
                      aria-label={t('postq.devices.renamePlaceholder')}
                      maxLength={64}
                      autoFocus
                      className="rd-p-md h-10 min-w-[160px] flex-1 rounded-[var(--rd-radius-sm)] border-2 border-[var(--rd-action)] bg-[var(--rd-surface)] px-3 text-[var(--rd-heading)] outline-none"
                    />
                    <span className="rd-p-md flex shrink-0 items-center gap-4">
                      <button
                        type="submit"
                        disabled={renameDevice.isPending}
                        className="rd-link-action font-medium disabled:opacity-50"
                      >
                        {renameDevice.isPending ? t('common.loading') : t('postq.devices.save')}
                      </button>
                      <button type="button" onClick={() => setEditing(null)} className="rd-link">
                        {t('common.cancel')}
                      </button>
                    </span>
                  </form>
                ) : (
                  <>
                    {confirmHwid === d.hwid ? (
                      // Confirmation replaces the text, so the name isn't squeezed.
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <span className="rd-p-md break-words text-[var(--rd-heading)]">
                          {t('postq.devices.removeQuestion', {
                            name: d.local_name || d.device_model || d.platform,
                          })}
                        </span>
                        <span className="rd-p-md flex items-center gap-4">
                          <button
                            type="button"
                            disabled={removeDevice.isPending}
                            onClick={() => removeDevice.mutate(d.hwid)}
                            className="font-medium text-[var(--rd-error-text)] disabled:opacity-50"
                          >
                            {removeDevice.isPending
                              ? t('common.loading')
                              : t('postq.devices.remove')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmHwid(null)}
                            className="rd-link"
                          >
                            {t('common.cancel')}
                          </button>
                        </span>
                      </div>
                    ) : (
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="rd-p-md truncate font-medium text-[var(--rd-heading)]">
                          {d.local_name || d.device_model || d.platform}
                        </span>
                        <span className="rd-p-sm truncate text-[var(--rd-caption)]">
                          {[
                            d.platform,
                            d.created_at
                              ? new Date(d.created_at).toLocaleDateString(uiLocale(), {
                                  day: 'numeric',
                                  month: 'short',
                                })
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </div>
                    )}
                    {confirmHwid !== d.hwid && (
                      <DropdownMenu.Root modal={false}>
                        <DropdownMenu.Trigger
                          aria-label={t('postq.devices.actions')}
                          className="rd-icon-btn size-8 shrink-0 bg-[var(--rd-surface)] text-[var(--rd-body)] data-[state=open]:bg-[var(--rd-chip-hover)]"
                        >
                          <RdIcon name="cabinet/ellipsis" size={20} />
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Portal>
                          <DropdownMenu.Content
                            align="end"
                            sideOffset={8}
                            className="z-[60] flex w-[200px] flex-col gap-1 rounded-[20px] bg-[var(--rd-surface)] p-2 shadow-[0_12px_48px_rgba(0,0,0,0.12)] data-[state=open]:animate-fade-in"
                          >
                            <DropdownMenu.Item
                              className={MENU_ITEM}
                              onSelect={() =>
                                setEditing({
                                  hwid: d.hwid,
                                  name: d.local_name || d.device_model || '',
                                })
                              }
                            >
                              {t('postq.devices.rename')}
                            </DropdownMenu.Item>
                            <DropdownMenu.Item
                              className={cn(MENU_ITEM, 'text-[var(--rd-error-text)]')}
                              onSelect={() => setConfirmHwid(d.hwid)}
                            >
                              {t('postq.devices.remove')}
                            </DropdownMenu.Item>
                          </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                      </DropdownMenu.Root>
                    )}
                  </>
                )}
              </div>
            ))
          )}
          {/* Same tile shape as the devices, red text on the neutral fill;
                the second tap within the countdown removes everything. */}
          {devices.length > 1 && (
            <button
              type="button"
              disabled={removeAll.isPending}
              onClick={() => {
                if (armedIn !== null) {
                  setArmedIn(null);
                  removeAll.mutate();
                } else setArmedIn(CONFIRM_WINDOW);
              }}
              className={cn(
                'rd-p-md h-12 w-full rounded-[var(--rd-radius-sm)] text-[var(--rd-error-text)] transition-colors disabled:opacity-50',
                armedIn !== null
                  ? 'bg-[var(--rd-error-bg)] font-medium'
                  : 'bg-[var(--rd-field)] hover:bg-[var(--rd-chip-hover)]',
              )}
            >
              {removeAll.isPending
                ? t('common.loading')
                : armedIn !== null
                  ? t('postq.devices.removeAllSure', { seconds: armedIn })
                  : t('postq.devices.removeAll')}
            </button>
          )}
        </div>

        <div className="h-px w-full bg-[var(--rd-border)]" />

        {/* Device limit: buy more / give back */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="rd-p-lg text-[var(--rd-heading)]">
              {t('postq.devices.limitTitle')}
            </span>
            {perDevice !== undefined && (
              <span className="rd-p-md text-[var(--rd-caption)]">
                {t('postq.devices.perDevice', { price: money(perDevice) })}
              </span>
            )}
          </div>
          <div className="flex items-center justify-center gap-6">
            <button
              type="button"
              aria-label={t('postq.devices.less')}
              disabled={target <= minLimit || applyLimit.isPending}
              onClick={() => setTarget((v) => Math.max(minLimit, v - 1))}
              className="rd-icon-btn size-12 !rounded-[var(--rd-radius-sm)] bg-[var(--rd-field)] text-[24px] leading-none text-[var(--rd-heading)] disabled:opacity-40"
            >
              −
            </button>
            <div className="flex min-w-[96px] flex-col items-center">
              <span className="rd-h3 text-[var(--rd-heading)]">{target}</span>
              <span className="rd-p-md text-[var(--rd-caption)]">
                {t('postq.devices.unit', { count: target })}
              </span>
            </div>
            <button
              type="button"
              aria-label={t('postq.devices.more')}
              disabled={target >= maxLimit || applyLimit.isPending}
              onClick={() => setTarget((v) => Math.min(maxLimit, v + 1))}
              className="rd-icon-btn size-12 !rounded-[var(--rd-radius-sm)] bg-[var(--rd-field)] text-[24px] leading-none text-[var(--rd-heading)] disabled:opacity-40"
            >
              +
            </button>
          </div>
          {firstPrice.data && !firstPrice.data.available && firstPrice.data.reason && (
            <p className="rd-p-sm text-center text-[var(--rd-caption)]">{firstPrice.data.reason}</p>
          )}
          {delta < 0 && devices.length > target && (
            <p className="rd-p-sm text-center text-[var(--rd-caption)]">
              {t('postq.devices.reduceHint', { count: devices.length - target })}
            </p>
          )}

          {missing !== null && (
            <div className="rd-p-md flex flex-col gap-2 rounded-[var(--rd-radius-md)] bg-[var(--rd-error-bg)] px-6 py-4">
              <span className="font-medium text-[var(--rd-error)]">
                {t('postq.devices.insufficient')}
              </span>
              <span className="text-[var(--rd-heading)]">
                {t('postq.devices.missing', { amount: money(missing) })}
              </span>
            </div>
          )}
          {error && (
            <p role="alert" className="rd-p-sm text-[var(--rd-error-text)]">
              {error}
            </p>
          )}

          {missing !== null ? (
            <button type="button" className="rd-btn w-full" onClick={() => setTopUpOpen(true)}>
              {t('postq.devices.topUp', { amount: money(missing) })}
            </button>
          ) : (
            <button
              type="button"
              disabled={delta === 0 || applyLimit.isPending || (delta > 0 && price === null)}
              onClick={() => applyLimit.mutate()}
              className={cn(
                'rd-btn w-full',
                delta === 0 && '!bg-[var(--rd-chip)] !text-[var(--rd-placeholder)] !opacity-100',
              )}
            >
              {applyLimit.isPending
                ? t('common.loading')
                : delta > 0
                  ? price !== null
                    ? t('postq.devices.buy', { count: delta, price: money(price) })
                    : t('common.loading')
                  : delta < 0
                    ? t('postq.devices.reduce', { count: -delta })
                    : t('postq.devices.noChanges')}
            </button>
          )}
        </div>
      </RdDialog>
      {missing !== null && (
        <TopUpDialog
          open={topUpOpen}
          onOpenChange={setTopUpOpen}
          amountKopeks={missing}
          // The bot buys the saved devices once the top-up lands.
          onBeforePay={() => subscriptionApi.saveDevicesCart(delta, subscriptionId).catch(() => {})}
        />
      )}
    </>
  );
}
