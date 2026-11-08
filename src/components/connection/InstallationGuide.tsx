// Redesign switch — see src/design/postqDesign.ts.
import { designSwitch } from '@/design/designSwitch';

export default designSwitch(
  () => import('./InstallationGuide.postq'),
  () => import('./InstallationGuide.legacy'),
  'InstallationGuide',
);
