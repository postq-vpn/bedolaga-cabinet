// Redesign switch — see src/design/postqDesign.ts.
import { designSwitch } from '@/design/designSwitch';

export default designSwitch(
  () => import('./Balance.postq'),
  () => import('./Balance.legacy'),
  'Balance',
  { page: true },
);
