import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { infoApi } from '@/api/info';
import { infoPagesApi, type FaqItem, type ReplacesTab } from '@/api/infoPages';
import { promoApi, type LoyaltyTiersResponse } from '@/api/promo';
import { formatContent } from '@/utils/legalContent';
import { sanitizeRichHtml } from '@/utils/richContent';
import { uiLocale } from '@/utils/uiLocale';
import { cn } from '@/lib/utils';
import { RdIcon } from '../RdIcon';
import { ProgressTrack } from '../ui';
import { RdDialog } from '../RdDialog';

/**
 * «Документы и помощь» in the profile — what the separate Info page used to
 * hold (FAQ, rules, privacy, offer, loyalty statuses, the admin's own pages).
 * Plain rows like the «ещё» card; a row opens its text in a dialog.
 *
 * Same visibility rules as the Info page: a built-in section shows when the
 * admin left it visible or replaced it with an own page; the admin's extra
 * pages follow; statuses only when loyalty tiers are configured.
 */

type BuiltIn = 'faq' | 'rules' | 'privacy' | 'offer';
type Section =
  | { kind: BuiltIn; label: string; slug: string | null }
  | { kind: 'loyalty'; label: string }
  | { kind: 'page'; label: string; slug: string };

const BUILTIN_IDS = new Set(['faq', 'rules', 'privacy', 'offer', 'loyalty']);

function useLocaleCode() {
  const { i18n } = useTranslation();
  return i18n.language.split('-')[0];
}

const pick = (texts: Record<string, string>, locale: string) =>
  texts[locale] || texts.ru || texts.en || '';

export function InfoCard() {
  const { t } = useTranslation();
  const locale = useLocaleCode();
  const [open, setOpen] = useState<Section | null>(null);

  const { data: replacements } = useQuery({
    queryKey: ['info-pages', 'tab-replacements'],
    queryFn: infoPagesApi.getTabReplacements,
    staleTime: 60_000,
  });
  const { data: pages } = useQuery({
    queryKey: ['info-pages', 'list'],
    queryFn: () => infoPagesApi.getPages(),
    staleTime: 60_000,
  });
  const { data: visibility } = useQuery({
    queryKey: ['info-visibility'],
    queryFn: infoApi.getVisibility,
    staleTime: 60_000,
  });
  const { data: loyalty } = useQuery({
    queryKey: ['loyalty-tiers'],
    queryFn: promoApi.getLoyaltyTiers,
    staleTime: 60_000,
  });

  const sections = useMemo<Section[]>(() => {
    const builtIn: Array<{ kind: BuiltIn; label: string }> = [
      { kind: 'faq', label: t('postq.info.faq') },
      { kind: 'rules', label: t('postq.info.rules') },
      { kind: 'privacy', label: t('postq.info.privacy') },
      { kind: 'offer', label: t('postq.info.offer') },
    ];
    const list: Section[] = builtIn
      .map((s) => ({ ...s, slug: replacements?.[s.kind as ReplacesTab] ?? null }))
      .filter((s) => s.slug || !visibility || visibility[s.kind]);
    if (loyalty?.tiers.length) list.push({ kind: 'loyalty', label: t('postq.info.loyalty') });
    for (const p of pages ?? []) {
      if (p.replaces_tab || BUILTIN_IDS.has(p.slug)) continue;
      list.push({ kind: 'page', label: pick(p.title, locale) || p.slug, slug: p.slug });
    }
    return list;
  }, [replacements, visibility, loyalty, pages, locale, t]);

  if (!sections.length) return null;

  return (
    <section className="rd-card rd-card--lg flex flex-col gap-2">
      <h2 className="rd-h6 text-[var(--rd-heading)]">{t('postq.info.title')}</h2>
      <div className="flex flex-col">
        {sections.map((s, i) => (
          <button
            key={s.kind + ('slug' in s ? (s.slug ?? '') : '')}
            type="button"
            onClick={() => setOpen(s)}
            className={cn(
              'rd-p-lg flex min-h-14 items-center justify-between gap-4 py-4 text-left text-[var(--rd-heading)] transition-colors hover:text-[var(--rd-action)]',
              i < sections.length - 1 && 'border-b border-[var(--rd-divider)]',
            )}
          >
            {s.label}
            <RdIcon
              name="cabinet/chevron-up"
              size={20}
              className="shrink-0 rotate-90 text-[var(--rd-caption)]"
            />
          </button>
        ))}
      </div>
      <InfoDialog section={open} onClose={() => setOpen(null)} />
    </section>
  );
}

