// Redesign switch — see src/design/postqDesign.ts.
import { designSwitch } from '@/design/designSwitch';

export default designSwitch(
  () => import('./TopUpResult.postq'),
  () => import('./TopUpResult.legacy'),
  'TopUpResult',
  { page: true },
);
