// Redesign switch — see src/design/postqDesign.ts.
import { designSwitch } from '@/design/designSwitch';

export default designSwitch(
  () => import('./AdminTickets.postq'),
  () => import('./AdminTickets.legacy'),
  'AdminTickets',
  { page: true },
);
