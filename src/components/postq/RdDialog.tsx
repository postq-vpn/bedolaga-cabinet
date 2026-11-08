import type { ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { RdIcon } from './RdIcon';

/**
 * The postq dialog: dimmed backdrop, a centred card (scrolls when tall), a
 * heading with an optional caption and the round close button. Shared by the
 * devices, top-up and documents dialogs.
 */
export function RdDialog({
  open,
  onOpenChange,
  title,
  description,
  hideDescription = false,
  wide = false,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** Caption under the title; also the accessible description. */
  description?: ReactNode;
  /** Keep the description for screen readers only (it is, too, when absent: the title is read). */
  hideDescription?: boolean;
  /** 720px instead of 560px — for long texts. */
  wide?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[calc(100%-32px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-6 overflow-y-auto rounded-[var(--rd-radius-md)] bg-[var(--rd-surface)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.18)] focus:outline-none data-[state=open]:animate-fade-in sm:p-8',
            wide ? 'max-w-[720px]' : 'max-w-[560px]',
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <DialogPrimitive.Title className="rd-h5 text-[var(--rd-heading)]">
                {title}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description
                className={
                  hideDescription || !description ? 'sr-only' : 'rd-p-md text-[var(--rd-caption)]'
                }
              >
                {description ?? title}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              aria-label={t('common.close')}
              className="rd-icon-btn size-8 shrink-0 bg-[var(--rd-field)] text-[var(--rd-body)]"
            >
              <RdIcon name="cabinet/x" size={16} />
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
