import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { notificationsApi, type NotificationSettings } from '@/api/notifications';

/** Number field with up/down arrows (Figma «Редактирование порога»). */
function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  /** Buttons move to the next multiple of the step (85 → 90 → 80). */
  step?: number;
  label: string;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  // − value + : big enough to hit with a thumb, no native spinners.
  const btn =
    'flex size-10 shrink-0 items-center justify-center rounded-[12px] text-[20px] leading-none text-[var(--rd-heading)] transition-colors hover:bg-[var(--rd-chip-hover)] disabled:opacity-40 disabled:hover:bg-transparent';
  return (
    <span className="flex h-10 items-center rounded-[12px] bg-[var(--rd-field)]">
      <button
        type="button"
        aria-label="−"
        className={btn}
        disabled={value <= min}
        onClick={() => onChange(clamp(Math.ceil(value / step) * step - step))}
      >
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        aria-label={label}
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value) || min))}
        style={{ width: `${Math.max(2, String(value).length) + 1}ch` }}
        className="rd-p-md min-w-0 bg-transparent text-center text-[var(--rd-heading)] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        type="button"
        aria-label="+"
        className={btn}
        disabled={value >= max}
        onClick={() => onChange(clamp(Math.floor(value / step) * step + step))}
      >
        +
      </button>
    </span>
  );
}

function Row({
  title,
  description,
  checked,
  onToggle,
  children,
}: {
  title: string;
  description: string;
  checked: boolean;
  onToggle: (v: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-[var(--rd-divider)] py-4 last:border-b-0">
      <div className="flex items-center gap-4 sm:gap-8">
        <div className="rd-p-md flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-medium text-[var(--rd-heading)]">{title}</span>
          <span className="text-[var(--rd-placeholder)]">{description}</span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={title}
          onClick={() => onToggle(!checked)}
          className="rd-switch !h-7 !w-12 after:!size-[22px] aria-checked:after:!translate-x-5"
        />
      </div>
      {checked && children}
    </div>
  );
}

/** «Уведомления» with a local draft saved by one button, as in the frame. */
export function NotificationsCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['notification-settings'],
    queryFn: notificationsApi.getSettings,
  });
  const [draft, setDraft] = useState<NotificationSettings | null>(null);
  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const save = useMutation({
    mutationFn: notificationsApi.updateSettings,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notification-settings'] }),
  });

  const dirty = !!data && !!draft && JSON.stringify(data) !== JSON.stringify(draft);
  const set = <K extends keyof NotificationSettings>(key: K, value: NotificationSettings[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  return (
    <section className="rd-card rd-card--lg flex flex-col gap-3">
      <h2 className="rd-h6 text-[var(--rd-heading)]">{t('postq.profile.notifications')}</h2>
      {isLoading || !draft ? (
        <p className="rd-p-md py-5 text-[var(--rd-caption)]">
          {isLoading ? t('common.loading') : t('profile.notifications.unavailable')}
        </p>
      ) : (
        <>
          <div className="flex flex-col">
            <Row
              title={t('postq.profile.nExpiry')}
              description={t('postq.profile.nExpiryDesc')}
              checked={draft.subscription_expiry_enabled}
              onToggle={(v) => set('subscription_expiry_enabled', v)}
            >
              <div className="rd-p-md flex flex-wrap items-center gap-3 text-[var(--rd-body)]">
                {t('postq.profile.expiryBefore')}
                <Stepper
                  label={t('profile.notifications.daysBeforeExpiry')}
                  value={draft.subscription_expiry_days}
                  min={1}
                  max={30}
                  onChange={(v) => set('subscription_expiry_days', v)}
                />
                {t('postq.profile.expiryAfter')}
              </div>
            </Row>
            <Row
              title={t('postq.profile.nTraffic')}
              description={t('postq.profile.nTrafficDesc')}
              checked={draft.traffic_warning_enabled}
              onToggle={(v) => set('traffic_warning_enabled', v)}
            >
              <div className="rd-p-md flex flex-wrap items-center gap-3 text-[var(--rd-body)]">
                {t('postq.profile.trafficAt')}
                <Stepper
                  label={t('profile.notifications.atPercent')}
                  value={draft.traffic_warning_percent}
                  min={50}
                  max={90}
                  step={10}
                  onChange={(v) => set('traffic_warning_percent', v)}
                />
                %
              </div>
            </Row>
            <Row
              title={t('postq.profile.nBalance')}
              description={t('postq.profile.nBalanceDesc')}
              checked={draft.balance_low_enabled}
              onToggle={(v) => set('balance_low_enabled', v)}
            >
              <div className="rd-p-md flex flex-wrap items-center gap-3 text-[var(--rd-body)]">
                {t('postq.profile.balanceBelow')}
                <Stepper
                  label={t('profile.notifications.threshold')}
                  value={draft.balance_low_threshold}
                  min={0}
                  max={100000}
                  onChange={(v) => set('balance_low_threshold', v)}
                />
                ₽
              </div>
            </Row>
            <Row
              title={t('postq.profile.nNews')}
              description={t('postq.profile.nNewsDesc')}
              checked={draft.news_enabled}
              onToggle={(v) => set('news_enabled', v)}
            />
            <Row
              title={t('postq.profile.nPromo')}
              description={t('postq.profile.nPromoDesc')}
              checked={draft.promo_offers_enabled}
              onToggle={(v) => set('promo_offers_enabled', v)}
            />
          </div>
          {/* The save button shows up only once something changed. */}
          {dirty && (
            <button
              type="button"
              disabled={save.isPending}
              onClick={() => draft && save.mutate(draft)}
              className="rd-btn mt-2 w-full sm:w-auto sm:self-start"
            >
              {save.isPending ? t('common.loading') : t('postq.profile.save')}
            </button>
          )}
          {save.isError && (
            <p role="alert" className="rd-p-sm text-[var(--rd-error-text)]">
              {t('profile.notifications.saveError', 'Не удалось сохранить настройки')}
            </p>
          )}
        </>
      )}
    </section>
  );
}
