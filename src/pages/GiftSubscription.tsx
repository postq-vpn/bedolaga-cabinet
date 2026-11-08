// Redesign switch — see src/design/postqDesign.ts.
import { designSwitch } from '@/design/designSwitch';

export default designSwitch(
  () => import('./GiftSubscription.postq'),
  () => import('./GiftSubscription.legacy'),
  'GiftSubscription',
  { page: true },
);
