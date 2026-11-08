import { getLocalizedApiErrorMessage } from '../utils/api-error-display';
import { uiLocale } from '@/utils/uiLocale';
import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { usePlatform } from '@/platform';
import { copyToClipboard } from '@/utils/clipboard';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuthStore } from '../store/auth';
import { displayName } from '../utils/displayName';
import { authApi } from '../api/auth';
import { isValidEmail } from '../utils/validation';
import { useCountdown } from '../hooks/useCountdown';
import { getApiErrorMessage } from '../utils/api-error';
import { brandingApi, type EmailAuthEnabled } from '../api/branding';
import { RdIcon } from '@/components/postq/RdIcon';
import { UserAvatar } from '@/components/postq/UserAvatar';
import { useSecretAdminTap } from '@/hooks/useSecretAdminTap';
import { LoginMethods } from '@/components/postq/profile/LoginMethods';
import { EmailLinkForm } from '@/components/postq/profile/EmailLinkForm';
import { NotificationsCard } from '@/components/postq/profile/NotificationsCard';
import { InfoCard } from '@/components/postq/profile/InfoCard';
import { MobileMoreCard } from '@/components/postq/MobileNav';
import { UI } from '../config/constants';
import { RD_FIELD as FIELD } from '@/components/postq/ui';

