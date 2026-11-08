import { useCallback, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CopyField, Metric } from '@/components/postq/ui';
import { useTranslation } from 'react-i18next';
import { referralApi, type ReferralEarning } from '../api/referral';
import type { ReferralDaysTargetOption, ReferralTerms } from '../types';
import { usePlatform } from '../platform';
import { brandingApi } from '../api/branding';
import { partnerApi } from '../api/partners';
import { PartnerSection } from '@/components/postq/referral/PartnerSection';
import { CampaignCard } from '../components/partner/CampaignCard';
import { useCurrency } from '../hooks/useCurrency';
import { StatCard } from '@/components/stats';
import { PageSkeleton, Skeleton } from '@/components/ui/skeleton';
import { BanknotesIcon, CalendarIcon, LinkIcon, ShareIcon, UsersIcon } from '@/components/icons';

/**
 * The rank line under the programme terms, or null when there is nothing to say.
 *
 * Three states, and only two of them produce text: no rank reached yet, and a
 * rank with a next step ahead. A partner standing on the TOP rank has no next
 * step — rendering an empty paragraph for them left a stray margin on the one
 * screen that should read as "you are done climbing".
 *
 * Under `chain` there are no ranks at all, so nothing is shown: the server sends
 * tier_current_level = null there, and a naive check would tell every single user
 * "no rank reached yet" about a concept that does not exist in their programme.
 *
 * Exported for tests: the decision is worth checking on its own, without
 * mounting the whole page.
 */
/**
 * Programme terms under the `levels` scheme.
 *
 * Exported so the card can be tested on its own: mounting the whole Referral page
 * needs a dozen mocks, and the part worth checking is this one — whether the card
 * states which mode is in force and marks the level the viewer is actually on.
 */
/**
 * What the user chose: the form of the reward and where the days land.
 *
 * Rendered only for the parts an administrator allowed — a control that changes
 * nothing promises an influence it does not have. Each option shows whether it is
 * the one in force, because a settings screen that does not say what is selected
 * makes people guess.
 *
 * Exported for tests: mounting the whole page needs a dozen mocks, and the part
 * worth checking is this one.
 */
