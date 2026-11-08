import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

/** Monochrome SVG from /public/redesign/<name>.svg painted with `currentColor`
 *  through a CSS mask, so the colour comes from a text-colour class on this
 *  element or its parent and works in both themes (same as postq-site). */
export function RdIcon({
  name,
  size,
  width,
  height,
  className,
}: {
  name: string;
  size?: number;
  width?: number;
  height?: number;
  className?: string;
}) {
  const style = {
    width: width ?? size,
    height: height ?? size,
    '--rd-icon-src': `url("/redesign/${name}.svg")`,
  } as CSSProperties;
  return <span aria-hidden className={cn('rd-icon', className)} style={style} />;
}
