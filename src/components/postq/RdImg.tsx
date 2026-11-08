import type { ImgHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Assets in /public/redesign that have a separate file for the dark theme
 *  (/public/redesign/dark/<name>.svg). Everything else is shared. */
const DARK_VARIANTS = new Set([
  'nav-logo',
  'logo',
  'logo-mark',
  'pay-mir',
  'pay-visa',
  'pay-mastercard',
  'pay-btc',
  'pay-ton',
  'pay-eth',
  'pay-usdt',
]);

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & { name: string };

/** SVG asset from /public/redesign that follows the active theme. When a dark
 *  file exists both are rendered and CSS (.rd-v-light / .rd-v-dark) shows one,
 *  so the right image is there on first paint. */
export function RdImg({ name, alt = '', className, ...rest }: Props) {
  if (!DARK_VARIANTS.has(name)) {
    return <img src={`/redesign/${name}.svg`} alt={alt} className={className} {...rest} />;
  }
  return (
    <>
      <img
        src={`/redesign/${name}.svg`}
        alt={alt}
        className={cn('rd-v-light', className)}
        {...rest}
      />
      <img
        src={`/redesign/dark/${name}.svg`}
        alt={alt}
        className={cn('rd-v-dark', className)}
        {...rest}
      />
    </>
  );
}
