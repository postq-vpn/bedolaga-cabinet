import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi } from '../api/auth';
import { useAuthStore } from '../store/auth';
import { useToast } from '../components/Toast';
import Layout from '../components/layout/Layout';
import { BackIcon } from '@/components/icons';
import { Notice } from '@/components/postq/ui';
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton';
import { uiLocale } from '@/utils/uiLocale';
import { cn } from '@/lib/utils';
import type { MergeAccountPreview } from '../types';

/**
 * Account merge in the postq design. Reached from the profile when an email or
 * Telegram being linked already belongs to another account; returns to the
 * profile. The route is public (the preview needs only the token), so the
 * cabinet frame is added here when the visitor is signed in.
 */

const formatDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString(uiLocale(), {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '—';
const rub = (kopeks: number) => `${Math.floor(kopeks / 100).toLocaleString(uiLocale())}\u00A0₽`;
const countdown = (s: number) =>
  `${Math.floor(s / 60)
    .toString()
    .padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

export default function MergeAccounts() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const body = <MergeBody />;
  return isAuthenticated ? <Layout>{body}</Layout> : <div className="px-4 py-8">{body}</div>;
}

function MergeBody() {
  const { t } = useTranslation();
  const { mergeToken } = useParams<{ mergeToken: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<number | null>(null);
  const [left, setLeft] = useState(0);
  const [expired, setExpired] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['merge-preview', mergeToken],
    queryFn: () => authApi.getMergePreview(mergeToken ?? ''),
    enabled: !!mergeToken,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  // Pre-select when only one side (or neither) has a subscription.
  useEffect(() => {
    if (!data || selected !== null) return;
    const a = !!data.primary.subscription;
    const b = !!data.secondary.subscription;
    if (a && !b) setSelected(data.primary.id);
    else if (!a && b) setSelected(data.secondary.id);
    else if (!a && !b) setSelected(data.primary.id);
  }, [data, selected]);

  // Wall-clock countdown, so a backgrounded tab doesn't drift.
  useEffect(() => {
    if (!data) return;
    const start = Date.now();
    const tick = () => {
      const rest = data.expires_in_seconds - Math.floor((Date.now() - start) / 1000);
      if (rest <= 0) {
        setLeft(0);
        setExpired(true);
        clearInterval(id);
      } else setLeft(rest);
    };
    const id = setInterval(tick, 1000);
    tick();
    return () => clearInterval(id);
  }, [data]);

  const merge = useMutation({
    mutationFn: () => {
      if (!mergeToken || selected === null) return Promise.reject(new Error('Nothing to merge'));
      return authApi.executeMerge(mergeToken, selected);
    },
    onSuccess: async (res) => {
      if (!res.success || !res.access_token || !res.refresh_token) {
        showToast({ type: 'error', message: t('merge.error') });
        return;
      }
      const { setTokens, setUser, checkAdminStatus } = useAuthStore.getState();
      setTokens(res.access_token, res.refresh_token);
      if (res.user) setUser(res.user);
      try {
        await checkAdminStatus();
      } catch {
        // Checked again on the next navigation.
      }
      queryClient.clear();
      showToast({ type: 'success', message: t('merge.success') });
      navigate('/profile', { replace: true });
    },
    onError: () => showToast({ type: 'error', message: t('merge.error') }),
  });

  const back = (
    <Link
      to="/profile"
      replace
      className="rd-p-md flex items-center gap-2 self-start font-medium text-[var(--rd-caption)] transition-colors hover:text-[var(--rd-heading)]"
    >
      <BackIcon className="h-5 w-5" />
      {t('postq.merge.toProfile')}
    </Link>
  );
  const heading = (
    <div className="flex flex-col gap-3">
      <h1 className="rd-h3 text-[var(--rd-heading)]">{t('merge.title')}</h1>
      <p className="rd-p-lg text-[var(--rd-caption)]">{t('merge.description')}</p>
    </div>
  );

  if (!mergeToken || isLoading || error || !data || expired) {
    return (
      <div className="flex flex-col gap-8 pb-6 lg:max-w-[880px]">
        {back}
        {heading}
        {isLoading ? (
          <SkeletonGroup className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Skeleton className="h-80 rounded-[var(--rd-radius-md)]" />
            <Skeleton className="h-80 rounded-[var(--rd-radius-md)]" />
          </SkeletonGroup>
        ) : (
          <Notice
            tone={expired ? 'warning' : 'error'}
            title={expired ? t('merge.expired') : t('merge.error')}
            text={t('postq.merge.retryHint')}
          />
        )}
      </div>
    );
  }

  const both = !!data.primary.subscription && !!data.secondary.subscription;
  const canConfirm = selected !== null && !merge.isPending;
  const after = [
    t('merge.allAuthMethodsMerged'),
    t('merge.balanceSummed', {
      amount: Math.floor(
        (data.primary.balance_kopeks + data.secondary.balance_kopeks) / 100,
      ).toLocaleString(uiLocale()),
    }),
    t('merge.historyPreserved'),
  ];

  return (
    <div className="flex flex-col gap-8 pb-6 lg:max-w-[880px]">
      {back}
      {heading}

      {both && (
        <p className="rd-p-lg font-medium text-[var(--rd-heading)]">
          {t('merge.chooseSubscription')}
        </p>
      )}

      <div
        role={both ? 'radiogroup' : undefined}
        aria-label={both ? t('merge.chooseSubscription') : undefined}
        className="grid grid-cols-1 gap-6 md:grid-cols-2"
      >
        <AccountCard
          label={t('merge.currentAccount')}
          account={data.primary}
          selectable={both}
          selected={selected === data.primary.id}
          onSelect={() => setSelected(data.primary.id)}
        />
        <AccountCard
          label={t('merge.foundAccount')}
          account={data.secondary}
          selectable={both}
          selected={selected === data.secondary.id}
          onSelect={() => setSelected(data.secondary.id)}
        />
      </div>

      <section className="rd-card rd-card--lg flex flex-col gap-4">
        <h2 className="rd-h6 text-[var(--rd-heading)]">{t('merge.afterMerge')}</h2>
        <ul className="rd-p-md flex flex-col gap-2 text-[var(--rd-body)]">
          {after.map((line) => (
            <li key={line}>{line}</li>
          ))}
          {both && (
            <li className="text-[var(--rd-error-text)]">
              {t('merge.unselectedSubscriptionDeleted')}
            </li>
          )}
        </ul>
      </section>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={() => canConfirm && merge.mutate()}
          disabled={!canConfirm}
          className="rd-btn w-full sm:w-auto"
        >
          {merge.isPending ? t('merge.merging') : t('merge.confirm')}
        </button>
        <Link to="/profile" replace className="rd-p-md rd-link self-center px-6 py-2 font-medium">
          {t('merge.cancel')}
        </Link>
        <span className="rd-p-md self-center text-[var(--rd-caption)] sm:ml-auto">
          {t('merge.expiresIn', { minutes: countdown(left) })}
        </span>
      </div>
    </div>
  );
}

function AccountCard({
  label,
  account,
  selectable,
  selected,
  onSelect,
}: {
  label: string;
  account: MergeAccountPreview;
  selectable: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const sub = account.subscription;
  const who = account.email || (account.username ? `@${account.username}` : account.first_name);

  const rows: Array<[string, string]> = [
    [
      t('merge.authMethods'),
      account.auth_methods.map((m) => t(`profile.accounts.providers.${m}`)).join(', ') || '—',
    ],
    [
      t('merge.subscription'),
      sub
        ? `${sub.tariff_name ?? sub.status}${sub.end_date ? `, ${t('merge.until', { date: formatDate(sub.end_date) })}` : ''}`
        : t('merge.noSubscription'),
    ],
    ...(sub
      ? ([
          [
            t('merge.traffic'),
            // 0 GB from the panel means unlimited, not «no traffic».
            sub.traffic_limit_gb > 0
              ? `${sub.traffic_limit_gb} ${t('common.units.gb')}`
              : t('subscription.unlimited'),
          ],
          [t('merge.devices'), String(sub.device_limit)],
        ] as Array<[string, string]>)
      : []),
    [t('merge.balance'), rub(account.balance_kopeks)],
  ];

  const content = (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="rd-p-md text-[var(--rd-caption)]">{label}</span>
          {who && <span className="rd-h6 truncate text-[var(--rd-heading)]">{who}</span>}
        </div>
        {selectable && (
          <span
            aria-hidden
            className={cn(
              'mt-1 flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
              selected
                ? 'border-[var(--rd-action)] bg-[var(--rd-action)]'
                : 'border-[var(--rd-placeholder)]',
            )}
          >
            {selected && <span className="size-2 rounded-full bg-[var(--rd-on-action)]" />}
          </span>
        )}
      </div>
      <dl className="rd-p-md flex flex-col gap-3">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4">
            <dt className="shrink-0 text-[var(--rd-caption)]">{k}</dt>
            <dd className="text-right text-[var(--rd-heading)]">{v}</dd>
          </div>
        ))}
      </dl>
      {selectable && (
        <span
          className={cn(
            'rd-p-md',
            selected ? 'text-[var(--rd-action)]' : 'text-[var(--rd-caption)]',
          )}
        >
          {t('merge.keepThisSubscription')}
        </span>
      )}
    </>
  );

  const cls = 'rd-card rd-card--lg flex flex-col gap-6 text-left';
  return selectable ? (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        cls,
        'transition-shadow',
        selected && 'shadow-[inset_0_0_0_2px_var(--rd-action)]',
      )}
    >
      {content}
    </button>
  ) : (
    <section className={cls}>{content}</section>
  );
}
