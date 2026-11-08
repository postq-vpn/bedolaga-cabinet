import { useEffect, useState } from 'react';
import { adminLocalesLoaded, ensureAdminLocales } from '@/i18n';

/**
 * The admin panel's strings live in their own locale chunk (src/i18n.ts,
 * vite-plugins/localeSplit.ts). Admin route guards wait for it, so admin pages
 * never render raw keys. True once loaded; false while loading or for non-admins.
 */
export function useAdminLocales(isAdmin: boolean): boolean {
  // Already loaded on an earlier admin page: no loader flash between pages.
  const [ready, setReady] = useState(adminLocalesLoaded);
  useEffect(() => {
    if (!isAdmin || ready) return;
    let alive = true;
    void ensureAdminLocales().then(() => {
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [isAdmin, ready]);
  return ready;
}
