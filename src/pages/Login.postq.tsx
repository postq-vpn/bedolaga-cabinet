import { getLocalizedApiErrorMessage } from '../utils/api-error-display';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../store/auth';
import { useShallow } from 'zustand/shallow';
import { authApi } from '../api/auth';
import { isValidEmail } from '../utils/validation';
import {
  brandingApi,
  getCachedBranding,
  setCachedBranding,
  preloadLogo,
  type BrandingInfo,
  type EmailAuthEnabled,
} from '../api/branding';
import { getAndClearReturnUrl, tokenStorage } from '../utils/token';
import { getApiErrorCode, getApiErrorMessage } from '../utils/api-error';
import { isInTelegramWebApp, getTelegramInitData, useTelegramSDK } from '../hooks/useTelegramSDK';
import { closeMiniApp } from '@telegram-apps/sdk-react';
import TelegramLoginButton from '../components/TelegramLoginButton';
import OAuthProviderIcon from '../components/OAuthProviderIcon';
import { saveOAuthState } from '../utils/oauth';
import { getPendingReferralCode } from '../utils/referral';
import { UsersIcon, EmailIcon, RefreshIcon } from '@/components/icons';
import { CheckEmailCard } from '@/components/auth/CheckEmailCard';
import { SiteHeader } from '../components/postq/SiteHeader';
import { SiteFooter } from '../components/postq/SiteFooter';
import { RdIcon } from '../components/postq/RdIcon';
import { SUPPORT_BOT_URL } from '../components/postq/links';
import { cn } from '@/lib/utils';
import LegalConsent from '../components/LegalConsent';
import LegalConsentGate from '../components/LegalConsentGate';
import { useLegalConsentGate } from '../hooks/useLegalConsentGate';
import { infoApi } from '../api/info';
import type { LegalConsentConfig } from '../types';
import { safeLocal, safeSession } from '../utils/safeStorage';

