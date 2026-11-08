// Redesign switch — see src/design/postqDesign.ts.
import { designSwitch } from '@/design/designSwitch';

export default designSwitch(
  () => import('./Profile.postq'),
  () => import('./Profile.legacy'),
  'Profile',
  { page: true },
);
