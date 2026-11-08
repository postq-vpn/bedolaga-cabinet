// Redesign switch — see src/design/postqDesign.ts.
import { designSwitch } from '@/design/designSwitch';

export default designSwitch(
  () => import('./Login.postq'),
  () => import('./Login.legacy'),
  'Login',
  { page: true },
);
