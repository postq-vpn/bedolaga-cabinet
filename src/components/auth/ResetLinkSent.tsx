import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authApi } from '@/api/auth';
import { useCountdown } from '@/hooks/useCountdown';
import { isRateLimitedError } from '@/utils/api-error';

const RESEND_COOLDOWN_SECONDS = 60;

/**
 * «Проверьте почту» после запроса сброса пароля — как у больших сервисов:
 * куда ушло письмо, повторная отправка через минуту и одна главная кнопка обратно ко входу. Ничего лишнего вроде входа
 * через другие сервисы — человек сейчас ждёт письмо.
 */
export function ResetLinkSent({ email, onBack }: { email: string; onBack: () => void }) {
  const { t } = useTranslation();
  const [cooldown, startCooldown] = useCountdown();
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    startCooldown(RESEND_COOLDOWN_SECONDS);
  }, [startCooldown]);

  const resend = async () => {
    if (cooldown > 0 || sending) return;
    setSending(true);
    setNotice(null);
    try {
      await authApi.forgotPassword(email);
      setNotice({ ok: true, text: t('auth.resendSent') });
    } catch (err) {
      setNotice({
        ok: false,
        text: isRateLimitedError(err) ? t('auth.resendTooOften') : t('auth.resendError'),
      });
    } finally {
      setSending(false);
      startCooldown(RESEND_COOLDOWN_SECONDS);
    }
  };

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="flex flex-col gap-2">
        <h2 className="rd-h6 text-[var(--rd-heading)]">{t('auth.checkEmail')}</h2>
        <p className="rd-p-md text-[var(--rd-caption)]">
          {t('auth.resetLinkSentTo')}
          <br />
          <span className="font-medium break-all text-[var(--rd-heading)]">{email}</span>
        </p>
      </div>

      <div className="flex w-full flex-col gap-3">
        <button type="button" onClick={onBack} className="rd-btn w-full">
          {t('auth.backToLogin')}
        </button>
        <button
          type="button"
          onClick={resend}
          disabled={cooldown > 0 || sending}
          className="rd-p-md h-11 text-[var(--rd-action)] disabled:text-[var(--rd-caption)]"
        >
          {cooldown > 0 ? t('auth.resendIn', { seconds: cooldown }) : t('auth.resendVerification')}
        </button>
        {notice && (
          <p
            role="status"
            className={`rd-p-sm ${notice.ok ? 'text-[var(--rd-success-text)]' : 'text-[var(--rd-error-text)]'}`}
          >
            {notice.text}
          </p>
        )}
      </div>
    </div>
  );
}
