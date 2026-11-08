// Redesign switch — see src/design/postqDesign.ts.
import { designSwitch } from '@/design/designSwitch';

export { RewardSettings, ProgrammeTerms, tierProgressText } from './Referral.postq';
export default designSwitch(
  () => import('./Referral.postq'),
  () => import('./Referral.legacy'),
  'Referral',
  { page: true },
);
