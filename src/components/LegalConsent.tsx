import { useTranslation } from 'react-i18next';

// Галочки «ознакомлен» для НОВОГО пользователя. Набор документов приходит с бэка
// (GET /cabinet/info/legal-consent) — там же решается, включён ли гейт вообще и
// какие документы реально заполнены. Здесь только отрисовка и ссылки: адреса
// публичных страниц знает фронт, бэк отдаёт лишь ключи.

export const LEGAL_DOCUMENT_LINKS: Record<string, string> = {
  public_offer: '/offer',
  privacy_policy: '/privacy',
};

// Названия в том виде, в каком они стоят в фразе «Я принимаю …».
const LEGAL_DOCUMENT_LABELS: Record<string, { key: string; fallback: string }> = {
  public_offer: { key: 'auth.legalDocs.public_offer', fallback: 'условия оферты' },
  privacy_policy: {
    key: 'auth.legalDocs.privacy_policy',
    fallback: 'политику конфиденциальности',
  },
};

interface LegalConsentProps {
  documents: string[];
  accepted: Record<string, boolean>;
  onChange: (document: string, value: boolean) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Одна галочка на все документы, как у больших сервисов: «Я принимаю условия
 * оферты и политику конфиденциальности». Бэк по-прежнему получает согласие на
 * каждый документ — галочка ставит и снимает их все сразу.
 */
export default function LegalConsent({
  documents,
  accepted,
  onChange,
  disabled = false,
  className = '',
}: LegalConsentProps) {
  const { t } = useTranslation();

  if (documents.length === 0) return null;

  const allAccepted = documents.every((document) => accepted[document]);
  const links = documents.map((document) => {
    // Неизвестный ключ всё равно называем: он обязателен на бэке, и молча
    // пропавший документ превратился бы в «кнопка не работает без объяснений».
    const label = LEGAL_DOCUMENT_LABELS[document];
    const href = LEGAL_DOCUMENT_LINKS[document];
    const title = label ? t(label.key, label.fallback) : document;
    return href ? (
      <a
        key={document}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[var(--rd-heading)] underline decoration-[var(--rd-border)] underline-offset-2 transition-colors hover:decoration-current"
        onClick={(e) => e.stopPropagation()}
      >
        {title}
      </a>
    ) : (
      <span key={document} className="text-[var(--rd-heading)]">
        {title}
      </span>
    );
  });

  return (
    <label
      htmlFor="legal-consent"
      className={`rd-p-md flex cursor-pointer items-start gap-3 text-[var(--rd-caption)] ${className}`}
    >
      {/* Высотой в строку текста — галочка по центру первой строки и при переносе. */}
      <span className="flex h-[1lh] shrink-0 items-center">
        <input
          id="legal-consent"
          type="checkbox"
          checked={allAccepted}
          disabled={disabled}
          onChange={(e) => {
            for (const document of documents) onChange(document, e.target.checked);
          }}
          className="m-0 size-[18px] translate-y-px cursor-pointer accent-[var(--rd-action)]"
        />
      </span>
      <span>
        {t('auth.legalAccept', 'Я принимаю')}{' '}
        {links.map((link, index) => (
          <span key={index}>
            {index > 0 && (index === links.length - 1 ? ` ${t('auth.legalAnd', 'и')} ` : ', ')}
            {link}
          </span>
        ))}
      </span>
    </label>
  );
}
