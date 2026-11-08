// Redesign switch — see src/design/postqDesign.ts.
import { isPostqDesign } from '@/design/postqDesign';
import { blockButtonClass as postq } from './buttonStyles.postq';
import { blockButtonClass as legacy } from './buttonStyles.legacy';

/** `primary` is the step's main action; the legacy design styles it like `light`. */
export function blockButtonClass(
  variant: 'primary' | 'light' | 'subtle',
  isLight?: boolean,
): string {
  if (isPostqDesign()) return postq(variant, isLight);
  return legacy(variant === 'primary' ? 'light' : variant, isLight);
}
