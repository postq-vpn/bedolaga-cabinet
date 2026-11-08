import i18n from '../i18n';
import { formatDecimal } from './formatNumber';
import { uiLocale } from './uiLocale';

const NBSP = ' ';

/**
 * Format traffic amount with appropriate unit (MB/GB/TB).
 * Units come from i18n so RU shows «ГБ» consistently with the rest of the UI
 * (templates previously mixed latin "GB" with localized «ГБ» on one screen);
 * the decimal separator follows the interface language («41,2 ГБ», not «41.2 ГБ»).
 * Единица приклеена неразрывным пробелом: в узкой строке «ТБ» уезжало отдельной
 * строкой под число. Порог ТБ — по округлённому значению: 999,99 ГБ
 * показывалось как «1 000,0 ГБ».
 */
export function formatTraffic(gb: number, locale: string = uiLocale()): string {
  if (Math.round(gb * 10) / 10 >= 1000)
    return `${formatDecimal(gb / 1000, 1, locale)}${NBSP}${i18n.t('common.units.tb', 'TB')}`;
  if (gb >= 1) return `${formatDecimal(gb, 1, locale)}${NBSP}${i18n.t('common.units.gb', 'GB')}`;
  return `${formatDecimal(gb * 1024, 0, locale)}${NBSP}${i18n.t('common.units.mb', 'MB')}`;
}

/**
 * Postq variant: whole gigabytes, no tenths («10 ГБ», not «10,0 ГБ»).
 * Below 1 GB it falls back to MB so small usage doesn't read as «0 ГБ».
 */
export function formatTrafficWhole(gb: number, locale: string = uiLocale()): string {
  if (Math.round(gb) >= 1000)
    return `${formatDecimal(Math.round(gb / 1000), 0, locale)}${NBSP}${i18n.t('common.units.tb', 'TB')}`;
  if (gb >= 1)
    return `${formatDecimal(Math.round(gb), 0, locale)}${NBSP}${i18n.t('common.units.gb', 'GB')}`;
  return `${formatDecimal(gb * 1024, 0, locale)}${NBSP}${i18n.t('common.units.mb', 'MB')}`;
}

/**
 * «used из limit» pair for postq tiles: the unit is written once, on the limit
 * («0 из 10 ГБ», «3 из 10 ГБ»). Usage keeps its own unit only when it differs
 * («300 МБ из 10 ГБ»); nothing used is a bare «0».
 */
export function formatTrafficOf(
  usedGb: number,
  limitGb: number,
  locale: string = uiLocale(),
): { used: string; limit: string } {
  const limit = formatTrafficWhole(limitGb, locale);
  if (usedGb <= 0) return { used: '0', limit };
  const used = formatTrafficWhole(usedGb, locale);
  const unit = (s: string) => s.slice(s.lastIndexOf(NBSP) + 1);
  return {
    used: unit(used) === unit(limit) ? used.slice(0, used.lastIndexOf(NBSP)) : used,
    limit,
  };
}
