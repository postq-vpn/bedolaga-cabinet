// Redesign switch — see src/design/postqDesign.ts.
import { designSwitch } from '@/design/designSwitch';

export const AppShell = designSwitch(
  () => import('./AppShell.postq').then((m) => ({ default: m.AppShell })),
  () => import('./AppShell.legacy').then((m) => ({ default: m.AppShell })),
  'AppShell',
);
