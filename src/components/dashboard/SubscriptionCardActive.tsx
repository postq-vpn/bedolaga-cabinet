// Redesign switch — see src/design/postqDesign.ts.
import { designSwitch } from '@/design/designSwitch';

export default designSwitch(
  () => import('./SubscriptionCardActive.postq'),
  () => import('./SubscriptionCardActive.legacy'),
  'SubscriptionCardActive',
);
