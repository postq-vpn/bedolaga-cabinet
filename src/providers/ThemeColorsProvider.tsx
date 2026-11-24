import { useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { themeColorsQueryOptions } from '../api/themeColors';
import { DEFAULT_THEME_COLORS } from '../types/theme';
import { applyThemeColors } from '../hooks/useThemeColors';
import { usePlatform } from '@/platform';
import { useTheme } from '../hooks/useTheme';
import { usePostqDesign } from '../design/postqDesign';

// Фон страницы postq (--rd-page в postq.css). Шапка кабинета прозрачная, под
// ней виден цвет клиента Telegram — операторская палитра давала там чужую
// (фиолетовую) подложку.
const POSTQ_PAGE = { dark: '#1a1a1c', light: '#f8f8f8' } as const;

interface ThemeColorsProviderProps {
  children: React.ReactNode;
}

export function ThemeColorsProvider({ children }: ThemeColorsProviderProps) {
  const { data: colors } = useQuery(themeColorsQueryOptions());

  const { theme: platformTheme, capabilities } = usePlatform();
  const { isDark } = useTheme();
  const postq = usePostqDesign();

  // Apply colors on mount and when they change
  useEffect(() => {
    applyThemeColors(colors || DEFAULT_THEME_COLORS);
  }, [colors]);

  // Sync Telegram header and bottom bar colors with theme
  const syncTelegramColors = useCallback(() => {
    if (!capabilities.hasThemeSync) return;

    const themeColors = colors || DEFAULT_THEME_COLORS;
    // Use surface color for header/bottom bar to match app UI
    const headerColor = isDark ? themeColors.darkSurface : themeColors.lightSurface;
    // Фон клиента под страницей — тот же, что у самой страницы. Иначе на
    // Android всё, что WebView не успел отрисовать, просвечивает цветом
    // клиента: чёрные прямоугольники и «прыгающие» цвета на Xiaomi.
    const pageColor = isDark ? themeColors.darkBackground : themeColors.lightBackground;

    if (postq) {
      const page = isDark ? POSTQ_PAGE.dark : POSTQ_PAGE.light;
      platformTheme.setHeaderColor(page);
      platformTheme.setBottomBarColor(page);
      platformTheme.setBackgroundColor(page);
      return;
    }

    platformTheme.setHeaderColor(headerColor);
    platformTheme.setBottomBarColor(headerColor);
    platformTheme.setBackgroundColor(pageColor);
  }, [capabilities.hasThemeSync, colors, isDark, platformTheme, postq]);

  // Apply Telegram colors when theme or colors change
  useEffect(() => {
    syncTelegramColors();
  }, [syncTelegramColors]);

  return <>{children}</>;
}
