import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { useTranslation } from 'react-i18next';
import { useConfirmStore } from '@/store/confirmDialog';
import { cn } from '@/lib/utils';

/** Global host for confirmDialog() — the browser's confirm() in postq style. */
export function ConfirmDialogHost() {
  const { t } = useTranslation();
  const request = useConfirmStore((s) => s.request);
  const close = useConfirmStore((s) => s.close);

  return (
    <AlertDialog.Root open={!!request} onOpenChange={(open) => !open && close(false)}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm data-[state=open]:animate-fade-in" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-[60] flex w-[calc(100%-32px)] max-w-[440px] -translate-x-1/2 -translate-y-1/2 flex-col gap-6 rounded-[var(--rd-radius-md)] bg-[var(--rd-surface)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.18)] focus:outline-none data-[state=open]:animate-fade-in sm:p-8">
          <div className="flex flex-col gap-2">
            <AlertDialog.Title className="rd-h6 text-[var(--rd-heading)]">
              {request?.title || t('common.confirm', 'Подтвердите действие')}
            </AlertDialog.Title>
            <AlertDialog.Description className="rd-p-md whitespace-pre-line text-[var(--rd-caption)]">
              {request?.message}
            </AlertDialog.Description>
          </div>
          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            <AlertDialog.Cancel className="rd-btn-soft flex-1 !rounded-[16px] !bg-[var(--rd-field)] !text-[var(--rd-heading)] hover:!bg-[var(--rd-chip-hover)]">
              {request?.cancelLabel || t('common.cancel')}
            </AlertDialog.Cancel>
            <AlertDialog.Action
              onClick={() => close(true)}
              className={cn(
                'rd-btn flex-1',
                request?.destructive &&
                  '!bg-[var(--rd-error)] hover:!bg-[var(--rd-error-text)] hover:!opacity-90',
              )}
            >
              {request?.confirmLabel || 'OK'}
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
