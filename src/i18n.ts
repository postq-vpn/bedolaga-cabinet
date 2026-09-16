import i18n, { type ResourceLanguage } from 'i18next';
import { initReactI18next } from 'react-i18next';

const localeLoaders: Record<string, () => Promise<{ default: ResourceLanguage }>> = {
  ru: () => import('./locales/ru.json'),
  en: () => import('./locales/en.json'),
  zh: () => import('./locales/zh.json'),
  fa: () => import('./locales/fa.json'),
};

const SUPPORTED_LANGS = Object.keys(localeLoaders);
const FALLBACK_LNG = 'ru';
const LANGUAGE_STORAGE_KEY = 'cabinet_language';

const loadedLanguages = new Set<string>();

async function loadLanguage(lng: string): Promise<void> {
  if (loadedLanguages.has(lng)) return;

  const loader = localeLoaders[lng];
  if (!loader) return;

  const mod = await loader();
  i18n.addResourceBundle(lng, 'translation', mod.default, true, true);
  loadedLanguages.add(lng);
}

// The cabinet must always default to Russian, regardless of device/browser
// language or Telegram client language. It never auto-detects — the only way
// to change language is the explicit LanguageSwitcher, whose choice is cached
// below so it survives reloads.
function getStoredLanguage(): string | null {
  try {
    const code = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return code && SUPPORTED_LANGS.includes(code) ? code : null;
  } catch {
    return null;
  }
}

i18n.use(initReactI18next).init({
  lng: getStoredLanguage() || FALLBACK_LNG,
  fallbackLng: FALLBACK_LNG,
  supportedLngs: SUPPORTED_LANGS,
  partialBundledLanguages: true,

  interpolation: {
    escapeValue: false,
  },

  react: {
    useSuspense: false,
  },

  showSupportNotice: false,
});

// Load the active language + fallback on startup
const activeLng = i18n.language?.split('-')[0] || FALLBACK_LNG;
const langsToLoad = [FALLBACK_LNG, ...(activeLng !== FALLBACK_LNG ? [activeLng] : [])];

// Сколько ждать словари, прежде чем рисовать без них. Белый экран хуже
// непереведённого текста: если чанк локали не приехал (сеть отвалилась, прокси
// отдал 502), приложение обязано появиться.
const READY_TIMEOUT_MS = 5000;

/**
 * Резолвится, когда словари активного языка зарегистрированы в i18next.
 *
 * Локали лежат в отдельных ленивых чанках (~75 КБ gzip), а `useSuspense`
 * выключен — значит react-i18next не приостановит отрисовку и `t('auth.login')`
 * вернёт сам ключ. С прогретым кэшем чанк приходил раньше первой отрисовки и
 * этого не было видно; на холодном интерфейс успевал нарисоваться с сырыми
 * ключами. Точка входа ждёт этот промис перед `createRoot().render()`.
 *
 * Никогда не реджектится и не висит дольше READY_TIMEOUT_MS.
 */
export const i18nReady: Promise<void> = Promise.race([
  Promise.all(langsToLoad.map(loadLanguage)).then(() => undefined),
  new Promise<void>((resolve) => setTimeout(resolve, READY_TIMEOUT_MS)),
]).catch(() => undefined);

// Keep <html lang> + dir in sync with i18n so screen readers pronounce
// content correctly, browsers don't offer to translate it, and RTL
// languages (fa) flip layout direction. index.html ships with lang="ru"
// for the first paint; runtime updates take over from there.
const RTL_LANGS = new Set(['fa', 'ar', 'he', 'ur']);
function syncHtmlLang(lng: string): void {
  const code = lng.split('-')[0];
  if (typeof document === 'undefined') return;
  if (document.documentElement.lang !== code) {
    document.documentElement.lang = code;
  }
  const dir = RTL_LANGS.has(code) ? 'rtl' : 'ltr';
  if (document.documentElement.dir !== dir) {
    document.documentElement.dir = dir;
  }
}
syncHtmlLang(activeLng);

// Lazy-load on language change, and persist explicit user choices so they
// survive reloads (there is no auto-detection to fall back on otherwise).
i18n.on('languageChanged', (lng: string) => {
  const code = lng.split('-')[0];
  loadLanguage(code);
  syncHtmlLang(code);
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, code);
  } catch {
    // ignore (e.g. storage disabled)
  }
});

export default i18n;
