// Redesign switch — see src/design/postqDesign.ts.
import { designSwitch } from '@/design/designSwitch';

export default designSwitch(
  () => import('./Support.postq'),
  () => import('./Support.legacy'),
  'Support',
  { page: true },
);
