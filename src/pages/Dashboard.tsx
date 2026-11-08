// Redesign switch — see src/design/postqDesign.ts.
import { designSwitch } from '@/design/designSwitch';

export default designSwitch(
  () => import('./Dashboard.postq'),
  () => import('./Dashboard.legacy'),
  'Dashboard',
  { page: true },
);