function InfoDialog({ section, onClose }: { section: Section | null; onClose: () => void }) {
  return (
    <RdDialog open={!!section} onOpenChange={(o) => !o && onClose()} title={section?.label} wide>
      {section && <SectionBody section={section} />}
    </RdDialog>
  );
}

function SectionBody({ section }: { section: Section }) {
  if (section.kind === 'loyalty') return <LoyaltyBody />;
  if (section.slug) return <PageBody slug={section.slug} />;
  if (section.kind === 'faq') return <FaqBody />;
  return <DocumentBody kind={section.kind as Exclude<BuiltIn, 'faq'>} />;
}

function Loading() {
  const { t } = useTranslation();
  return <p className="rd-p-md text-[var(--rd-caption)]">{t('common.loading')}</p>;
}

function Empty({ text }: { text: string }) {
  return <p className="rd-p-md text-[var(--rd-caption)]">{text}</p>;
}

/** Built-in rules / privacy / offer. */
function DocumentBody({ kind }: { kind: 'rules' | 'privacy' | 'offer' }) {
  const { t } = useTranslation();
  const locale = useLocaleCode();
  const fetchers = {
    rules: infoApi.getRules,
    privacy: infoApi.getPrivacyPolicy,
    offer: infoApi.getPublicOffer,
  };
  const { data, isLoading, isError } = useQuery({
    queryKey: [
      kind === 'privacy' ? 'privacy-policy' : kind === 'offer' ? 'public-offer' : kind,
      locale,
    ],
    queryFn: () => fetchers[kind](locale),
  });
  if (isLoading) return <Loading />;
  if (isError || !data?.content) return <Empty text={t('info.documentUnavailable')} />;
  return (
    <div className="flex flex-col gap-4">
      <div className="rd-prose" dangerouslySetInnerHTML={{ __html: formatContent(data.content) }} />
      {data.updated_at && (
        <p className="rd-p-sm text-[var(--rd-caption)]">
          {t('info.updatedAt')}: {new Date(data.updated_at).toLocaleDateString(uiLocale())}
        </p>
      )}
    </div>
  );
}

/** Built-in FAQ: question rows that open their answer. */
function FaqBody() {
  const { t } = useTranslation();
  const locale = useLocaleCode();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['faq-pages', locale],
    queryFn: () => infoApi.getFaqPages(locale),
  });
  if (isLoading) return <Loading />;
  if (isError || !data?.length) return <Empty text={t('info.noFaq')} />;
  return (
    <FaqList
      items={data.map((f) => ({ key: String(f.id), q: f.title, html: formatContent(f.content) }))}
    />
  );
}

/** The admin's own page (also when it replaces a built-in section). */
function PageBody({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const locale = useLocaleCode();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['info-pages', 'page', slug],
    queryFn: () => infoPagesApi.getPageBySlug(slug),
    staleTime: 60_000,
  });
  if (isLoading) return <Loading />;
  if (isError || !data) return <Empty text={t('info.noContent')} />;
  const raw = pick(data.content, locale);
  if (data.page_type === 'faq') {
    let items: FaqItem[] = [];
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw;
      items = Array.isArray(parsed) ? parsed : [];
    } catch {
      items = [];
    }
    if (!items.length) return <Empty text={t('info.noFaq')} />;
    return (
      <FaqList
        items={items.map((it, i) => ({ key: String(i), q: it.q, html: sanitizeRichHtml(it.a) }))}
      />
    );
  }
  const html = sanitizeRichHtml(raw);
  if (!html) return <Empty text={t('info.noContent')} />;
  return <div className="rd-prose" dangerouslySetInnerHTML={{ __html: html }} />;
}

