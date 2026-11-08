import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { authApi } from '@/api/auth';
import { brandingApi, type TelegramWidgetConfig } from '@/api/branding';
import { getTelegramInitData } from '@/hooks/useTelegramSDK';
import { getLocalizedApiErrorMessage } from '@/utils/api-error-display';
import { getErrorDetail } from '@/utils/oauth';

const SCRIPT_TIMEOUT_MS = 8000;
const WIDGET_CALLBACK = '__onPostqTelegramLink';

type LinkResult = Awaited<ReturnType<typeof authApi.linkTelegram>>;

/**
 * «Привязать» for Telegram, right in the profile row — no separate page.
 * Telegram has to vouch for the account, so the button starts whichever proof
 * is available:
 * - inside the Mini App: its initData, linked at once;
 * - OIDC configured: Telegram's login popup;
 * - otherwise: the classic login widget, laid invisibly over the text button
 *   so the click lands on Telegram's own button and opens its popup.
 */
export function TelegramLinkButton({ onError }: { onError: (message: string | null) => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const widgetRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const initData = getTelegramInitData();
  const { data: config } = useQuery<TelegramWidgetConfig>({
    queryKey: ['telegram-widget-config'],
    queryFn: brandingApi.getTelegramWidgetConfig,
    staleTime: 60000,
    enabled: !initData,
  });
  const botUsername = config?.bot_username || import.meta.env.VITE_TELEGRAM_BOT_USERNAME || '';
  const isOIDC = Boolean(config?.oidc_enabled && config?.oidc_client_id);

  const linkWith = async (payload: Parameters<typeof authApi.linkTelegram>[0]) => {
    setBusy(true);
    onError(null);
    try {
      const response: LinkResult = await authApi.linkTelegram(payload);
      if (response.merge_required && response.merge_token) {
        navigate(`/merge/${response.merge_token}`, { replace: true });
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['linked-providers'] });
      await queryClient.invalidateQueries({ queryKey: ['user'] });
    } catch (err) {
      onError(
        getLocalizedApiErrorMessage(err, getErrorDetail(err) || t('profile.accounts.linkError'), t),
      );
    } finally {
      setBusy(false);
    }
  };
  const linkRef = useRef(linkWith);
  linkRef.current = linkWith;

  // OIDC: load Telegram's login script once and wire the callback.
  useEffect(() => {
    if (initData || !isOIDC || !config?.oidc_client_id) return;
    const init = () => {
      if (!window.Telegram?.Login) return setFailed(true);
      window.Telegram.Login.init(
        {
          client_id: Number(config.oidc_client_id) || config.oidc_client_id,
          request_access: config.request_access ? ['write'] : undefined,
          lang: document.documentElement.lang || 'en',
        },
        (data) => {
          if (data.id_token) void linkRef.current({ id_token: data.id_token });
          else {
            setBusy(false);
            if (data.error) onError(t('profile.accounts.linkError'));
          }
        },
      );
      setReady(true);
    };
    const id = 'telegram-login-oidc-script';
    if (document.getElementById(id)) return init();
    const timer = setTimeout(() => setFailed(true), SCRIPT_TIMEOUT_MS);
    const script = document.createElement('script');
    script.id = id;
    script.src = 'https://oauth.telegram.org/js/telegram-login.js?3';
    script.async = true;
    script.onload = () => {
      clearTimeout(timer);
      init();
    };
    script.onerror = () => {
      clearTimeout(timer);
      setFailed(true);
    };
    document.head.appendChild(script);
    return () => clearTimeout(timer);
  }, [initData, isOIDC, config?.oidc_client_id, config?.request_access, onError, t]);

  // Classic widget: Telegram's iframe button, kept transparent under ours.
  useEffect(() => {
    const box = widgetRef.current;
    if (initData || isOIDC || !botUsername || !box) return;
    (window as unknown as Record<string, unknown>)[WIDGET_CALLBACK] = (
      user: Record<string, unknown>,
    ) =>
      void linkRef.current({
        id: user.id as number,
        first_name: user.first_name as string,
        last_name: (user.last_name as string) || undefined,
        username: (user.username as string) || undefined,
        photo_url: (user.photo_url as string) || undefined,
        auth_date: user.auth_date as number,
        hash: user.hash as string,
      });
    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?23';
    script.async = true;
    script.setAttribute('data-telegram-login', botUsername);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-userpic', 'false');
    script.setAttribute('data-request-access', 'write');
    script.setAttribute('data-onauth', `${WIDGET_CALLBACK}(user)`);
    const timer = setTimeout(() => {
      if (box.querySelector('iframe')) setReady(true);
      else setFailed(true);
    }, SCRIPT_TIMEOUT_MS);
    const observer = new MutationObserver(() => {
      if (box.querySelector('iframe')) {
        clearTimeout(timer);
        setReady(true);
        observer.disconnect();
      }
    });
    observer.observe(box, { childList: true, subtree: true });
    script.onerror = () => {
      clearTimeout(timer);
      setFailed(true);
    };
    box.appendChild(script);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
      delete (window as unknown as Record<string, unknown>)[WIDGET_CALLBACK];
      box.replaceChildren();
    };
  }, [initData, isOIDC, botUsername]);

  const label = busy ? t('common.loading') : t('postq.profile.link');
  const unavailable = failed || (!initData && config && !botUsername && !isOIDC);

  const onClick = () => {
    if (busy) return;
    if (initData) return void linkWith({ init_data: initData });
    if (unavailable) {
      onError(
        botUsername
          ? `${t('profile.accounts.telegramLinkUnavailable')} @${botUsername}`
          : t('profile.accounts.linkError'),
      );
      return;
    }
    if (isOIDC && ready && window.Telegram?.Login) {
      setBusy(true);
      window.Telegram.Login.open();
    }
  };

  return (
    <span className="relative shrink-0">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="rd-p-md rd-link-action disabled:opacity-60"
      >
        {label}
      </button>
      {/* Classic widget only: Telegram's own button, invisible, on top of ours
          so a tap opens its sign-in popup. */}
      {!initData && !isOIDC && !failed && (
        <div
          ref={widgetRef}
          aria-hidden
          className="absolute inset-0 overflow-hidden opacity-[0.01] [&_iframe]:!h-full [&_iframe]:!w-full"
        />
      )}
    </span>
  );
}
