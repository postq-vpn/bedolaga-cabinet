// Links shared by the cabinet's header and footer. Kept in sync with
// postq-site/src/components/redesign/RdHeader.tsx and RdFooter.tsx.

export const MARKETING_URL = (import.meta.env.VITE_MARKETING_URL || 'https://postq.space').replace(
  /\/+$/,
  '',
);

export const SUPPORT_BOT_URL = 'https://t.me/postq_vpn_support_bot';

export const SITE_NAV = [
  { label: 'Главная', href: `${MARKETING_URL}/` },
  { label: 'Подписка', href: `${MARKETING_URL}/#pricing` },
  { label: 'Как подключиться', href: `${MARKETING_URL}/#howto` },
  { label: 'FAQ', href: `${MARKETING_URL}/#faq` },
];

export const USEFUL_LINKS = [
  { label: 'Справочный центр', href: `${MARKETING_URL}/help` },
  { label: 'Статус серверов', href: 'https://status.postq.space' },
  { label: 'Узнать мой IP', href: `${MARKETING_URL}/ip` },
];

export const FOOTER_SOCIAL = [
  { label: 'Бот в Telegram', href: 'https://t.me/postq_vpn_bot' },
  { label: 'Новости в Telegram', href: 'https://t.me/postq_news' },
  { label: 'Threads', href: 'https://www.threads.com/@postq_vpn' },
];

export const FOOTER_COLUMNS = [
  {
    title: 'Продукт',
    links: [
      { label: 'Личный кабинет', href: '/' },
      { label: 'Подписка', href: `${MARKETING_URL}/#pricing` },
      { label: 'Как подключиться', href: `${MARKETING_URL}/#howto` },
      { label: 'FAQ', href: `${MARKETING_URL}/#faq` },
    ],
  },
  {
    title: 'Помощь',
    links: [
      { label: 'Справочный центр', href: `${MARKETING_URL}/help` },
      { label: 'Поддержка', href: SUPPORT_BOT_URL },
      { label: 'VPN на роутере', href: `${MARKETING_URL}/help/vpn-on-router` },
      { label: 'Узнать мой IP', href: `${MARKETING_URL}/ip` },
    ],
  },
];

export const FOOTER_LEGAL = [
  { label: 'Политика конфиденциальности', href: `${MARKETING_URL}/privacy` },
  { label: 'Пользовательское соглашение', href: `${MARKETING_URL}/terms` },
  { label: 'hello@postq.space', href: 'mailto:hello@postq.space' },
];

export const PAYMENTS = [
  { src: 'pay-mir', label: 'МИР', w: 38, h: 18 },
  { src: 'pay-visa', label: 'Visa', w: 32, h: 18 },
  { src: 'pay-mastercard', label: 'Mastercard', w: 27, h: 18 },
  { src: 'pay-btc', label: 'Bitcoin', w: 13, h: 18 },
  { src: 'pay-ton', label: 'TON', w: 24, h: 24 },
  { src: 'pay-eth', label: 'Ethereum', w: 12, h: 18 },
  { src: 'pay-usdt', label: 'USDT', w: 17, h: 18 },
];

/** Third-party services open in a new tab; our own (postq) links stay in place. */
export const externalProps = (href: string) =>
  href.startsWith('http') && !href.includes('postq.space')
    ? { target: '_blank', rel: 'noopener noreferrer' }
    : {};
