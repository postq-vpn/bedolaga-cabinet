import { useState, type SyntheticEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  partnerApi,
  type PartnerApplicationRequest,
  type PartnerStatusResponse,
} from '@/api/partners';
import { getLocalizedApiErrorMessage } from '@/utils/api-error-display';
import { uiLocale } from '@/utils/uiLocale';
import { RD_FIELD as FIELD } from '@/components/postq/ui';

/**
 * Partner programme at the bottom of the referral page — replaces the separate
 * application screen. One card whose content follows the application status:
 * none → the pitch and a «Подать заявку» button that unfolds the form here;
 * pending → under review; approved → the partner commission; rejected → the
 * admin's comment and the same form to apply again. No withdrawals (postq).
 */
export function PartnerSection({ status }: { status: PartnerStatusResponse | undefined }) {
  const { t } = useTranslation();
  const [formOpen, setFormOpen] = useState(false);
  const value = status?.partner_status ?? 'none';
  const application = status?.latest_application;

  if (value === 'pending') {
    return (
      <section className="rd-card rd-card--lg flex flex-col gap-2">
        <h2 className="rd-h5 text-[var(--rd-heading)]">{t('referral.partner.underReview')}</h2>
        <p className="rd-p-md text-[var(--rd-caption)]">{t('referral.partner.underReviewDesc')}</p>
        {application?.created_at && (
          <p className="rd-p-md text-[var(--rd-caption)]">
            {t('referral.partner.submittedAt', {
              date: new Date(application.created_at).toLocaleDateString(uiLocale()),
            })}
          </p>
        )}
      </section>
    );
  }

  if (value === 'approved') {
    return (
      <section className="rd-card rd-card--lg flex flex-col gap-2">
        <h2 className="rd-h5 text-[var(--rd-heading)]">{t('postq.partner.approvedTitle')}</h2>
        <p className="rd-p-md text-[var(--rd-caption)]">
          {t('referral.partner.commissionInfo', { percent: status?.commission_percent ?? 0 })}
        </p>
      </section>
    );
  }

  const rejected = value === 'rejected';
  return (
    <section className="rd-card rd-card--lg flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="rd-h5 text-[var(--rd-heading)]">
          {rejected ? t('referral.partner.rejected') : t('referral.partner.becomePartner')}
        </h2>
        <p className="rd-p-md text-[var(--rd-caption)] [overflow-wrap:anywhere]">
          {rejected && application?.admin_comment
            ? application.admin_comment
            : t('referral.partner.becomePartnerDescNoWithdrawal')}
        </p>
      </div>
      {formOpen ? (
        <PartnerForm onCancel={() => setFormOpen(false)} />
      ) : (
        <button type="button" onClick={() => setFormOpen(true)} className="rd-btn self-start">
          {rejected ? t('referral.partner.reapplyButton') : t('referral.partner.applyButton')}
        </button>
      )}
    </section>
  );
}

function PartnerForm({ onCancel }: { onCancel: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<PartnerApplicationRequest>({});
  const set = (patch: PartnerApplicationRequest) => setForm((f) => ({ ...f, ...patch }));

  const apply = useMutation({
    mutationFn: partnerApi.apply,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['partner-status'] }),
  });

  const submit = (e: SyntheticEvent) => {
    e.preventDefault();
    // Every field is optional: send only what was filled in.
    const payload = Object.fromEntries(
      Object.entries(form).filter(([, v]) => v !== undefined && v !== ''),
    ) as PartnerApplicationRequest;
    apply.mutate(payload);
  };

  const field = (id: string, label: string, input: React.ReactNode) => (
    <label htmlFor={id} className="flex flex-col gap-2">
      <span className="rd-p-md text-[var(--rd-heading)]">{label}</span>
      {input}
    </label>
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <p className="rd-p-md text-[var(--rd-caption)]">{t('postq.partner.allOptional')}</p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {field(
          'pa-company',
          t('referral.partner.fields.companyName'),
          <input
            id="pa-company"
            className={FIELD}
            value={form.company_name ?? ''}
            onChange={(e) => set({ company_name: e.target.value })}
            placeholder={t('referral.partner.fields.companyNamePlaceholder')}
          />,
        )}
        {field(
          'pa-channel',
          t('referral.partner.fields.telegramChannel'),
          <input
            id="pa-channel"
            className={FIELD}
            value={form.telegram_channel ?? ''}
            onChange={(e) => set({ telegram_channel: e.target.value })}
            placeholder={t('referral.partner.fields.telegramChannelPlaceholder')}
          />,
        )}
        {field(
          'pa-site',
          t('referral.partner.fields.websiteUrl'),
          <input
            id="pa-site"
            type="url"
            className={FIELD}
            value={form.website_url ?? ''}
            onChange={(e) => set({ website_url: e.target.value })}
            placeholder={t('referral.partner.fields.websiteUrlPlaceholder')}
          />,
        )}
        {field(
          'pa-referrals',
          t('referral.partner.fields.expectedReferrals'),
          <input
            id="pa-referrals"
            type="number"
            inputMode="numeric"
            min={0}
            max={2000000000}
            className={FIELD}
            value={form.expected_monthly_referrals ?? ''}
            onChange={(e) =>
              set({
                expected_monthly_referrals: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            placeholder={t('referral.partner.fields.expectedReferralsPlaceholder')}
          />,
        )}
        {field(
          'pa-commission',
          t('referral.partner.fields.desiredCommission'),
          <input
            id="pa-commission"
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            className={FIELD}
            value={form.desired_commission_percent ?? ''}
            onChange={(e) =>
              set({
                desired_commission_percent: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            placeholder={t('referral.partner.fields.desiredCommissionPlaceholder')}
          />,
        )}
        <div className="md:col-span-2">
          {field(
            'pa-description',
            t('referral.partner.fields.description'),
            <textarea
              id="pa-description"
              rows={4}
              className={`${FIELD} h-auto resize-y py-3`}
              value={form.description ?? ''}
              onChange={(e) => set({ description: e.target.value })}
              placeholder={t('referral.partner.fields.descriptionPlaceholder')}
            />,
          )}
        </div>
      </div>
      {apply.isError && (
        <p role="alert" className="rd-p-md text-[var(--rd-error-text)]">
          {getLocalizedApiErrorMessage(apply.error, t('referral.partner.applyError'), t)}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={apply.isPending} className="rd-btn">
          {apply.isPending
            ? t('referral.partner.applying')
            : t('referral.partner.submitApplication')}
        </button>
        <button type="button" onClick={onCancel} className="rd-p-md rd-link px-4 font-medium">
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}
