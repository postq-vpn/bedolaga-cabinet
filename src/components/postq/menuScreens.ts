/** Tabs of the bottom bar, which are also the desktop header's sections. */
export const MOBILE_TABS = ['/', '/balance', '/support', '/profile'] as const;

/** The bottom bar shows on its own screens only (nested pages get the full height). */
export function isMobileTabScreen(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return (MOBILE_TABS as readonly string[]).includes(path);
}
