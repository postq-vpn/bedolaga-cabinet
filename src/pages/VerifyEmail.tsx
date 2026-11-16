import { getLocalizedApiErrorMessage } from '../utils/api-error-display';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router';
import { StatusScreen } from '@/components/postq/StatusScreen';
import { useTranslation } from 'react-i18next';
import { authApi } from '../api/auth';
import { useAuthStore } from '../store/auth';
import { useShallow } from 'zustand/shallow';
import { consumeCampaignSlug, getPendingCampaignSlug } from '../utils/campaign';
import { tokenStorage } from '../utils/token';

export default function VerifyEmail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState('');
  const { setTokens, setUser, checkAdminStatus } = useAuthStore(
    useShallow((state) => ({
      setTokens: state.setTokens,
      setUser: state.setUser,
      checkAdminStatus: state.checkAdminStatus,
    })),
  );
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const hasVerified = useRef(false);

  useEffect(() => {
    if (hasVerified.current) return;

    const token = searchParams.get('token');

    if (!token) {
      setStatus('error');
      setError(t('postq.authStatus.emailBrokenLink'));
      return;
    }

    hasVerified.current = true;
    let redirectTimer: ReturnType<typeof setTimeout>;

    const verify = async () => {
      try {
        const campaignSlug = getPendingCampaignSlug();
        const response = await authApi.verifyEmail(token, campaignSlug);
        consumeCampaignSlug();
        // Save tokens and log user in
        tokenStorage.setTokens(response.access_token, response.refresh_token);
        setTokens(response.access_token, response.refresh_token);
        setUser(response.user);
        if (response.campaign_bonus) {
          useAuthStore.setState({ pendingCampaignBonus: response.campaign_bonus });
        }
        checkAdminStatus();
        setStatus('success');
        // Redirect to dashboard after short delay
        redirectTimer = setTimeout(() => navigate('/', { replace: true }), 1500);
      } catch (err: unknown) {
        setStatus('error');
        setError(getLocalizedApiErrorMessage(err, t('postq.authStatus.emailFailedText'), t));
      }
    };

    verify();

    return () => clearTimeout(redirectTimer);
  }, [searchParams, t, navigate, setTokens, setUser, checkAdminStatus]);

  if (status === 'loading') {
    return (
      <StatusScreen
        state="loading"
        title={t('postq.authStatus.emailChecking')}
        text={t('postq.authStatus.wait')}
      />
    );
  }

  if (status === 'success') {
    return (
      <StatusScreen
        state="success"
        title={t('postq.authStatus.emailConfirmed')}
        text={t('postq.authStatus.emailConfirmedText')}
      />
    );
  }

  return (
    <StatusScreen state="error" title={t('postq.authStatus.emailFailed')} text={error}>
      <Link to={isAuthenticated ? '/profile' : '/login'} replace className="rd-btn w-full">
        {t(isAuthenticated ? 'postq.authStatus.toProfile' : 'postq.authStatus.toLogin')}
      </Link>
    </StatusScreen>
  );
}
