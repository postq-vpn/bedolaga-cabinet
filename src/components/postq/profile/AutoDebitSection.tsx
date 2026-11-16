import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { subscriptionApi } from '@/api/subscription';
import type { SubscriptionListItem } from '@/types';
import { SbpAutopayRow, useSbpAutopay } from '../dashboard/SbpAutopay';

/**
 * «Оплата» in the profile: SBP auto-debit of the paid subscription — the same
 * row as on the dashboard card. postq saves no cards, so this is the only
 * payment binding there is. Nothing is shown when it isn't offered.
 */
export function AutoDebitSection() {
  const { data } = useQuery({
    queryKey: ['subscriptions-list'],
    queryFn: subscriptionApi.getSubscriptions,
  });
  const paid = (data?.subscriptions ?? []).find((s) => !s.is_trial);
  return paid ? <Section subscription={paid} /> : null;
}

function Section({ subscription }: { subscription: SubscriptionListItem }) {
  const { t } = useTranslation();
  const sbp = useSbpAutopay(subscription);
  if (sbp.state === 'hidden') return null;
  return (
    <section className="rd-card rd-card--lg flex flex-col gap-6">
      <h2 className="rd-h6 text-[var(--rd-heading)]">{t('postq.profile.payment')}</h2>
      <SbpAutopayRow subscription={subscription} sbp={sbp} />
    </section>
  );
}