export default function Login() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    isAuthenticated,
    isLoading: isAuthInitializing,
    loginWithTelegram,
    loginWithEmail,
    registerWithEmail,
  } = useAuthStore(
    useShallow((state) => ({
      isAuthenticated: state.isAuthenticated,
      isLoading: state.isLoading,
      loginWithTelegram: state.loginWithTelegram,
      loginWithEmail: state.loginWithEmail,
      registerWithEmail: state.registerWithEmail,
    })),
  );

  // Get referral code from localStorage (captured from ?ref= param at module level in auth store)
  const referralCode = getPendingReferralCode() || '';

  const [authMode, setAuthMode] = useState<'login' | 'register'>(() =>
    referralCode ? 'register' : 'login',
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isTelegramWebApp, setIsTelegramWebApp] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [forgotPasswordSent, setForgotPasswordSent] = useState(false);
  const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false);
  const [forgotPasswordError, setForgotPasswordError] = useState('');
  const [showTelegramPanel, setShowTelegramPanel] = useState(false);

  // Гейт согласия с офертой/политикой для НОВОГО пользователя. Конфиг публичный:
  // нужен до авторизации, чтобы нарисовать чекбоксы ещё на экране входа.
  const { data: legalConsent } = useQuery<LegalConsentConfig>({
    queryKey: ['legal-consent-config', i18n.language],
    queryFn: () => infoApi.getLegalConsentConfig(i18n.language),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  // Telegram-вход происходит сам собой, поэтому чекбоксы показываем только когда
  // бэк ответил 428: пользователь новый и без согласия аккаунт не создастся.
  // Гейт помнит, какой именно вход повторить после простановки галочек.
  const consent = useLegalConsentGate(legalConsent);

  // Telegram safe area insets
  const { safeAreaInset, contentSafeAreaInset } = useTelegramSDK();
  const safeTop = Math.max(safeAreaInset.top, contentSafeAreaInset.top);
  const safeBottom = Math.max(safeAreaInset.bottom, contentSafeAreaInset.bottom);

  // Получаем URL для возврата после авторизации
  const getReturnUrl = useCallback(() => {
    // Сначала проверяем state от React Router
    const stateFrom = (location.state as { from?: string })?.from;
    if (stateFrom && stateFrom !== '/login') {
      return stateFrom;
    }
    // Затем проверяем сохранённый URL в sessionStorage (от safeRedirectToLogin)
    const savedUrl = getAndClearReturnUrl();
    if (savedUrl && savedUrl !== '/login') {
      return savedUrl;
    }
    // По умолчанию на главную
    return '/';
  }, [location.state]);

  // Fetch branding with unified cache
  const cachedBranding = useMemo(() => getCachedBranding(), []);

  useQuery<BrandingInfo>({
    queryKey: ['branding'],
    queryFn: async () => {
      const data = await brandingApi.getBranding();
      setCachedBranding(data);
      // The page shows the postq logo; the operator logo is preloaded for the cabinet header.
      await preloadLogo(data);
      return data;
    },
    staleTime: 60000,
    initialData: cachedBranding ?? undefined,
    initialDataUpdatedAt: 0,
  });

  // Check if email auth is enabled
  const { data: emailAuthConfig } = useQuery<EmailAuthEnabled>({
    queryKey: ['email-auth-enabled'],
    queryFn: brandingApi.getEmailAuthEnabled,
    staleTime: 60000,
  });
  const isEmailAuthEnabled = emailAuthConfig?.enabled ?? true;

  // Fetch enabled OAuth providers
  const { data: oauthData } = useQuery({
    queryKey: ['oauth-providers'],
    queryFn: authApi.getOAuthProviders,
    staleTime: 60000,
  });
  const oauthProviders = Array.isArray(oauthData?.providers) ? oauthData.providers : [];

  const [oauthLoading, setOauthLoading] = useState<string | null>(null);

  const handleOAuthLogin = async (provider: string) => {
    setError('');
    setOauthLoading(provider);
    try {
      const { authorize_url, state } = await authApi.getOAuthAuthorizeUrl(provider);

      // Validate redirect URL — only allow HTTPS to prevent open redirect
      let parsed: URL;
      try {
        parsed = new URL(authorize_url);
      } catch {
        throw new Error('Invalid OAuth redirect URL');
      }
      if (parsed.protocol !== 'https:') {
        throw new Error('Invalid OAuth redirect URL');
      }

      if (!saveOAuthState(state, provider)) {
        // Уйти к провайдеру без сохранённого state — значит гарантированно не
        // вернуться в логин: та же ошибка, что и раньше, но без потери страницы.
        throw new Error('OAuth state is not persistable');
      }
      window.location.href = authorize_url;
    } catch {
      setError(t('auth.oauthError', 'Authorization was denied or failed'));
      setOauthLoading(null);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      navigate(getReturnUrl(), { replace: true });
    }
  }, [isAuthenticated, navigate, getReturnUrl]);

  // Try Telegram WebApp authentication on mount (with auto-retry on 401)
  // Wait for auth store initialization to complete to avoid race conditions
  // with stale tokens triggering interceptor refresh/redirect loops
  useEffect(() => {
    // Don't attempt Telegram auth until store initialization is done
    if (isAuthInitializing) return;

    const tryTelegramAuth = async () => {
      const initialInitData = getTelegramInitData();
      if (!isInTelegramWebApp() || !initialInitData) return;

      setIsTelegramWebApp(true);
      setIsLoading(true);

      const MAX_RETRIES = 1;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        // The bridge may deliver fresh launch data while a rejected attempt waits.
        // Keep this attempt's credential for any subsequent consent confirmation.
        const initData = getTelegramInitData() || initialInitData;
        try {
          await loginWithTelegram(initData);
          navigate(getReturnUrl(), { replace: true });
          return;
        } catch (err) {
          const error = err as { response?: { status?: number } };
          const status = error.response?.status;
          const detail = getApiErrorMessage(err, '');
          if (import.meta.env.DEV)
            console.warn(`Telegram auth attempt ${attempt + 1} failed:`, status, detail);

          // Не ошибка входа, а недостающее согласие: показываем чекбоксы.
          const needsConsent = consent.capture(err, async (accepted) => {
            await loginWithTelegram(initData, accepted);
            navigate(getReturnUrl(), { replace: true });
          });
          if (needsConsent) {
            setIsLoading(false);
            return;
          }

          if (status === 401 && attempt < MAX_RETRIES) {
            await new Promise((r) => setTimeout(r, 1500));
            continue;
          }

          // Show backend error detail if available, otherwise generic message
          setError(getLocalizedApiErrorMessage(err, t('auth.telegramRequired'), t));
        }
      }

      setIsLoading(false);
    };

    tryTelegramAuth();
  }, [isAuthInitializing, loginWithTelegram, navigate, t, getReturnUrl, consent.capture]);

  const handleRetryTelegramAuth = () => {
    // Clear ALL cached auth state to prevent stale token/initData loops
    tokenStorage.clearTokens();
    safeSession.removeItem('tapps/launchParams');
    safeSession.removeItem('telegram_init_data');
    safeLocal.removeItem('cabinet-auth');
    safeLocal.removeItem('tg_user_id');

    try {
      // Close miniapp — Telegram will provide fresh initData on reopen
      closeMiniApp();
    } catch {
      // If closeMiniApp fails, force a clean page reload
      window.location.reload();
    }
  };

  const handleEmailSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setError('');

    // Валидация email
    if (!email.trim() || !isValidEmail(email.trim())) {
      setError(t('auth.invalidEmail', 'Please enter a valid email address'));
      return;
    }

    if (authMode === 'register') {
      // Валидация для регистрации
      if (password !== confirmPassword) {
        setError(t('auth.passwordMismatch', 'Passwords do not match'));
        return;
      }
      if (password.length < 8) {
        setError(t('auth.passwordTooShort', 'Password must be at least 8 characters'));
        return;
      }
    }

    setIsLoading(true);

    try {
      if (authMode === 'login') {
        await loginWithEmail(email, password);
        navigate(getReturnUrl(), { replace: true });
      } else {
        const result = await registerWithEmail(
          email,
          password,
          firstName || undefined,
          referralCode || undefined,
          consent.acceptedKeys,
        );
        // Show "check your email" screen
        setRegisteredEmail(result.email);
      }
    } catch (err: unknown) {
      const error = err as { response?: { status?: number } };
      const status = error.response?.status;
      const detail = getApiErrorMessage(err, '');

      // Конфиг чекбоксов мог протухнуть (админ включил гейт между загрузкой страницы
      // и отправкой формы) — показываем недостающие галочки вместо сырой ошибки.
      const needsConsent = consent.capture(err, async (accepted) => {
        const retried = await registerWithEmail(
          email,
          password,
          firstName || undefined,
          referralCode || undefined,
          accepted,
        );
        setRegisteredEmail(retried.email);
      });
      if (needsConsent) {
        setIsLoading(false);
        return;
      }

      if (status === 403 && getApiErrorCode(err) === 'email_auth_disabled') {
        setError(
          t(
            'auth.emailAuthDisabled',
            'Email sign-in is disabled. Use another available sign-in method.',
          ),
        );
      } else if (status === 403 && getApiErrorCode(err) === 'registration_invite_required') {
        setError(
          t(
            'auth.registrationInviteRequired',
            'Registration is by invitation only. Ask the service administrator for an invitation.',
          ),
        );
      } else if (status === 400 && detail.includes('already registered')) {
        setError(t('auth.emailAlreadyRegistered', 'This email is already registered'));
      } else if (status === 401 || status === 403) {
        if (detail.includes('verify your email')) {
          setError(t('auth.emailNotVerified', 'Please verify your email first'));
        } else {
          setError(t('auth.invalidCredentials', 'Invalid email or password'));
        }
      } else if (status === 429) {
        setError(t('auth.tooManyAttempts', 'Too many attempts. Please try again later'));
      } else {
        setError(getLocalizedApiErrorMessage(err, t('common.error'), t));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setForgotPasswordError('');

    if (!forgotPasswordEmail.trim() || !isValidEmail(forgotPasswordEmail.trim())) {
      setForgotPasswordError(t('auth.invalidEmail', 'Please enter a valid email address'));
      return;
    }

    setForgotPasswordLoading(true);
    try {
      await authApi.forgotPassword(forgotPasswordEmail.trim());
      setForgotPasswordSent(true);
    } catch (err: unknown) {
      setForgotPasswordError(getLocalizedApiErrorMessage(err, t('common.error'), t));
    } finally {
      setForgotPasswordLoading(false);
    }
  };

  const closeForgotPasswordModal = () => {
    setShowForgotPassword(false);
    setForgotPasswordEmail('');
    setForgotPasswordSent(false);
    setForgotPasswordError('');
  };

  // Telegram is one of the service tiles; its widget/OIDC/deep-link flow opens
  // in a panel under the row. Without other ways in, it's open from the start.
  const telegramOnly = !isEmailAuthEnabled && oauthProviders.length === 0;
  const telegramOpen = showTelegramPanel || telegramOnly;

  const switchAuthMode = (mode: 'login' | 'register') => {
    setAuthMode(mode);
    setError('');
  };

  return (
    <div className="flex min-h-screen flex-col bg-[var(--rd-page)]">
      <SiteHeader safeTop={safeTop} />

      <main
        className="flex flex-1 flex-col items-center px-4 sm:px-6"
        style={{
          paddingTop: `calc(clamp(112px, 16vw, 256px) + ${safeTop}px)`,
          paddingBottom: `calc(clamp(64px, 9vw, 128px) + ${safeBottom}px)`,
        }}
      >
        <div className="flex w-full max-w-[560px] flex-col items-center gap-6">
          {referralCode && isEmailAuthEnabled && (
            <div className="rd-p-md flex w-full items-center justify-center gap-2 rounded-[var(--rd-radius-control)] bg-[var(--rd-help)] px-6 py-4 text-center text-[var(--rd-on-soft)]">
              <UsersIcon className="h-4 w-4 flex-shrink-0" />
              <span>{t('auth.referralInvite')}</span>
            </div>
          )}

          {/* Экран согласия: бэк ответил 428 на автоматический Telegram-вход или регистрацию */}
          {consent.pending ? (
            <LegalConsentGate gate={consent} className="w-full !p-6 sm:!p-8" />
          ) : registeredEmail ? (
            <CheckEmailCard
              email={registeredEmail}
              className="w-full !p-6 sm:!p-8"
              onBackToLogin={() => {
                setRegisteredEmail(null);
                setAuthMode('login');
              }}
              onChangeEmail={() => {
                // Адрес остаётся в поле: чаще всего его не меняют, а правят опечатку.
                setEmail(registeredEmail);
                setRegisteredEmail(null);
                setAuthMode('register');
              }}
            />
          ) : (
            <section
              aria-label={t('auth.login')}
              className="rd-card flex w-full flex-col gap-6 sm:!p-8"
            >
              {error && (
                <div
                  role="alert"
                  className="rd-p-md rounded-[var(--rd-radius-sm)] bg-[var(--rd-error-bg)] px-6 py-4 text-[var(--rd-error-text)]"
                >
                  {error}
                </div>
              )}

              {isTelegramWebApp && isLoading ? (
                <div className="flex flex-col items-center gap-3 py-6 text-center">
                  <span className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--rd-action)] border-t-transparent" />
                  <p className="rd-p-md text-[var(--rd-caption)]">{t('auth.authenticating')}</p>
                </div>
              ) : isTelegramWebApp && error ? (
                <div className="flex flex-col items-center gap-3 text-center">
                  <button type="button" onClick={handleRetryTelegramAuth} className="rd-btn w-full">
                    <RefreshIcon className="h-4 w-4" />
                    {t('auth.tryAgain')}
                  </button>
                  <p className="rd-p-sm text-[var(--rd-caption)]">
                    {t(
                      'auth.telegramReopenHint',
                      'If the problem persists, close and reopen the app',
                    )}
                  </p>
                </div>
              ) : null}

              {isEmailAuthEnabled &&
                (showForgotPassword ? (
                  forgotPasswordSent ? (
                    <div className="flex flex-col items-center gap-4 text-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-[var(--rd-radius-sm)] bg-[var(--rd-help)] text-[var(--rd-action)]">
                        <EmailIcon className="h-6 w-6" />
                      </div>
                      <p className="rd-h6 text-[var(--rd-heading)]">
                        {t('auth.checkEmail', 'Check your email')}
                      </p>
                      <p className="rd-p-md text-[var(--rd-caption)]">
                        {t(
                          'auth.passwordResetSent',
                          'If an account exists with this email, we sent password reset instructions.',
                        )}
                      </p>
                      {/* Тот же тупик, что и после регистрации: письма нет,
                          и человек не знает, где смотреть. */}
                      <p className="rd-p-md w-full rounded-[var(--rd-radius-sm)] bg-[var(--rd-field)] px-6 py-4 text-left text-[var(--rd-caption)]">
                        {t('auth.spamHint')}
                      </p>
                      <button
                        type="button"
                        onClick={closeForgotPasswordModal}
                        className="rd-link-action rd-p-md"
                      >
                        {t('common.back', 'Back')}
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-5">
                      <p className="rd-p-md text-center text-[var(--rd-caption)]">
                        {t(
                          'auth.forgotPasswordHint',
                          'Enter your email and we will send you instructions to reset your password.',
                        )}
                      </p>
                      <form onSubmit={handleForgotPassword} className="flex flex-col gap-5">
                        <AuthField id="forgotEmail" label={t('auth.email')}>
                          <input
                            id="forgotEmail"
                            type="email"
                            autoComplete="email"
                            value={forgotPasswordEmail}
                            onChange={(e) => setForgotPasswordEmail(e.target.value)}
                            placeholder="you@example.com"
                            autoFocus
                          />
                        </AuthField>
                        {forgotPasswordError && (
                          <p role="alert" className="rd-p-md text-[var(--rd-error-text)]">
                            {forgotPasswordError}
                          </p>
                        )}
                        <button
                          type="submit"
                          disabled={forgotPasswordLoading}
                          className="rd-btn w-full"
                        >
                          {forgotPasswordLoading ? (
                            <>
                              <Spinner />
                              {t('common.loading')}
                            </>
                          ) : (
                            t('auth.sendResetLink', 'Send reset link')
                          )}
                        </button>
                      </form>
                      <button
                        type="button"
                        onClick={closeForgotPasswordModal}
                        className="rd-link rd-p-md self-center"
                      >
                        {t('common.back', 'Back')}
                      </button>
                    </div>
                  )
                ) : (
                  <div className="flex flex-col gap-5">
                    {/* Вход / Регистрация */}
                    <div
                      role="tablist"
                      aria-label={t('auth.loginWithEmail')}
                      className="flex rounded-[16px] bg-[var(--rd-field)] p-1"
                    >
                      {(['login', 'register'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          role="tab"
                          aria-selected={authMode === mode}
                          onClick={() => switchAuthMode(mode)}
                          className={cn(
                            'rd-p-md h-11 flex-1 rounded-[12px] transition-colors',
                            authMode === mode
                              ? 'bg-[var(--rd-surface)] font-medium text-[var(--rd-action)]'
                              : 'text-[var(--rd-caption)] hover:text-[var(--rd-heading)]',
                          )}
                        >
                          {mode === 'login' ? t('auth.login') : t('auth.register', 'Register')}
                        </button>
                      ))}
                    </div>

                    <form className="flex flex-col gap-5" onSubmit={handleEmailSubmit}>
                      <div className="flex flex-col gap-4">
                        {authMode === 'register' && (
                          <AuthField id="firstName" label={t('auth.firstName', 'First Name')}>
                            <input
                              id="firstName"
                              name="firstName"
                              type="text"
                              autoComplete="given-name"
                              placeholder={t('auth.firstNamePlaceholder', 'Your name (optional)')}
                              value={firstName}
                              onChange={(e) => setFirstName(e.target.value)}
                            />
                          </AuthField>
                        )}

                        <AuthField id="email" label={t('auth.email')}>
                          <input
                            id="email"
                            name="email"
                            type="email"
                            autoComplete="email"
                            required
                            placeholder="you@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                          />
                        </AuthField>

                        <PasswordField
                          id="password"
                          label={t('auth.password')}
                          value={password}
                          onChange={setPassword}
                          autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                          placeholder={t('auth.passwordPlaceholder', 'Введите пароль')}
                          hint={
                            authMode === 'register' && password.length > 0 && password.length < 8
                              ? t('auth.passwordTooShort', 'Password must be at least 8 characters')
                              : undefined
                          }
                        />

                        {authMode === 'register' && (
                          <PasswordField
                            id="confirmPassword"
                            label={t('auth.confirmPassword', 'Confirm Password')}
                            value={confirmPassword}
                            onChange={setConfirmPassword}
                            autoComplete="new-password"
                            placeholder={t('auth.passwordPlaceholder', 'Введите пароль')}
                          />
                        )}

                        {authMode === 'register' && (
                          <LegalConsent
                            documents={consent.documents}
                            accepted={consent.accepted}
                            onChange={consent.toggle}
                            disabled={isLoading}
                          />
                        )}
                      </div>

                      <button
                        type="submit"
                        disabled={isLoading || (authMode === 'register' && !consent.allAccepted)}
                        className="rd-btn w-full"
                      >
                        {isLoading ? (
                          <>
                            <Spinner />
                            {t('common.loading')}
                          </>
                        ) : authMode === 'login' ? (
                          t('auth.signIn')
                        ) : (
                          t('auth.register', 'Register')
                        )}
                      </button>
                    </form>

                    {authMode === 'register' ? (
                      <p className="rd-p-sm text-center text-[var(--rd-caption)]">
                        {t(
                          'auth.verificationEmailNotice',
                          'After registration, a verification email will be sent to your address',
                        )}
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setForgotPasswordEmail(email);
                          setShowForgotPassword(true);
                        }}
                        className="rd-link-action rd-p-md self-center"
                      >
                        {t('auth.forgotPassword', 'Forgot password?')}
                      </button>
                    )}
                  </div>
                ))}

              {!(isTelegramWebApp && (isLoading || error)) && (
                <>
                  {isEmailAuthEnabled && (
                    <div className="flex items-center gap-4">
                      <div className="h-px flex-1 bg-[var(--rd-border)]" />
                      <span className="rd-p-sm text-[var(--rd-caption)]">
                        {t('auth.otherServices', 'или через другие сервисы')}
                      </span>
                      <div className="h-px flex-1 bg-[var(--rd-border)]" />
                    </div>
                  )}

                  {!telegramOnly && (
                    <div className="grid grid-cols-2 gap-3 sm:flex">
                      <ServiceTile
                        label="Telegram"
                        icon={
                          <img src="/redesign/auth/telegram.svg" alt="" width={27} height={22} />
                        }
                        pressed={telegramOpen}
                        onClick={() => setShowTelegramPanel((v) => !v)}
                      />
                      {oauthProviders.map((provider) => (
                        <ServiceTile
                          key={provider.name}
                          label={provider.display_name}
                          icon={<ProviderIcon provider={provider.name} />}
                          loading={oauthLoading === provider.name}
                          disabled={oauthLoading !== null}
                          onClick={() => handleOAuthLogin(provider.name)}
                        />
                      ))}
                    </div>
                  )}

                  {telegramOpen && (
                    <div className="flex justify-center rounded-[var(--rd-radius-sm)] bg-[var(--rd-field)] p-6">
                      <TelegramLoginButton referralCode={referralCode || undefined} />
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          <p className="rd-p-md text-center text-[var(--rd-caption)]">
            {t('auth.cantLogin', 'Не получается войти?')}{' '}
            <a
              href={SUPPORT_BOT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rd-link-action"
            >
              {t('auth.contactSupport', 'Написать в поддержку')}
            </a>
          </p>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

function Spinner() {
  return (
    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
  );
}

/** Label + 56px field (Figma "Поле авторизации"). */
function AuthField({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="rd-p-md text-[var(--rd-heading)]">
        {label}
      </label>
      <div className="rd-field">{children}</div>
      {hint && <p className="rd-p-sm text-[var(--rd-error-text)]">{hint}</p>}
    </div>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  placeholder: string;
  hint?: string;
}) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  return (
    <AuthField id={id} label={label} hint={hint}>
      <input
        id={id}
        name={id}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        required
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={
          visible
            ? t('auth.hidePassword', 'Скрыть пароль')
            : t('auth.showPassword', 'Показать пароль')
        }
        aria-pressed={visible}
        className="flex text-[var(--rd-placeholder)] transition-colors hover:text-[var(--rd-caption)]"
      >
        <RdIcon name={visible ? 'auth/eye' : 'auth/eye-off'} size={20} />
      </button>
    </AuthField>
  );
}

/** One of the "или через другие сервисы" tiles (Figma "Способ входа"). */
function ServiceTile({
  label,
  icon,
  onClick,
  pressed,
  loading = false,
  disabled = false,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  pressed?: boolean;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      className={cn(
        'flex h-[76px] min-w-0 flex-1 flex-col items-center justify-center gap-2 rounded-[var(--rd-radius-sm)] border bg-[var(--rd-field)] transition-colors hover:bg-[var(--rd-chip-hover)] disabled:opacity-50',
        pressed ? 'border-[var(--rd-action)]' : 'border-transparent',
      )}
    >
      <span className="flex h-6 items-center justify-center">
        {loading ? (
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--rd-placeholder)] border-t-[var(--rd-action)]" />
        ) : (
          icon
        )}
      </span>
      <span className="rd-p-md max-w-full truncate px-2 text-[var(--rd-heading)]">{label}</span>
    </button>
  );
}

function ProviderIcon({ provider }: { provider: string }) {
  switch (provider) {
    case 'google':
      return <img src="/redesign/auth/google.svg" alt="" width={24} height={24} />;
    case 'discord':
      return <img src="/redesign/auth/discord.svg" alt="" width={24} height={24} />;
    case 'yandex':
      return <img src="/redesign/auth/yandex.svg" alt="" width={24} height={24} />;
    default:
      return <OAuthProviderIcon provider={provider} className="h-6 w-6" />;
  }
}