export default function Profile() {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Inline email change flow
  const [changeEmailStep, setChangeEmailStep] = useState<'email' | 'code' | 'success' | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [changeCode, setChangeCode] = useState('');
  const [changeError, setChangeError] = useState<string | null>(null);
  const [resendCooldown, startResendCooldown] = useCountdown();
  const [verificationResendCooldown, startVerificationResendCooldown] = useCountdown();
  const newEmailInputRef = useRef<HTMLInputElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);

  // Check if email auth is enabled
  const { data: emailAuthConfig } = useQuery<EmailAuthEnabled>({
    queryKey: ['email-auth-enabled'],
    queryFn: brandingApi.getEmailAuthEnabled,
    staleTime: 60000,
  });
  const isEmailAuthEnabled = emailAuthConfig?.enabled ?? true;
  const isEmailVerificationEnabled = emailAuthConfig?.verification_enabled ?? true;

  const resendVerificationMutation = useMutation({
    mutationFn: authApi.resendVerification,
    onSuccess: () => {
      setSuccess(t('profile.verificationResent'));
      setError(null);
      startVerificationResendCooldown(UI.RESEND_COOLDOWN_SEC);
    },
    onError: (err: unknown) => {
      setError(getLocalizedApiErrorMessage(err, t('common.error'), t));
      setSuccess(null);
    },
  });

  // Email change mutations
  const requestEmailChangeMutation = useMutation({
    mutationFn: (emailAddr: string) => authApi.requestEmailChange(emailAddr),
    onSuccess: async (data) => {
      setChangeError(null);
      if (data.expires_in_minutes === 0) {
        // Unverified email was replaced directly
        setChangeEmailStep('success');
        const updatedUser = await authApi.getMe();
        setUser(updatedUser);
      } else {
        setChangeEmailStep('code');
        startResendCooldown(UI.RESEND_COOLDOWN_SEC);
      }
    },
    onError: (err: unknown) => {
      const detail = getApiErrorMessage(err, '');
      if (detail.includes('already registered') || detail.includes('already in use')) {
        setChangeError(t('profile.changeEmail.emailAlreadyUsed'));
      } else if (detail.includes('same as current')) {
        setChangeError(t('profile.changeEmail.sameEmail'));
      } else if (detail.includes('rate limit') || detail.includes('too many')) {
        setChangeError(t('profile.changeEmail.tooManyRequests'));
      } else {
        setChangeError(getLocalizedApiErrorMessage(err, t('common.error'), t));
      }
    },
  });

  const verifyEmailChangeMutation = useMutation({
    mutationFn: (verificationCode: string) => authApi.verifyEmailChange(verificationCode),
    onSuccess: async () => {
      setChangeError(null);
      setChangeEmailStep('success');
      const updatedUser = await authApi.getMe();
      setUser(updatedUser);
      // Note: auth user lives in the zustand store, not in React Query —
      // the explicit setUser above IS the refresh. No ['user'] query exists.
    },
    onError: (err: unknown) => {
      const detail = getApiErrorMessage(err, '');
      if (detail.includes('invalid') || detail.includes('wrong')) {
        setChangeError(t('profile.changeEmail.invalidCode'));
      } else if (detail.includes('expired')) {
        setChangeError(t('profile.changeEmail.codeExpired'));
      } else {
        setChangeError(getLocalizedApiErrorMessage(err, t('common.error'), t));
      }
    },
  });

  // Auto-focus inputs on step change (skip on Telegram — keyboard hides bottom nav)
  const { platform: profilePlatform } = usePlatform();
  const isTelegram = profilePlatform === 'telegram';
  const logout = useAuthStore((state) => state.logout);
  const onAvatarTap = useSecretAdminTap();
  useEffect(() => {
    if (profilePlatform === 'telegram') return;
    const timer = setTimeout(() => {
      if (changeEmailStep === 'email') newEmailInputRef.current?.focus();
      else if (changeEmailStep === 'code') codeInputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, [changeEmailStep, profilePlatform]);

  // Auto-close success after 3s
  useEffect(() => {
    if (changeEmailStep !== 'success') return;
    const timer = setTimeout(() => resetChangeEmail(), 3000);
    return () => clearTimeout(timer);
  }, [changeEmailStep]);

  const resetChangeEmail = () => {
    setChangeEmailStep(null);
    setNewEmail('');
    setChangeCode('');
    setChangeError(null);
    startResendCooldown(0);
  };

  const handleSendChangeCode = () => {
    setChangeError(null);
    if (!newEmail.trim()) {
      setChangeError(t('profile.emailRequired'));
      return;
    }
    if (!isValidEmail(newEmail.trim())) {
      setChangeError(t('profile.invalidEmail'));
      return;
    }
    if (user?.email && newEmail.toLowerCase().trim() === user.email.toLowerCase()) {
      setChangeError(t('profile.changeEmail.sameEmail'));
      return;
    }
    requestEmailChangeMutation.mutate(newEmail.trim());
  };

  const handleVerifyChangeCode = () => {
    setChangeError(null);
    if (!changeCode.trim()) {
      setChangeError(t('profile.changeEmail.enterCode'));
      return;
    }
    if (changeCode.trim().length < 4) {
      setChangeError(t('profile.changeEmail.invalidCode'));
      return;
    }
    verifyEmailChangeMutation.mutate(changeCode.trim());
  };

  const handleResendChangeCode = () => {
    if (resendCooldown > 0) return;
    requestEmailChangeMutation.mutate(newEmail.trim());
  };

  const registered = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(uiLocale())
    : null;

  const copyTelegramId = async () => {
    if (!user?.telegram_id) return;
    try {
      await copyToClipboard(String(user.telegram_id));
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    } catch {
      // clipboard unavailable
    }
  };

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="rd-h3 text-[var(--rd-heading)]">{t('postq.profile.title')}</h1>
        <p className="rd-p-lg text-[var(--rd-caption)]">{t('postq.profile.subtitle')}</p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Phones: aside and column dissolve (`contents`) so the cards line up by
            priority — account, login methods, notifications, documents, theme and
            links, and «Выйти» last. */}
        <aside className="contents lg:flex lg:w-[400px] lg:shrink-0 lg:flex-col lg:gap-6">
          <section className="rd-card rd-card--lg order-1 flex flex-col gap-6 lg:order-none">
            <div className="flex items-center gap-4">
              {/* Hidden admin entry: five taps on the avatar (admins only). */}
              <span onClick={onAvatarTap} className="flex shrink-0 select-none">
                <UserAvatar size={56} animate="always" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="rd-h6 truncate text-[var(--rd-heading)]">
                  {displayName(user) || (user?.username ? `@${user.username}` : user?.email)}
                </span>
                <span className="rd-p-md truncate text-[var(--rd-caption)]">
                  {user?.username
                    ? `@${user.username}`
                    : user?.email || t('postq.profile.personalAccount')}
                </span>
              </div>
            </div>
            {/* Reference data as label/value rows — secondary, so compact. */}
            {(user?.telegram_id || registered) && (
              <dl className="rd-p-md flex flex-col gap-3">
                {user?.telegram_id && (
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-[var(--rd-caption)]">{t('postq.profile.telegramId')}</dt>
                    {/* Same as CopyField: «Скопировано» for a second, the icon in action colour. */}
                    <dd>
                      <button
                        type="button"
                        onClick={copyTelegramId}
                        aria-label={t('postq.profile.copyId')}
                        title={t('postq.profile.copyId')}
                        className="flex h-5 items-center gap-2 text-[var(--rd-heading)]"
                      >
                        {copied ? t('postq.dashboard.copied') : user.telegram_id}
                        <RdIcon
                          name="cabinet/copy"
                          size={16}
                          className={
                            copied ? 'text-[var(--rd-action)]' : 'text-[var(--rd-caption)]'
                          }
                        />
                      </button>
                    </dd>
                  </div>
                )}
                {registered && (
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-[var(--rd-caption)]">{t('postq.profile.registeredAt')}</dt>
                    <dd className="text-[var(--rd-heading)]">{registered}</dd>
                  </div>
                )}
              </dl>
            )}
          </section>
          {!isTelegram && (
            <button
              type="button"
              onClick={logout}
              className="rd-p-md rd-link order-6 flex items-center gap-3 self-start px-6 py-2 lg:order-none"
            >
              <RdIcon name="cabinet/log-out" size={20} />
              {t('postq.profile.logout')}
            </button>
          )}
        </aside>

        <div className="contents lg:flex lg:min-w-0 lg:flex-1 lg:flex-col lg:gap-6">
          <section className="rd-card rd-card--lg order-2 flex flex-col gap-6 lg:order-none">
            <h2 className="rd-h6 text-[var(--rd-heading)]">{t('postq.profile.loginMethods')}</h2>

            {isEmailAuthEnabled && (
              <div className="flex flex-col gap-4">
                {/* Email row, same shape as the Telegram row below: name and
                    address, the action as a text button on the right. */}
                <div className="flex items-start justify-between gap-4">
                  <div className="rd-p-md flex min-w-0 flex-col gap-1">
                    <span className="font-medium text-[var(--rd-heading)]">Email</span>
                    <span className={`text-[var(--rd-caption)] ${user?.email ? 'truncate' : ''}`}>
                      {user?.email ? (
                        <>
                          {user.email}
                          {!user.email_verified && isEmailVerificationEnabled && (
                            <span className="text-[var(--rd-warn-icon)]">
                              {' · '}
                              {t('profile.notVerified').toLowerCase()}
                            </span>
                          )}
                        </>
                      ) : (
                        // Not linked: the reason to add it is the detail line;
                        // the status sits on the right, like Telegram's.
                        t('postq.profile.emailHint')
                      )}
                    </span>
                  </div>
                  {!user?.email && (
                    <span className="rd-p-md shrink-0 text-[var(--rd-caption)]">
                      {t('postq.profile.emailNotLinked')}
                    </span>
                  )}
                  {user?.email && changeEmailStep === null && (
                    <button
                      type="button"
                      onClick={() => setChangeEmailStep('email')}
                      className="rd-p-md rd-link-action shrink-0"
                    >
                      {t('profile.changeEmail.button')}
                    </button>
                  )}
                </div>

                {user?.email ? (
                  <>
                    {!user.email_verified &&
                      isEmailVerificationEnabled &&
                      changeEmailStep === null && (
                        <div className="flex flex-col gap-3">
                          <p className="rd-p-md text-[var(--rd-caption)]">
                            {t('profile.verificationRequired')}
                          </p>
                          <button
                            type="button"
                            onClick={() => resendVerificationMutation.mutate()}
                            disabled={
                              verificationResendCooldown > 0 || resendVerificationMutation.isPending
                            }
                            className="rd-btn-soft self-start"
                          >
                            {verificationResendCooldown > 0
                              ? t('profile.resendIn', { seconds: verificationResendCooldown })
                              : t('profile.resendVerification')}
                          </button>
                        </div>
                      )}

                    {changeEmailStep === 'email' && (
                      <div className="flex flex-col gap-3">
                        <input
                          ref={newEmailInputRef}
                          type="email"
                          value={newEmail}
                          onChange={(e) => setNewEmail(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleSendChangeCode();
                            }
                          }}
                          placeholder={t('profile.changeEmail.newEmail')}
                          aria-label={t('profile.changeEmail.newEmail')}
                          className={FIELD}
                          autoComplete="email"
                        />
                        {changeError && (
                          <p role="alert" className="rd-p-md text-[var(--rd-error-text)]">
                            {changeError}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-3">
                          <button
                            type="button"
                            onClick={handleSendChangeCode}
                            disabled={!newEmail.trim() || requestEmailChangeMutation.isPending}
                            className="rd-btn"
                          >
                            {requestEmailChangeMutation.isPending
                              ? t('common.loading')
                              : t('profile.changeEmail.sendCode')}
                          </button>
                          <button
                            type="button"
                            onClick={resetChangeEmail}
                            className="rd-p-md rd-link px-4"
                          >
                            {t('common.cancel')}
                          </button>
                        </div>
                      </div>
                    )}

                    {changeEmailStep === 'code' && (
                      <div className="flex flex-col gap-3">
                        <p className="rd-p-md text-[var(--rd-caption)]">
                          {t('profile.changeEmail.codeSentTo', { email: newEmail })}
                        </p>
                        <input
                          ref={codeInputRef}
                          type="text"
                          inputMode="numeric"
                          value={changeCode}
                          onChange={(e) => setChangeCode(e.target.value.replace(/\D/g, ''))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleVerifyChangeCode();
                            }
                          }}
                          placeholder={t('profile.changeEmail.verificationCode')}
                          aria-label={t('profile.changeEmail.verificationCode')}
                          maxLength={6}
                          className={FIELD}
                          autoComplete="one-time-code"
                        />
                        {changeError && (
                          <p role="alert" className="rd-p-md text-[var(--rd-error-text)]">
                            {changeError}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-3">
                          <button
                            type="button"
                            onClick={handleVerifyChangeCode}
                            disabled={!changeCode.trim() || verifyEmailChangeMutation.isPending}
                            className="rd-btn"
                          >
                            {verifyEmailChangeMutation.isPending
                              ? t('common.loading')
                              : t('profile.changeEmail.verify')}
                          </button>
                          <button
                            type="button"
                            onClick={handleResendChangeCode}
                            disabled={resendCooldown > 0 || requestEmailChangeMutation.isPending}
                            className="rd-p-md rd-link px-4 disabled:opacity-50"
                          >
                            {resendCooldown > 0
                              ? t('profile.changeEmail.resendIn', { seconds: resendCooldown })
                              : t('profile.changeEmail.resendCode')}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setChangeEmailStep('email');
                              setChangeCode('');
                              setChangeError(null);
                            }}
                            className="rd-p-md rd-link px-4"
                          >
                            {t('common.back')}
                          </button>
                        </div>
                      </div>
                    )}

                    {changeEmailStep === 'success' && (
                      <p className="rd-p-md text-[var(--rd-success-text)]">
                        {t('profile.changeEmail.success')}
                      </p>
                    )}
                  </>
                ) : (
                  <EmailLinkForm />
                )}

                {(error || success) && user?.email && (
                  <p
                    role={error ? 'alert' : 'status'}
                    className={`rd-p-md ${error ? 'text-[var(--rd-error-text)]' : 'text-[var(--rd-success-text)]'}`}
                  >
                    {error || success}
                  </p>
                )}
                <div className="h-px w-full bg-[var(--rd-divider)]" />
              </div>
            )}

            <LoginMethods telegramUsername={user?.username ?? null} />
          </section>

          <div className="order-3 lg:order-none">
            <NotificationsCard />
          </div>
          <div className="order-4 empty:hidden lg:order-none">
            <InfoCard />
          </div>
          <div className="order-5 lg:hidden">
            <MobileMoreCard />
          </div>
        </div>
      </div>
    </div>
  );
}
