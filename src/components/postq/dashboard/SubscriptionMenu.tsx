import { useEffect } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/Toast';
import { useReissueLink } from '@/components/subscription/manage/ReissueLinkButton';
import { getErrorMessage } from '@/utils/subscriptionHelpers';
import type { Subscription } from '@/types';
import { RdIcon } from '../RdIcon';

// Plain text row: no fill at rest, a light field tint on hover/focus.
const ITEM =
  'flex cursor-pointer select-none flex-col gap-1 rounded-[12px] px-4 py-3 outline-none transition-colors data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[highlighted]:bg-[var(--rd-field)]';

/**
 * «…» on the dashboard subscription card: options that have no button on the
 * card itself (today: reissuing the subscription link).
 */
export function SubscriptionMenu({ subscription }: { subscription: Subscription }) {
  const { t } = useTranslation();
  const reissue = useReissueLink(subscription, subscription.id);
  const { showToast } = useToast();
  useEffect(() => {
    if (reissue.error) showToast({ type: 'error', message: getErrorMessage(reissue.error) });
  }, [reissue.error, showToast]);
  useEffect(() => {
    if (reissue.partialReset)
      showToast({ type: 'warning', message: t('subscription.revoke.partialWarning') });
  }, [reissue.partialReset, showToast, t]);

  // Connect and devices already have their buttons on the card; only the
  // reissue lives here, so there's no menu when it isn't available.
  if (!reissue.canReissue) return null;

  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger
        aria-label={t('postq.dashboard.subscriptionSettings')}
        className="rd-icon-btn size-8 shrink-0 bg-[var(--rd-field)] text-[var(--rd-body)] data-[state=open]:bg-[var(--rd-chip-hover)]"
      >
        <RdIcon name="cabinet/ellipsis" size={20} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 flex w-[280px] max-w-[calc(100vw-32px)] flex-col gap-1 rounded-[20px] bg-[var(--rd-surface)] p-2 shadow-[0_12px_48px_rgba(0,0,0,0.12)] data-[state=open]:animate-fade-in"
        >
          {reissue.canReissue && (
            <DropdownMenu.Item
              className={ITEM}
              disabled={reissue.isPending || reissue.cooldown > 0}
              onSelect={() => void reissue.handleRevoke()}
            >
              <span className="rd-p-md text-[var(--rd-error-text)]">
                {reissue.isPending ? t('common.loading') : t('subscription.revoke.button')}
              </span>
              <span className="rd-p-sm text-[var(--rd-caption)]">
                {reissue.cooldown > 0
                  ? t('subscription.revoke.cooldown', {
                      minutes: Math.floor(reissue.cooldown / 60),
                      seconds: reissue.cooldown % 60,
                    })
                  : t('subscription.revoke.description')}
              </span>
            </DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
