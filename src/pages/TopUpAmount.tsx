// Redesign switch — see src/design/postqDesign.ts.
import { designSwitch } from '@/design/designSwitch';

export default designSwitch(
  () => import('./TopUpAmount.postq'),
  () => import('./TopUpAmount.legacy'),
  'TopUpAmount',
  { page: true },
);
