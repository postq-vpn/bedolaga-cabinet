// Redesign switch — see src/design/postqDesign.ts.
import { designSwitch } from '@/design/designSwitch';

export default designSwitch(
  () => import('./SubscriptionCardExpired.postq'),
  () => import('./SubscriptionCardExpired.legacy'),
  'SubscriptionCardExpired',
);