function FaqList({ items }: { items: Array<{ key: string; q: string; html: string }> }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  return (
    <div className="flex flex-col">
      {items.map((it, i) => {
        const isOpen = openKey === it.key;
        return (
          <div
            key={it.key}
            className={cn(i < items.length - 1 && 'border-b border-[var(--rd-divider)]')}
          >
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpenKey(isOpen ? null : it.key)}
              className="rd-p-lg flex w-full items-center justify-between gap-4 py-4 text-left font-medium text-[var(--rd-heading)]"
            >
              {it.q}
              <RdIcon
                name="cabinet/chevron-up"
                size={20}
                className={cn(
                  'shrink-0 text-[var(--rd-caption)] transition-transform',
                  !isOpen && 'rotate-180',
                )}
              />
            </button>
            {isOpen && (
              <div className="rd-prose pb-4" dangerouslySetInnerHTML={{ __html: it.html }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function LoyaltyBody() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery<LoyaltyTiersResponse>({
    queryKey: ['loyalty-tiers'],
    queryFn: promoApi.getLoyaltyTiers,
  });
  if (isLoading) return <Loading />;
  if (!data?.tiers.length) return <Empty text={t('info.noLoyaltyTiers')} />;
  const rub = (v: number) => `${Math.round(v).toLocaleString(uiLocale())}\u00A0₽`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 rounded-[var(--rd-radius-sm)] bg-[var(--rd-field)] p-6">
        <dl className="rd-p-md grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <dt className="text-[var(--rd-caption)]">{t('info.currentStatus')}</dt>
            <dd className="rd-p-lg font-medium text-[var(--rd-heading)]">
              {data.current_tier_name || '—'}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-[var(--rd-caption)]">{t('info.totalSpent')}</dt>
            <dd className="rd-p-lg font-medium text-[var(--rd-heading)]">
              {rub(data.current_spent_rubles)}
            </dd>
          </div>
        </dl>
        {data.next_tier_name && data.next_tier_threshold_rubles ? (
          <div className="flex flex-col gap-2">
            <ProgressTrack percent={data.progress_percent} label={t('info.yourProgress')} />
            <p className="rd-p-md text-[var(--rd-caption)]">
              {t('info.nextStatus')}: {data.next_tier_name} · {t('info.toNextStatus')}{' '}
              {rub(Math.max(0, data.next_tier_threshold_rubles - data.current_spent_rubles))}
            </p>
          </div>
        ) : (
          <p className="rd-p-md text-[var(--rd-caption)]">{t('info.allStatusesAchieved')}</p>
        )}
      </div>

      <ul className="flex flex-col">
        {data.tiers.map((tier, i) => {
          const discounts = [
            tier.server_discount_percent > 0 &&
              `${t('info.serverDiscount')} −${tier.server_discount_percent}%`,
            tier.traffic_discount_percent > 0 &&
              `${t('info.trafficDiscount')} −${tier.traffic_discount_percent}%`,
            tier.device_discount_percent > 0 &&
              `${t('info.deviceDiscount')} −${tier.device_discount_percent}%`,
            ...Object.entries(tier.period_discounts ?? {})
              .filter(([, v]) => v > 0)
              .map(([days, v]) => `${t('info.periodDiscount', { days })} −${v}%`),
          ].filter(Boolean) as string[];
          return (
            <li
              key={tier.id}
              className={cn(
                'flex flex-col gap-1 py-4',
                i < data.tiers.length - 1 && 'border-b border-[var(--rd-divider)]',
              )}
            >
              <div className="flex items-baseline justify-between gap-4">
                <span
                  className={cn(
                    'rd-p-lg font-medium',
                    tier.is_achieved ? 'text-[var(--rd-heading)]' : 'text-[var(--rd-caption)]',
                  )}
                >
                  {tier.name}
                </span>
                <span className="rd-p-md shrink-0 text-[var(--rd-caption)]">
                  {tier.is_current
                    ? t('info.statusCurrent')
                    : tier.is_achieved
                      ? t('info.statusAchieved')
                      : `${t('info.threshold')} ${rub(tier.threshold_rubles)}`}
                </span>
              </div>
              <p className="rd-p-md text-[var(--rd-caption)]">
                {discounts.length ? discounts.join(' · ') : t('info.noDiscounts')}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