export function RewardSettings({
  terms,
  onChange,
  pending = false,
}: {
  terms: ReferralTerms;
  onChange: (payload: {
    reward_preference?: string | null;
    days_target_subscription_id?: number | null;
    set_reward_preference?: boolean;
    set_days_target?: boolean;
  }) => void;
  pending?: boolean;
}) {
  const { t } = useTranslation();
  const kindChoice = terms.allow_reward_kind_choice === true;
  const targetChoice = terms.allow_days_target_choice === true;
  if (!kindChoice && !targetChoice) return null;

  const options = terms.days_target_options ?? [];
  // Выбор двоичный: деньги ИЛИ дни. Не выбиравший получает деньги — так же, как
  // их выдаст расчёт, поэтому и отмечены они, а не «ничего не выбрано».
  const kinds = [
    {
      value: 'money',
      label: t('referral.rewardSettings.kindMoney'),
      // Сумма важнее общей фразы: без неё выбор делается вслепую — непонятно,
      // от чего отказываешься. Общая фраза остаётся, когда суммы нет.
      hint: terms.reward_choice_money || t('referral.rewardSettings.kindMoneyHint'),
      amount: Boolean(terms.reward_choice_money),
      icon: <BanknotesIcon className="h-5 w-5" />,
    },
    {
      value: 'days',
      label: t('referral.rewardSettings.kindDays'),
      hint: terms.reward_choice_days || t('referral.rewardSettings.kindDaysHint'),
      amount: Boolean(terms.reward_choice_days),
      icon: <CalendarIcon className="h-5 w-5" />,
    },
  ];
  const currentKind = terms.reward_preference === 'days' ? 'days' : 'money';

  const optionLabel = (option: ReferralDaysTargetOption) => {
    const name = option.tariff_name || t('referral.rewardSettings.subscription');
    if (!option.end_date) return name;
    const until = t('referral.rewardSettings.until', {
      date: new Date(option.end_date).toLocaleDateString(),
    });
    return `${name} — ${until}`;
  };

  const choice = (key: string, selected: boolean, label: string, onSelect: () => void) => (
    <button
      key={key}
      type="button"
      disabled={pending}
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex w-full items-center gap-3 rounded-[var(--rd-radius-sm)] border p-3 text-left rd-p-md transition-colors disabled:opacity-60 ${
        selected
          ? 'border-[var(--rd-action)] bg-[var(--rd-help)] text-[var(--rd-heading)]'
          : 'border-[var(--rd-border)] bg-[var(--rd-field)] text-[var(--rd-body)] hover:border-[var(--rd-border)]'
      }`}
    >
      <span
        aria-hidden="true"
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
          selected ? 'border-[var(--rd-action)]' : 'border-[var(--rd-border)]'
        }`}
      >
        {selected && <span className="h-2 w-2 rounded-full bg-[var(--rd-action-hover)]" />}
      </span>
      <span>{label}</span>
    </button>
  );

  return (
    <div className="rd-card rd-card--lg">
      <h2 className="rd-h5 text-[var(--rd-heading)]">{t('referral.rewardSettings.title')}</h2>
      <p className="mt-1 rd-p-md text-[var(--rd-caption)]">{t('referral.rewardSettings.intro')}</p>

      {kindChoice && (
        <section className="mt-4">
          <h3 className="rd-p-md font-medium text-[var(--rd-body)]">
            {t('referral.rewardSettings.kindHeader')}
          </h3>
          <p className="mt-1 text-xs text-[var(--rd-caption)]">
            {t('referral.rewardSettings.kindHint')}
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {kinds.map((kind) => {
              const selected = currentKind === kind.value;
              return (
                <button
                  key={kind.value}
                  type="button"
                  disabled={pending}
                  aria-pressed={selected}
                  onClick={() =>
                    onChange({ reward_preference: kind.value, set_reward_preference: true })
                  }
                  className={`flex items-start gap-3 rounded-[var(--rd-radius-sm)] border p-3 text-left transition-colors disabled:opacity-60 ${
                    selected
                      ? 'border-[var(--rd-action)] bg-[var(--rd-help)]'
                      : 'border-[var(--rd-border)] bg-[var(--rd-field)] hover:border-[var(--rd-border)]'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--rd-radius-sm)] ${
                      selected
                        ? 'bg-[var(--rd-help)] text-[var(--rd-action)]'
                        : 'bg-[var(--rd-chip-hover)] text-[var(--rd-caption)]'
                    }`}
                  >
                    {kind.icon}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={`block rd-p-md font-medium ${selected ? 'text-[var(--rd-heading)]' : 'text-[var(--rd-body)]'}`}
                    >
                      {kind.label}
                    </span>
                    <span
                      className={`mt-1 block text-xs ${
                        kind.amount
                          ? selected
                            ? 'font-medium text-[var(--rd-action)]'
                            : 'font-medium text-[var(--rd-body)]'
                          : 'text-[var(--rd-caption)]'
                      }`}
                    >
                      {kind.hint}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Куда класть дни спрашиваем, только когда человек выбрал дни: выбравшему
          деньги эта настройка ни на что не влияет, и раздел обещал бы влияние,
          которого нет. Если выбор вида админ не разрешил, спрашиваем всегда —
          дни тогда приходят по правилу, и цель у них есть. */}
      {targetChoice && (!kindChoice || currentKind === 'days') && (
        <section className="mt-5">
          <h3 className="rd-p-md font-medium text-[var(--rd-body)]">
            {t('referral.rewardSettings.targetHeader')}
          </h3>
          <p className="mt-1 text-xs text-[var(--rd-caption)]">
            {t('referral.rewardSettings.targetHint')}
          </p>
          {options.length === 0 ? (
            <p className="mt-2 rd-p-md text-[var(--rd-caption)]">
              {t('referral.rewardSettings.targetNone')}
            </p>
          ) : (
            <div className="mt-2 space-y-2">
              {/* Автоподбор — тоже вариант, и он обязан быть виден как выбранный:
                  иначе непонятно, что происходит сейчас. */}
              {choice(
                'auto',
                (terms.days_target_subscription_id ?? null) === null,
                t('referral.rewardSettings.targetAuto'),
                () => onChange({ days_target_subscription_id: null, set_days_target: true }),
              )}
              {options.map((option) =>
                choice(
                  String(option.id),
                  terms.days_target_subscription_id === option.id,
                  optionLabel(option),
                  () => onChange({ days_target_subscription_id: option.id, set_days_target: true }),
                ),
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export function ProgrammeTerms({ terms }: { terms: ReferralTerms }) {
  const { t } = useTranslation();
  const isTiers = terms.levels_mode === 'tiers';
  const levels = terms.levels ?? [];
  // Строки-описания остаются запасным путём: они приходят из того же источника
  // и покрывают старый сервер, который ещё не отдаёт разбор по частям.
  const fallbackLines = terms.level_descriptions ?? [];
  const progress = tierProgressText(terms, t);

  return (
    <div className="rd-card rd-card--lg">
      <div className="mb-4">
        <h2 className="rd-h5 text-[var(--rd-heading)]">{t('referral.terms.title')}</h2>
        {/* Правило режима — одной фразой над лестницей. Без неё список
              уровней в режиме «за приглашённых» читается как складывающиеся
              награды, а в цепочке — наоборот, как выбор одной из них. */}
        <p className="mt-1 rd-p-md text-[var(--rd-caption)]">
          {isTiers ? t('referral.terms.modeTiers') : t('referral.terms.modeChain')}
        </p>
      </div>

      {levels.length > 0 ? (
        <ol className="space-y-2">
          {levels.map((lvl) => (
            <li
              key={lvl.level}
              className={`rounded-[var(--rd-radius-sm)] border p-3 transition-colors ${
                lvl.is_current
                  ? 'border-[var(--rd-action)] bg-[var(--rd-help)]'
                  : 'border-[var(--rd-border)] bg-[var(--rd-field)]'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex h-7 min-w-7 items-center justify-center rounded-[var(--rd-radius-sm)] px-2 rd-p-md font-semibold ${
                    lvl.is_current
                      ? 'bg-[var(--rd-action)] text-[var(--rd-on-action)]'
                      : 'bg-[var(--rd-chip-hover)] text-[var(--rd-body)]'
                  }`}
                >
                  {lvl.level}
                </span>
                <span className="rd-p-md font-medium text-[var(--rd-heading)]">
                  {t('referral.terms.levelLabel', { level: lvl.level })}
                </span>
                {lvl.is_current && (
                  <span className="rounded-full bg-[var(--rd-help)] px-2 py-1 text-xs text-[var(--rd-action)]">
                    {t('referral.terms.currentBadge')}
                  </span>
                )}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                {lvl.pays_referrer ? (
                  lvl.rewards.map((reward) => (
                    <span
                      key={reward}
                      className="rounded-[var(--rd-radius-sm)] bg-[var(--rd-success-bg)] px-2 py-1 rd-p-md text-[var(--rd-success-text)]"
                    >
                      {reward}
                    </span>
                  ))
                ) : (
                  <span className="rounded-[var(--rd-radius-sm)] bg-[var(--rd-chip-hover)] px-2 py-1 rd-p-md text-[var(--rd-caption)]">
                    {t('referral.terms.paysNothing')}
                  </span>
                )}
                {lvl.pays_referrer && lvl.trigger_label && (
                  <span className="text-xs text-[var(--rd-caption)]">{lvl.trigger_label}</span>
                )}
              </div>

              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--rd-caption)]">
                {/* Условие показывается только там, где оно есть смысл: в
                      цепочке уровень открывается порогом, а в режиме за
                      приглашённых порог и определяет, какой уровень ваш. */}
                <span>
                  {lvl.required_referrals > 0
                    ? lvl.required_referrals_active_only
                      ? t('referral.terms.fromActive', { count: lvl.required_referrals })
                      : t('referral.terms.fromAny', { count: lvl.required_referrals })
                    : t('referral.terms.startingLevel')}
                </span>
                {lvl.referee_reward && (
                  <span>{t('referral.terms.refereeGets', { reward: lvl.referee_reward })}</span>
                )}
              </div>
            </li>
          ))}
        </ol>
      ) : fallbackLines.length > 0 ? (
        <ul className="space-y-2">
          {fallbackLines.map((line) => (
            <li key={line} className="flex items-start gap-2 rd-p-md text-[var(--rd-body)]">
              <span aria-hidden="true" className="mt-1 text-[var(--rd-action)]">
                •
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rd-p-md text-[var(--rd-caption)]">{t('referral.terms.noLevels')}</p>
      )}

      {terms.personal_percent != null && (
        <p className="mt-4 rounded-[var(--rd-radius-sm)] border border-transparent bg-[var(--rd-warn-bg)] p-3 rd-p-md text-[var(--rd-warn-icon)]">
          {t('referral.terms.personalRate', { percent: terms.personal_percent })}
        </p>
      )}

      {progress && <p className="mt-4 rd-p-md text-[var(--rd-body)]">{progress}</p>}
    </div>
  );
}

export function tierProgressText(
  terms: Pick<
    ReferralTerms,
    'levels_mode' | 'tier_current_level' | 'tier_next_level' | 'tier_next_remaining'
  >,
  t: (key: string, options?: Record<string, unknown>) => string,
): string | null {
  if (terms.levels_mode !== 'tiers') return null;
  if (terms.tier_current_level == null) return t('referral.terms.tierNone');
  if (terms.tier_next_level == null) return null;
  return t('referral.terms.tierNext', {
    level: terms.tier_next_level,
    count: terms.tier_next_remaining ?? 0,
  });
}

export default function Referral() {
  const { t, i18n } = useTranslation();
  const { formatAmount, currencySymbol, formatPositive } = useCurrency();
  const queryClient = useQueryClient();
  const [rewardChoiceError, setRewardChoiceError] = useState<string | null>(null);

  const { data: info, isLoading } = useQuery({
    queryKey: ['referral-info'],
    queryFn: referralApi.getReferralInfo,
  });

  // Build referral link for cabinet registration
  const referralLink = info?.referral_code
    ? `${window.location.origin}/login?ref=${info.referral_code}`
    : '';
  const botReferralLink = info?.bot_referral_link || '';

  const rewardChoiceMutation = useMutation({
    mutationFn: referralApi.updateRewardChoice,
    // Ответ эндпоинта — те же условия целиком, поэтому кладём их в кэш сразу:
    // повторный запрос показал бы прежний выбор на долю секунды.
    onSuccess: (updated) => queryClient.setQueryData(['referral-terms'], updated),
    onError: () => setRewardChoiceError(t('referral.rewardSettings.saveError')),
  });

  const { data: terms } = useQuery({
    queryKey: ['referral-terms'],
    queryFn: referralApi.getReferralTerms,
  });

  const { data: referralList } = useQuery({
    queryKey: ['referral-list'],
    queryFn: () => referralApi.getReferralList({ per_page: 10 }),
  });

  const { data: earnings } = useQuery({
    queryKey: ['referral-earnings'],
    queryFn: () => referralApi.getReferralEarnings({ per_page: 10 }),
  });

  const { data: branding } = useQuery({
    queryKey: ['branding'],
    queryFn: brandingApi.getBranding,
    staleTime: 60000,
  });

  // Partner status query
  const { data: partnerStatus } = useQuery({
    queryKey: ['partner-status'],
    queryFn: partnerApi.getStatus,
  });

  const isPartner = partnerStatus?.partner_status === 'approved';

  const isLevelsScheme = terms?.scheme === 'levels';
  const isTiersScheme = isLevelsScheme && terms?.levels_mode === 'tiers';

  /**
   * A reward can be money, subscription days, or both. Days carry
   * amount_kopeks = 0 by design, so formatting by the money amount alone renders
   * a real "+7 days" reward as "+0.00 ₽". Zero money is omitted next to days for
   * the same reason it is on the bot side: it reports the absence of something
   * this programme never promised.
   */
  const formatEarning = useCallback(
    (earning: ReferralEarning) => {
      const days = earning.days_granted ?? 0;
      const money = earning.amount_rubles ?? 0;
      const daysLabel = days
        ? earning.tariff_name
          ? t('referral.daysWithTariff', { count: days, tariff: earning.tariff_name })
          : t('referral.days', { count: days })
        : '';

      if (days && !money) return `+${daysLabel}`;
      if (days) return `${formatPositive(money)} + ${daysLabel}`;
      return formatPositive(money);
    },
    [formatPositive, t],
  );

  const programTerms = useMemo(() => {
    if (!terms) return null;

    // Под схемой `levels` плоские поля ниже не управляют ни одним начислением:
    // выплаты идут по таблице уровней. Показывать их как «условия программы»
    // значило бы обещать пользователю то, чего бот не платит.
    if (terms.scheme === 'levels') {
      return <ProgrammeTerms terms={terms} />;
    }

    const showNewUserBonus = terms.first_topup_bonus_kopeks > 0;
    const showInviterBonus = terms.inviter_bonus_kopeks > 0;
    // The bot omits the minimum when there is none: no «не число ₽» card.
    const showMinTopup =
      Number.isFinite(terms.minimum_topup_rubles) && terms.minimum_topup_rubles > 0;
    const cardCount =
      1 + (showMinTopup ? 1 : 0) + (showNewUserBonus ? 1 : 0) + (showInviterBonus ? 1 : 0);
    // Only the commission: it's already in the stats at the top.
    if (cardCount === 1) return null;
    const gridColsMap: Record<number, string> = {
      1: 'md:grid-cols-1',
      2: 'md:grid-cols-2',
      3: 'md:grid-cols-3',
      4: 'md:grid-cols-4',
    };
    const gridCols = gridColsMap[cardCount] ?? 'md:grid-cols-4';

    return (
      <div className="rd-card rd-card--lg flex flex-col gap-6">
        <h2 className="rd-h5 text-[var(--rd-heading)]">{t('referral.terms.title')}</h2>
        <div className={`grid grid-cols-2 gap-6 ${gridCols}`}>
          <Metric
            className="gap-3"
            label={t('referral.terms.commission')}
            value={`${terms.commission_percent}%`}
          />
          {showMinTopup && (
            <Metric
              className="gap-3"
              label={t('referral.terms.minTopup')}
              value={`${formatAmount(terms.minimum_topup_rubles, 0)}\u00A0${currencySymbol}`}
            />
          )}
          {showNewUserBonus && (
            <Metric
              className="gap-3"
              label={t('referral.terms.newUserBonus')}
              value={formatPositive(terms.first_topup_bonus_rubles)}
            />
          )}
          {showInviterBonus && (
            <Metric
              className="gap-3"
              label={t('referral.terms.inviterBonus')}
              value={formatPositive(terms.inviter_bonus_rubles)}
            />
          )}
        </div>
      </div>
    );
  }, [terms, t, formatAmount, formatPositive, currencySymbol]);

  const { openTelegramLink } = usePlatform();

  const shareLink = () => {
    if (!referralLink) return;
    // Under the levels scheme commission_percent governs nothing — payouts come
    // from the level table — so the invite must not name a rate. This text is what
    // the user forwards to a friend; a wrong number here is a promise made in their
    // name. The bot's own invite was fixed the same way.
    const botName = branding?.name || import.meta.env.VITE_APP_NAME || 'Cabinet';
    const shareText = isLevelsScheme
      ? terms?.referee_bonus_description
        ? t('referral.shareMessageBonus', { bonus: terms.referee_bonus_description, botName })
        : t('referral.shareMessagePlain', { botName })
      : t('referral.shareMessage', { percent: info?.commission_percent || 0, botName });

    if (navigator.share) {
      navigator
        .share({
          title: t('referral.title'),
          text: shareText,
          url: referralLink,
        })
        .catch(() => {});
      return;
    }

    const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(
      referralLink,
    )}&text=${encodeURIComponent(shareText)}`;
    openTelegramLink(telegramUrl);
  };

  if (isLoading) {
    return (
      <PageSkeleton titleWidth="w-40">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
          <div className="col-span-2 md:col-span-1">
            <StatCard loading />
          </div>
          <StatCard loading />
          <StatCard loading />
        </div>
        <Skeleton variant="card" className="h-48" />
      </PageSkeleton>
    );
  }

  // Show disabled state if referral program is disabled
  if (terms && !terms.is_enabled) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[var(--rd-field)]">
          <UsersIcon className="h-12 w-12 text-[var(--rd-caption)]" />
        </div>
        <div className="text-center">
          <h1 className="mb-2 text-2xl font-bold text-[var(--rd-heading)]">
            {t('referral.title')}
          </h1>
          <p className="text-[var(--rd-caption)]">{t('referral.disabled')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <h1 className="rd-h3 text-[var(--rd-heading)]">{t('referral.title')}</h1>

      <section className="rd-card rd-card--lg flex flex-col gap-8">
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          <Metric
            className="gap-3"
            label={t('postq.dashboard.invited')}
            value={info?.total_referrals || 0}
          />
          <Metric
            className="gap-3"
            label={t('referral.stats.activeReferrals')}
            value={info?.active_referrals || 0}
          />
          <Metric
            className="gap-3"
            label={t('postq.dashboard.earned')}
            value={`${formatAmount(info?.total_earnings_rubles || 0, Number.isInteger(info?.total_earnings_rubles || 0) ? 0 : 2)}\u00A0${currencySymbol}`}
          />
          <Metric
            className="gap-3"
            label={
              // В режиме «за приглашённых» глубины сети нет — показываем уровень.
              isTiersScheme
                ? t('referral.stats.yourLevel')
                : isLevelsScheme
                  ? t('referral.stats.chainDepth')
                  : t('referral.stats.commissionRate')
            }
            value={
              isTiersScheme
                ? (terms?.tier_current_level ?? null) === null
                  ? t('referral.stats.levelNotReached')
                  : String(terms?.tier_current_level)
                : isLevelsScheme
                  ? t('referral.stats.levelsValue', { count: terms?.max_level_depth || 1 })
                  : `${info?.commission_percent || 0}%`
            }
          />
        </div>
        {info?.total_earnings_days ? (
          <p className="rd-p-md -mt-4 text-[var(--rd-caption)]">
            {t('referral.stats.earnedDays', { count: info.total_earnings_days })}
          </p>
        ) : null}

        <div className="h-px w-full bg-[var(--rd-border)]" />

        <div className="flex flex-col gap-6 lg:flex-row">
          {botReferralLink && (
            <CopyField label={t('postq.dashboard.copyBotLink')} value={botReferralLink} />
          )}
          {referralLink && (
            <CopyField label={t('postq.dashboard.copySiteLink')} value={referralLink} />
          )}
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="rd-p-md text-[var(--rd-caption)]">
            {isLevelsScheme
              ? t('referral.shareHintLevels')
              : t('referral.shareHint', { percent: info?.commission_percent || 0 })}
          </p>
          <button
            type="button"
            onClick={shareLink}
            disabled={!referralLink}
            className="rd-btn-soft shrink-0 gap-2 disabled:opacity-50"
          >
            <ShareIcon className="h-4 w-4" />
            {t('referral.shareButton')}
          </button>
        </div>
      </section>

      {/* Program Terms */}
      {programTerms}

      {/* Reward Settings */}
      {terms && (
        <div className="empty:hidden">
          <RewardSettings
            terms={terms}
            pending={rewardChoiceMutation.isPending}
            onChange={(payload) => {
              setRewardChoiceError(null);
              rewardChoiceMutation.mutate(payload);
            }}
          />
          {/* Ошибка сохранения обязана быть видна: без неё нажатие выглядит
              принятым, а выбор остаётся прежним. */}
          {rewardChoiceError && (
            <p className="mt-2 rounded-[var(--rd-radius-sm)] border border-transparent bg-[var(--rd-error-bg)] p-3 rd-p-md text-[var(--rd-error-text)]">
              {rewardChoiceError}
            </p>
          )}
        </div>
      )}

      {/* Referrals List */}
      <div className="rd-card rd-card--lg">
        <h2 className="rd-h5 mb-6 text-[var(--rd-heading)]">{t('referral.yourReferrals')}</h2>
        {referralList?.items && referralList.items.length > 0 ? (
          <div className="space-y-3">
            {referralList.items.map((ref) => (
              <div
                key={ref.id}
                // Ник без пробелов выталкивал бейдж статуса за карточку.
                className="flex items-center justify-between gap-3 rounded-[var(--rd-radius-sm)] border border-[var(--rd-border)] bg-[var(--rd-field)] p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-[var(--rd-heading)] [overflow-wrap:anywhere]">
                    {ref.first_name || ref.username || t('referral.anonymousUser', { id: ref.id })}
                  </div>
                  <div className="mt-1 text-xs text-[var(--rd-caption)]">
                    {new Date(ref.created_at).toLocaleDateString(i18n.language)}
                  </div>
                </div>
                {ref.has_paid ? (
                  <span className="rd-p-md text-[var(--rd-success-text)] shrink-0">
                    {t('referral.status.paid')}
                  </span>
                ) : (
                  <span className="rd-p-md text-[var(--rd-caption)] shrink-0">
                    {t('referral.status.pending')}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="py-12 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[var(--rd-radius-control)] bg-[var(--rd-field)]">
              <UsersIcon className="h-8 w-8 text-[var(--rd-caption)]" />
            </div>
            <div className="text-[var(--rd-caption)]">{t('referral.noReferrals')}</div>
          </div>
        )}
      </div>

      {/* Earnings History */}
      {earnings?.items && earnings.items.length > 0 && (
        <div className="rd-card rd-card--lg">
          <h2 className="rd-h5 mb-6 text-[var(--rd-heading)]">{t('referral.earningsHistory')}</h2>
          <div className="space-y-3">
            {earnings.items.map((earning) => (
              <div
                key={earning.id}
                // Начисление бывает длинным («+1 234,56 ₽ + 90 дн. «Тариф»»): оно
                // занимает не больше половины строки и переносится, имя — остаток.
                className="flex items-start justify-between gap-3 rounded-[var(--rd-radius-sm)] border border-[var(--rd-border)] bg-[var(--rd-field)] p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[var(--rd-heading)] [overflow-wrap:anywhere]">
                    {earning.referral_first_name ||
                      earning.referral_username ||
                      t('referral.anonymousReferral')}
                  </div>
                  <div className="mt-1 text-xs text-[var(--rd-caption)]">
                    {t(`referral.reasons.${earning.reason}`, earning.reason)}
                    {(earning.level ?? 1) > 1 &&
                      ` • ${t('referral.levelBadge', { count: earning.level ?? 1 })}`}{' '}
                    • {new Date(earning.created_at).toLocaleDateString(i18n.language)}
                  </div>
                </div>
                <div className="min-w-0 max-w-[55%] text-right font-semibold text-[var(--rd-success-text)]">
                  {formatEarning(earning)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ==================== Partner Campaigns Section ==================== */}

      {terms?.partner_section_visible !== false &&
        isPartner &&
        partnerStatus?.campaigns &&
        partnerStatus.campaigns.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--rd-radius-sm)] bg-[var(--rd-help)] text-[var(--rd-action)]">
                <LinkIcon />
              </div>
              <h2 className="rd-h5 text-[var(--rd-heading)]">
                {t('referral.partner.yourCampaigns')}
              </h2>
            </div>

            {partnerStatus.campaigns.map((campaign) => (
              <CampaignCard key={campaign.id} campaign={campaign} />
            ))}
          </div>
        )}

      {/* Partner programme — last on the page; the application form unfolds
          right here (no separate screen, no withdrawals in postq). */}
      {terms?.partner_section_visible !== false && <PartnerSection status={partnerStatus} />}
    </div>
  );
}
