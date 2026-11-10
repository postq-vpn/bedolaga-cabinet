import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { authApi } from '@/api/auth';
import { usePlatform } from '@/platform';
import { useIsTelegram } from '@/platform/hooks/usePlatform';
import { saveLinkOAuthState } from '@/utils/oauth';
import OAuthProviderIcon from '@/components/OAuthProviderIcon';
import { TelegramLinkButton } from './TelegramLinkButton';

function ProviderGlyph({ provider }: { provider: string }) {
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

/** Telegram row + "Другие способы входа" tiles (Figma «Способы входа»). */
export function LoginMethods({ telegramUsername }: { telegramUsername: string | null }) {
  const { t } = useTranslation();
  const platform = usePlatform();
  const inTelegram = useIsTelegram();
  const [linking, setLinking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [telegramError, setTelegramError] = useState<string | null>(null);

  const { data: linked } = useQuery({
    queryKey: ['linked-providers'],
    queryFn: () => authApi.getLinkedProviders(),
  });
  const { data: available } = useQuery({
    queryKey: ['oauth-providers'],
    queryFn: authApi.getOAuthProviders,
    staleTime: 60000,
  });

  const isLinked = (name: string) =>
    linked?.providers.some((p) => p.provider === name && p.linked) ?? false;
  const telegramLinked = isLinked('telegram');
  const providers = Array.isArray(available?.providers) ? available.providers : [];

  const link = async (provider: string) => {
    if (linking) return;
    setLinking(provider);
    setError(null);
    try {
      const { authorize_url, state } = await authApi.linkProviderInit(provider);
      if (!authorize_url || !state || new URL(authorize_url).protocol !== 'https:') {
        throw new Error('Invalid OAuth redirect URL');
      }
      if (inTelegram) {
        // Mini App: OAuth runs in the external browser (WebView restrictions).
        platform.openLink(authorize_url);
        setLinking(null);
        return;
      }
      if (!saveLinkOAuthState(state, provider)) throw new Error('OAuth state is not persistable');
      window.location.href = authorize_url;
    } catch {
      setError(t('profile.accounts.linkError'));
      setLinking(null);
    }
  };

  return (
    <>
      {/* Same plain row as Email above: name and detail, status as text. */}
      <div className="flex items-start justify-between gap-4">
        <div className="rd-p-md flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-medium text-[var(--rd-heading)]">Telegram</span>
          <span className="break-words text-[var(--rd-caption)]">
            {telegramLinked
              ? t('postq.profile.telegramPrimary', {
                  name: telegramUsername ? `@${telegramUsername}` : 'Telegram',
                })
              : t('postq.profile.telegramNotLinked')}
          </span>
        </div>
        {telegramLinked ? (
          <span className="rd-p-md shrink-0 text-[var(--rd-success-text)]">
            {t('postq.profile.linked')}
          </span>
        ) : (
          <TelegramLinkButton onError={setTelegramError} />
        )}
      </div>
      {telegramError && (
        <p role="alert" className="rd-p-sm -mt-2 break-words text-[var(--rd-error-text)]">
          {telegramError}
        </p>
      )}

      {providers.length > 0 && (
        <>
          <div className="h-px w-full bg-[var(--rd-divider)]" />
          <div className="flex flex-col gap-3">
            <span className="rd-p-md text-[var(--rd-caption)]">
              {t('postq.profile.otherMethods')}
            </span>
            {/* Cards: one compact row each on phones, tiles in three columns wider. */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
              {providers.map((p) => {
                const done = isLinked(p.name);
                return (
                  <button
                    key={p.name}
                    type="button"
                    disabled={done || linking !== null}
                    onClick={() => void link(p.name)}
                    className="flex items-center gap-3 rounded-[var(--rd-radius-sm)] bg-[var(--rd-field)] p-4 text-left transition-colors enabled:hover:bg-[var(--rd-chip-hover)] disabled:cursor-default"
                  >
                    <span className="flex w-8 shrink-0 justify-center">
                      <ProviderGlyph provider={p.name} />
                    </span>
                    <span className="rd-p-md flex min-w-0 flex-1 items-center justify-between gap-4 sm:flex-col sm:items-start sm:justify-start sm:gap-1">
                      <span className="truncate font-medium text-[var(--rd-heading)]">
                        {p.display_name}
                      </span>
                      <span
                        className={
                          done ? 'text-[var(--rd-success-text)]' : 'text-[var(--rd-action)]'
                        }
                      >
                        {linking === p.name
                          ? t('common.loading')
                          : done
                            ? t('postq.profile.linked')
                            : t('postq.profile.link')}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            {error && (
              <p role="alert" className="rd-p-sm text-[var(--rd-error-text)]">
                {error}
              </p>
            )}
          </div>
        </>
      )}
    </>
  );
}
