// Redesign switch — see src/design/postqDesign.ts.
import { designSwitch } from '@/design/designSwitch';

export default designSwitch(
  () => import('./MergeAccounts.postq'),
  () => import('./MergeAccounts.legacy'),
  'MergeAccounts',
  { page: true },
);
