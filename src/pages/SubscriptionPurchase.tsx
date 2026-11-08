// Redesign switch — see src/design/postqDesign.ts.
import { designSwitch } from '@/design/designSwitch';

export default designSwitch(
  () => import('./SubscriptionPurchase.postq'),
  () => import('./SubscriptionPurchase.legacy'),
  'SubscriptionPurchase',
  { page: true },
);
