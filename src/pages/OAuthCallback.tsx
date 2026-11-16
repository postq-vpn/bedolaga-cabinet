import { getLocalizedApiErrorMessage } from '../utils/api-error-display';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/auth';
import { authApi } from '../api/auth';
import {
  peekLinkOAuthState,
  clearLinkOAuthState,
  loadOAuthState,
  clearOAuthState,
  getErrorDetail,
} from '../utils/oauth';
import type { ServerCompleteResponse } from '../types';
import { useToast } from '@/components/Toast';
import { StatusScreen } from '@/components/postq/StatusScreen';

type CallbackMode = 'login' | 'link-browser' | 'link-server';

export default function OAuthCallback() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState('');
  const [errorMode, setErrorMode] = useState<CallbackMode>('login');
  const [serverLinkResult, setServerCompleteResponse] = useState<ServerCompleteResponse | null>(
    null,
  );
  const loginWithOAuth = useAuthStore((state) => state.loginWithOAuth);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const hasRun = useRef(false);
  const { showToast } = useToast();
  // Read before the effect clears the saved states: a login or a linking.
  const [signingIn] = useState(() => !peekLinkOAuthState() && !!loadOAuthState());

  // Handle merge redirect via useEffect (not in render)
  useEffect(() => {
    if (serverLinkResult?.merge_required && serverLinkResult.merge_token) {
      navigate(`/merge/${serverLinkResult.merge_token}`, { replace: true });
    }
  }, [serverLinkResult, navigate]);

  useEffect(() => {
    // Prevent double-fire from React StrictMode
    if (hasRun.current) return;
    hasRun.current = true;

    const code = searchParams.get('code');
    const urlState = searchParams.get('state');
    const deviceId = searchParams.get('device_id');

    if (!code || !urlState) {
      setError(t('auth.oauthError', 'Authorization was denied or failed'));
      return;
    }

    // Determine callback mode:
    // 1. Link state in sessionStorage → browser linking flow
    // 2. Login state in sessionStorage → login flow
    // 3. Neither → opened from external browser (Mini App flow) → server-complete
    let mode: CallbackMode = 'link-server';
    let provider: string | undefined;
    let state: string | undefined;

    const linkSaved = peekLinkOAuthState();
    if (linkSaved && linkSaved.state === urlState) {
      clearLinkOAuthState();
      mode = 'link-browser';
      provider = linkSaved.provider;
      state = linkSaved.state;
    } else {
      const loginSaved = loadOAuthState();
      if (loginSaved && loginSaved.state === urlState) {
        clearOAuthState();
        mode = 'login';
        provider = loginSaved.provider;
        state = loginSaved.state;
      }
    }

    const handle = async () => {
      // Clear sensitive OAuth params (code, state) from URL immediately for all modes
      window.history.replaceState({}, '', '/auth/oauth/callback');

      if (mode === 'link-browser' && provider && state) {
        // Browser linking: user is authenticated, complete via JWT-protected endpoint
        try {
          const response = await authApi.linkProviderCallback(
            provider,
            code,
            state,
            deviceId ?? undefined,
          );
          if (response.merge_required && response.merge_token) {
            navigate(`/merge/${response.merge_token}`, { replace: true });
          } else {
            showToast({ type: 'success', message: t('postq.authStatus.linked') });
            navigate('/profile', { replace: true });
          }
        } catch (err: unknown) {
          setErrorMode('link-browser');
          setError(
            getLocalizedApiErrorMessage(
              err,
              getErrorDetail(err) || t('postq.authStatus.linkFailed'),
              t,
            ),
          );
        }
        return;
      }

      if (mode === 'login' && provider && state) {
        // Login flow
        if (isAuthenticated) {
          navigate('/', { replace: true });
          return;
        }
        try {
          await loginWithOAuth(provider, code, state, deviceId);
          navigate('/', { replace: true });
        } catch (err: unknown) {
          const detail = getErrorDetail(err);
          setError(
            getLocalizedApiErrorMessage(
              err,
              detail || t('auth.oauthError', 'Authorization was denied or failed'),
              t,
            ),
          );
        }
        return;
      }

      // mode === 'link-server': No sessionStorage state found.
      // This happens when OAuth was opened in external browser from Mini App.
      // Complete linking via state-token-authenticated server endpoint.
      try {
        // Provider is resolved server-side from the state token in Redis.
        const response = await authApi.linkServerComplete(code, urlState, deviceId ?? undefined);
        setServerCompleteResponse(response);
      } catch (err: unknown) {
        setErrorMode('link-server');
        setError(
          getLocalizedApiErrorMessage(
            err,
            getErrorDetail(err) || t('postq.authStatus.linkFailed'),
            t,
          ),
        );
      }
    };

    handle();
  }, [searchParams, loginWithOAuth, navigate, isAuthenticated, showToast, t]);

  const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || '';
  const telegramLink = botUsername ? `https://t.me/${botUsername}` : '';
  const openTelegram = telegramLink && (
    <a href={telegramLink} className="rd-btn w-full no-underline">
      {t('postq.authStatus.openTelegram')}
    </a>
  );

  // Linked from the Mini App in an outside browser: the way on is back to
  // Telegram (a merge redirect is handled by the effect above).
  if (
    serverLinkResult?.success &&
    !(serverLinkResult.merge_required && serverLinkResult.merge_token)
  ) {
    return (
      <StatusScreen
        state="success"
        title={t('postq.authStatus.linked')}
        text={t('postq.authStatus.backToTelegram')}
      >
        {openTelegram}
      </StatusScreen>
    );
  }

  if (error) {
    const linking = errorMode !== 'login';
    return (
      <StatusScreen
        state="error"
        title={t(linking ? 'postq.authStatus.linkFailed' : 'postq.authStatus.loginFailed')}
        text={error}
      >
        {errorMode === 'link-server' && telegramLink ? (
          openTelegram
        ) : (
          <button
            type="button"
            onClick={() => navigate(linking ? '/profile' : '/login', { replace: true })}
            className="rd-btn w-full"
          >
            {t(linking ? 'postq.authStatus.toProfile' : 'postq.authStatus.toLogin')}
          </button>
        )}
      </StatusScreen>
    );
  }

  return (
    <StatusScreen
      state="loading"
      title={t(signingIn ? 'postq.authStatus.signingIn' : 'postq.authStatus.linking')}
      text={t('postq.authStatus.wait')}
    />
  );
}
