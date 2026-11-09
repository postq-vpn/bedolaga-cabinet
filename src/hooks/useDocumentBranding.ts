import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  type BrandingInfo,
  brandingApi,
  getCachedBranding,
  preloadLogo,
  setCachedBranding,
} from '@/api/branding';
import {
  markBrandApplied,
  setAppNameMeta,
  setDocumentTitle,
  writeBrandHint,
} from '@/utils/documentBranding';

const FALLBACK_NAME = import.meta.env.VITE_APP_NAME || 'Cabinet';
const FALLBACK_LOGO = import.meta.env.VITE_APP_LOGO || 'V';
async function fetchBranding(): Promise<BrandingInfo> {
  const data = await brandingApi.getBranding();
  setCachedBranding(data);
  await preloadLogo(data);
  return data;
}

/**
 * Владелец имени бренда в <head> (см. utils/documentBranding). Работает на
 * всех страницах, включая вход и публичные лендинги: раньше заголовок и фавикон
 * ставил только AppShell после авторизации, и посетитель страницы входа видел
 * значения из сборки.
 */
export function useDocumentBranding(): void {
  const { data: branding } = useQuery({
    queryKey: ['branding'],
    queryFn: fetchBranding,
    initialData: getCachedBranding() ?? undefined,
    initialDataUpdatedAt: 0,
    staleTime: 60_000,
    retry: 1,
  });
  const name = branding?.name.trim() || FALLBACK_NAME;
  const letter = branding?.logo_letter || FALLBACK_LOGO;
  const appliedTitleRef = useRef<string | null>(null);

  // Пока брендинг не известен, ничего не трогаем: инлайн-скрипт index.html уже
  // показал подсказку прошлого визита, и затирать её значениями сборки нельзя.
  useEffect(() => {
    if (!branding) return;
    appliedTitleRef.current = setDocumentTitle(name, appliedTitleRef.current);
    setAppNameMeta(name);
  }, [branding, name]);

  // Иконки — статичный знак postq из public/brand (index.html), их не трогаем.
  useEffect(() => {
    if (!branding) return;
    // С этого момента ранний инлайн-скрипт index.html бренд не трогает.
    markBrandApplied();
    writeBrandHint({ name, letter });
  }, [branding, name, letter]);
}
