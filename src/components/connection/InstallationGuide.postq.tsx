import { useState, useMemo, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import DOMPurify from 'dompurify';
import type {
  AppConfig,
  LocalizedText,
  RemnawaveAppClient,
  RemnawavePlatformData,
  RemnawaveButtonClient,
} from '@/types';
import { useTheme } from '@/hooks/useTheme';
import { BlockButtons } from './blocks';
import type { RenderBlock } from './blocks';
import { PostqStepsBlock } from './blocks/PostqStepsBlock';
import { CopyField } from '@/components/postq/ui';
import { RdIcon } from '@/components/postq/RdIcon';
import TvQuickConnect from './TvQuickConnect';
import { BackIcon } from '@/components/icons';

const platformOrder = ['ios', 'android', 'windows', 'macos', 'linux', 'androidTV', 'appleTV'];

function detectPlatform(): string | null {
  if (typeof window === 'undefined' || !navigator?.userAgent) return null;
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return /tv|television/.test(ua) ? 'androidTV' : 'android';
  if (/macintosh|mac os x/.test(ua)) return 'macos';
  if (/windows/.test(ua)) return 'windows';
  if (/linux/.test(ua)) return 'linux';
  return null;
}

/** TV quick-connect is a Happ-only feature (check.happ.su/sendtv) — show it only
 *  for the Happ app, detected by its happ:// deep-link scheme (name as fallback). */
function isHappApp(app: RemnawaveAppClient | null): boolean {
  if (!app) return false;
  if ((app.deepLink ?? '').toLowerCase().startsWith('happ://')) return true;
  return app.name.toLowerCase().includes('happ');
}

interface Props {
  appConfig: AppConfig;
  onOpenDeepLink: (url: string) => void;
  isTelegramWebApp: boolean;
  onGoBack: () => void;
  onOpenQR?: () => void;
  username?: string;
}

export default function InstallationGuide({
  appConfig,
  onOpenDeepLink,
  isTelegramWebApp,
  onGoBack,
  onOpenQR,
  username,
}: Props) {
  const { t, i18n } = useTranslation();
  const { isLight } = useTheme();

  const detectedPlatform = useMemo(() => detectPlatform(), []);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  const [activePlatformKey, setActivePlatformKey] = useState<string | null>(null);
  const [selectedApp, setSelectedApp] = useState<RemnawaveAppClient | null>(null);

  const getLocalizedText = useCallback(
    (text: LocalizedText | undefined): string => {
      if (!text) return '';
      const lang = i18n.language || 'en';
      return text[lang] || text['en'] || text['ru'] || Object.values(text)[0] || '';
    },
    [i18n.language],
  );

  const getBaseTranslation = useCallback(
    (key: string, i18nKey: string): string => {
      const bt = appConfig.baseTranslations;
      if (bt && key in bt) {
        const text = getLocalizedText(bt[key as keyof typeof bt] as LocalizedText);
        if (text) return text;
      }
      return t(i18nKey);
    },
    [appConfig.baseTranslations, getLocalizedText, t],
  );

  const getSvgHtml = useCallback(
    (svgKey: string | undefined): string => {
      if (!svgKey || !appConfig.svgLibrary?.[svgKey]) return '';
      const entry = appConfig.svgLibrary[svgKey];
      const raw = typeof entry === 'string' ? entry : entry.svgString;
      if (!raw) return '';
      return DOMPurify.sanitize(raw, { USE_PROFILES: { svg: true, svgFilters: true } });
    },
    [appConfig.svgLibrary],
  );

  const availablePlatforms = useMemo(() => {
    if (!appConfig.platforms) return [];
    const available = platformOrder.filter((key) => {
      const data = appConfig.platforms[key] as RemnawavePlatformData | undefined;
      return data && data.apps && data.apps.length > 0;
    });
    if (detectedPlatform && available.includes(detectedPlatform)) {
      return [detectedPlatform, ...available.filter((p) => p !== detectedPlatform)];
    }
    return available;
  }, [appConfig.platforms, detectedPlatform]);

  useEffect(() => {
    if (selectedApp || !availablePlatforms.length) return;
    const platform = availablePlatforms[0];
    const data = appConfig.platforms[platform] as RemnawavePlatformData | undefined;
    if (!data?.apps?.length) return;
    const app = data.apps.find((a) => a.featured) || data.apps[0];
    if (app) {
      setSelectedApp(app);
      setActivePlatformKey(platform);
    }
  }, [appConfig.platforms, availablePlatforms, selectedApp]);

  const renderBlockButtons = useCallback(
    (buttons: RemnawaveButtonClient[] | undefined, variant: 'light' | 'subtle') => (
      <BlockButtons
        buttons={buttons}
        variant={variant}
        isLight={isLight}
        subscriptionUrl={appConfig.subscriptionUrl}
        hideLink={appConfig.hideLink}
        deepLink={selectedApp?.deepLink}
        username={username}
        getLocalizedText={getLocalizedText}
        getBaseTranslation={getBaseTranslation}
        getSvgHtml={getSvgHtml}
        onOpenDeepLink={onOpenDeepLink}
      />
    ),
    [
      appConfig.subscriptionUrl,
      appConfig.hideLink,
      selectedApp?.deepLink,
      username,
      isLight,
      getLocalizedText,
      getBaseTranslation,
      getSvgHtml,
      onOpenDeepLink,
    ],
  );

  const userIsOnTv = detectedPlatform === 'androidTV' || detectedPlatform === 'appleTV';
  // Happ's TV quick-connect (check.happ.su/sendtv) is ONE API serving BOTH
  // Android TV and Apple TV — show the widget on either.
  const selectedPlatform = activePlatformKey || availablePlatforms[0];
  const isTvLayout =
    (selectedPlatform === 'androidTV' || selectedPlatform === 'appleTV') && !userIsOnTv;

  const currentPlatformKey = activePlatformKey || availablePlatforms[0];
  const currentPlatformData = currentPlatformKey
    ? (appConfig.platforms[currentPlatformKey] as RemnawavePlatformData | undefined)
    : undefined;
  const currentPlatformApps = currentPlatformData?.apps || [];

  // Platform display name
  const getPlatformDisplayName = useCallback(
    (key: string): string => {
      const data = appConfig.platforms[key] as RemnawavePlatformData | undefined;
      if (data?.displayName) {
        const name = getLocalizedText(data.displayName);
        if (name) return name;
      }
      if (appConfig.platformNames?.[key]) {
        return getLocalizedText(appConfig.platformNames[key]);
      }
      const fallback: Record<string, string> = {
        ios: 'iOS',
        android: 'Android',
        windows: 'Windows',
        macos: 'macOS',
        linux: 'Linux',
        androidTV: 'Android TV',
        appleTV: 'Apple TV',
      };
      return fallback[key] || key;
    },
    [appConfig.platforms, appConfig.platformNames, getLocalizedText],
  );

  // postq: one step style (PostqStepsBlock) instead of the panel's block types.

  // For the Happ TV app (Android TV / Apple TV), inject the TV connect widget as
  // customNode so it renders THROUGH the active block style (cards/timeline/
  // accordion/minimal) instead of as separate clashing cards that break it.
  const showTvConnect = Boolean(
    selectedApp && isTvLayout && isHappApp(selectedApp) && appConfig.subscriptionUrl,
  );
  let renderBlocks: RenderBlock[] = selectedApp?.blocks ?? [];
  if (selectedApp && showTvConnect && appConfig.subscriptionUrl) {
    // install → add-subscription → connect: attach to the add step (index 1);
    // fall back to the last block for shorter configs.
    const idx = selectedApp.blocks.length >= 3 ? 1 : Math.max(0, selectedApp.blocks.length - 1);
    const widget = <TvQuickConnect subscriptionUrl={appConfig.subscriptionUrl} isLight={isLight} />;
    renderBlocks = selectedApp.blocks.map((b, i) => (i === idx ? { ...b, customNode: widget } : b));
  }

  const selectPlatform = (p: string) => {
    setActivePlatformKey(p);
    const data = appConfig.platforms[p] as RemnawavePlatformData | undefined;
    if (data?.apps?.length) {
      // Keep the current app if the new platform has it too.
      const app =
        data.apps.find((a) => a.name === selectedApp?.name) ||
        data.apps.find((a) => a.featured) ||
        data.apps[0];
      if (app) setSelectedApp(app);
    }
  };

  // Text tabs with an underline. The row draws its 1px rule as an inset shadow
  // so the tabs' 2px underline sits on it without overflowing (no scrollbar).
  const tab = (selected: boolean) =>
    `rd-p-md shrink-0 whitespace-nowrap border-b-2 pb-4 transition-colors ${
      selected
        ? 'border-[var(--rd-action)] font-medium text-[var(--rd-heading)]'
        : 'border-transparent text-[var(--rd-caption)] hover:text-[var(--rd-heading)]'
    }`;

  const showTabs = availablePlatforms.length > 1;
  const showApps = currentPlatformApps.length > 1;
  const showManual = Boolean(appConfig.subscriptionUrl && (!appConfig.hideLink || onOpenQR));
  const tutorialUrl = appConfig.baseSettings?.isShowTutorialButton
    ? appConfig.baseSettings?.tutorialUrl
    : undefined;

  return (
    <div className="flex flex-col gap-8 pb-6">
      {!isTelegramWebApp && (
        <button
          type="button"
          onClick={onGoBack}
          className="rd-p-md flex items-center gap-2 self-start font-medium text-[var(--rd-caption)] transition-colors hover:text-[var(--rd-heading)]"
        >
          <BackIcon className="h-5 w-5" />
          {t('postq.purchase.toCabinet')}
        </button>
      )}
      <div className="flex flex-col gap-3">
        <h1 className="rd-h3 text-[var(--rd-heading)]">
          {getBaseTranslation('installationGuideHeader', 'subscription.connection.title')}
        </h1>
        <p className="rd-p-lg text-[var(--rd-caption)]">{t('postq.connection.subtitle')}</p>
      </div>

      <div
        className={`grid grid-cols-1 gap-6 lg:items-start ${
          showManual ? 'lg:grid-cols-[minmax(0,1fr)_400px]' : 'lg:max-w-[880px]'
        }`}
      >
        <section className="rd-card rd-card--lg flex min-w-0 flex-col gap-8">
          {showTabs && (
            <div
              role="tablist"
              aria-label={t('postq.connection.device')}
              className="-mx-6 flex gap-8 overflow-x-auto px-6 shadow-[inset_0_-1px_0_var(--rd-border)] [scrollbar-width:none] md:-mx-8 md:px-8 [&::-webkit-scrollbar]:hidden"
            >
              {availablePlatforms.map((p) => {
                const selected = p === currentPlatformKey;
                return (
                  <button
                    key={p}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => selectPlatform(p)}
                    className={tab(selected)}
                  >
                    {getPlatformDisplayName(p)}
                  </button>
                );
              })}
            </div>
          )}

          {showApps && (
            <div className="flex flex-col gap-3">
              <span className="rd-p-md text-[var(--rd-caption)]">{t('postq.connection.app')}</span>
              <div role="radiogroup" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {currentPlatformApps.map((app, idx) => {
                  const selected = selectedApp?.name === app.name;
                  return (
                    <button
                      key={app.name + idx}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setSelectedApp(app)}
                      title={app.featured ? t('postq.connection.recommended') : undefined}
                      className={`rd-p-md relative flex h-16 items-center rounded-[var(--rd-radius-sm)] px-4 text-left transition-colors ${
                        selected
                          ? 'bg-[var(--rd-heading)] font-medium text-[var(--rd-surface)]'
                          : 'bg-[var(--rd-chip)] text-[var(--rd-heading)] hover:bg-[var(--rd-chip-hover)]'
                      }`}
                    >
                      <span className="min-w-0 truncate">{app.name}</span>
                      {app.featured && (
                        <>
                          {/* Sticks out of the tile's corner a little. */}
                          <RdIcon
                            name="cabinet/star"
                            size={20}
                            className="pointer-events-none absolute -right-2 -top-2 text-[var(--rd-action)]"
                          />
                          <span className="sr-only">{t('postq.connection.recommended')}</span>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* For the Happ Android TV app the TV connect widget is injected into a step. */}
          {selectedApp && (
            <div className="[&>ol>li:first-child]:pt-0">
              <PostqStepsBlock
                blocks={renderBlocks}
                isMobile={isMobile}
                isLight={isLight}
                getLocalizedText={getLocalizedText}
                getSvgHtml={getSvgHtml}
                renderBlockButtons={renderBlockButtons}
              />
            </div>
          )}
        </section>

        {showManual && (
          <section className="rd-card rd-card--lg flex min-w-0 flex-col gap-6">
            <div className="flex flex-col gap-1">
              <h2 className="rd-p-lg font-medium text-[var(--rd-heading)]">
                {t('postq.connection.manualTitle')}
              </h2>
              <p className="rd-p-md text-[var(--rd-caption)]">
                {appConfig.hideLink
                  ? t('postq.connection.manualHintQr')
                  : t('postq.connection.manualHint')}
              </p>
            </div>
            {!appConfig.hideLink && appConfig.subscriptionUrl && (
              <CopyField label={t('postq.connection.link')} value={appConfig.subscriptionUrl} />
            )}
            {(onOpenQR || tutorialUrl) && (
              <div className="flex flex-wrap gap-x-8 gap-y-3">
                {onOpenQR && (
                  <button
                    type="button"
                    onClick={() => onOpenQR()}
                    className="rd-p-md rd-link-action font-medium"
                  >
                    {t('postq.connection.qr')}
                  </button>
                )}
                {tutorialUrl && (
                  <a
                    href={tutorialUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rd-p-md rd-link font-medium"
                  >
                    {getBaseTranslation('tutorial', 'subscription.connection.tutorial')}
                  </a>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
