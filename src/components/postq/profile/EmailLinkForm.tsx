import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { authApi } from '@/api/auth';
import { useAuthStore } from '@/store/auth';
import { isValidEmail } from '@/utils/validation';
import { getApiErrorMessage } from '@/utils/api-error';
import { getLocalizedApiErrorMessage } from '@/utils/api-error-display';

type Step = 'email' | 'password' | 'code' | 'sent';

const INPUT =
  'rd-p-md h-14 w-full min-w-0 shrink-0 rounded-[var(--rd-radius-sm)] sm:w-auto sm:flex-1 border-2 border-transparent bg-[var(--rd-field)] px-4 text-[var(--rd-heading)] outline-none placeholder:text-[var(--rd-placeholder)] focus:border-[var(--rd-action)]';
const PRIMARY =
  'rd-p-md h-14 shrink-0 rounded-[var(--rd-radius-sm)] bg-[var(--rd-action)] px-6 font-medium text-[var(--rd-on-action)] transition-colors hover:bg-[var(--rd-action-hover)] disabled:opacity-60';

/**
 * Linking an email inside the profile's «Email» block (Figma shows the first
 * step): email → password for email sign-in → (only when the address belongs
 * to another account) the 6-digit code mailed to it → merge screen.
 */
export function EmailLinkForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const register = useMutation({
    mutationFn: () => authApi.registerEmail(email.trim(), password),
    onSuccess: async (response) => {
      setError(null);
      if (response.merge_required && response.merge_token) {
        navigate(`/merge/${response.merge_token}`, { replace: true });
        return;
      }
      if (response.merge_required && response.merge_verification === 'email_code') {
        setStep('code');
        return;
      }
      setStep('sent');
      setUser(await authApi.getMe());
      queryClient.invalidateQueries({ queryKey: ['linked-providers'] });
    },
    onError: (err) => {
      const detail = getApiErrorMessage(err, '');
      if (detail.includes('merge')) setError(t('profile.emailMergePasswordRequired'));
      else if (detail.includes('already registered')) setError(t('profile.emailAlreadyRegistered'));
      else if (detail.includes('already have a verified email'))
        setError(t('profile.alreadyHaveEmail'));
      else setError(getLocalizedApiErrorMessage(err, t('common.error'), t));
    },
  });

  const verify = useMutation({
    mutationFn: () => authApi.verifyEmailMerge(code.trim()),
    onSuccess: (response) => {
      if (response.merge_token) navigate(`/merge/${response.merge_token}`, { replace: true });
    },
    onError: (err) =>
      setError(getLocalizedApiErrorMessage(err, t('profile.emailMergeCodeInvalid'), t)),
  });

  const back = (to: Step) => {
    setError(null);
    setStep(to);
  };

  if (step === 'sent') {
    return (
      <p className="rd-p-md rounded-[var(--rd-radius-sm)] bg-[var(--rd-field)] px-4 py-3 text-[var(--rd-heading)]">
        {t('postq.profile.emailSent', { email: email.trim() })}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* The first step's hint lives in the Email row above. */}
      {step !== 'email' && (
        <p className="rd-p-md text-[var(--rd-caption)]">
          {step === 'password'
            ? t('postq.profile.passwordHint', { email: email.trim() })
            : t('postq.profile.codeHint', { email: email.trim() })}
        </p>
      )}

      {step === 'email' && (
        <form
          className="flex flex-col gap-2 sm:flex-row sm:gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!isValidEmail(email.trim())) {
              setError(t('profile.invalidEmail'));
              return;
            }
            back('password');
          }}
        >
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('postq.profile.emailPlaceholder')}
            aria-label={t('postq.profile.emailPlaceholder')}
            className={INPUT}
          />
          <button type="submit" className={PRIMARY}>
            {t('postq.profile.linkEmail')}
          </button>
        </form>
      )}

      {step === 'password' && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (password.length < 8) {
              setError(t('profile.passwordMinLength'));
              return;
            }
            if (password !== confirm) {
              setError(t('profile.passwordsMismatch'));
              return;
            }
            setError(null);
            register.mutate();
          }}
        >
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('postq.profile.passwordPlaceholder')}
              aria-label={t('postq.profile.passwordPlaceholder')}
              className={INPUT}
              autoFocus
            />
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={t('postq.profile.confirmPlaceholder')}
              aria-label={t('postq.profile.confirmPlaceholder')}
              className={INPUT}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={() => back('email')} className="rd-p-md rd-link">
              {t('common.back')}
            </button>
            <button type="submit" disabled={register.isPending} className={PRIMARY}>
              {register.isPending ? t('common.loading') : t('postq.profile.linkEmail')}
            </button>
          </div>
        </form>
      )}

      {step === 'code' && (
        <form
          className="flex flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!/^\d{6}$/.test(code.trim())) {
              setError(t('profile.emailMergeCodeInvalid'));
              return;
            }
            setError(null);
            verify.mutate();
          }}
        >
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            aria-label={t('postq.profile.codePlaceholder')}
            className={`${INPUT} tracking-[0.3em]`}
          />
          <button type="submit" disabled={verify.isPending} className={PRIMARY}>
            {verify.isPending ? t('common.loading') : t('postq.profile.confirm')}
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="rd-p-sm text-[var(--rd-error-text)]">
          {error}
        </p>
      )}
    </div>
  );
}
