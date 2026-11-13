// Admin tickets (/cabinet/admin/tickets/*) and ticket media (/cabinet/media/*).
// Seeded with a handful of tickets — long texts, tall phone screenshots, a few
// photos in one message, a document — to check the admin chat on a phone.

import { inDays, nowIso } from './state.mjs';

const users = [
  { id: 42, telegram_id: 777000111, username: 'ivan_p', first_name: 'Иван', last_name: 'Петров' },
  { id: 43, telegram_id: 777000222, username: 'marina', first_name: 'Марина', last_name: null },
  { id: 44, telegram_id: 777000333, username: 'k0stya', first_name: null, last_name: null },
  { id: 45, telegram_id: 777000444, username: null, first_name: 'Алексей', last_name: 'С.' },
];

let nextMsgId = 1000;
const m = (text, fromAdmin, at, media = []) => ({
  id: nextMsgId++,
  message_text: text,
  is_from_admin: fromAdmin,
  has_media: media.length > 0,
  media_type: media[0]?.type ?? null,
  media_file_id: media[0]?.file_id ?? null,
  media_caption: null,
  media_items: media.length ? media : null,
  created_at: at,
});
const photo = (file_id) => ({ type: 'photo', file_id, caption: null, token: 'mock' });

const tickets = [
  {
    id: 101,
    title: 'Не подключается на iPhone после обновления',
    status: 'open',
    priority: 'high',
    created_at: inDays(-0.2),
    updated_at: inDays(-0.05),
    closed_at: null,
    is_reply_blocked: false,
    user: users[0],
    messages: [
      m(
        'Здравствуйте! После обновления iOS до 19.1 Happ перестал подключаться. Пишет «handshake timeout». Перезагружал телефон, переустанавливал приложение — не помогает. Скрин ниже.',
        false,
        inDays(-0.2),
        [photo('shot-tall-1')],
      ),
      m('И вот ещё что показывает в логах:', false, inDays(-0.19), [
        photo('shot-tall-2'),
        photo('shot-wide-1'),
        photo('shot-tall-3'),
      ]),
      m(
        'Здравствуйте, Иван! Обновите подписку в приложении (потяните список серверов вниз) и выберите сервер в Финляндии. Если не поможет — пришлите, пожалуйста, ссылку на подписку из кабинета.',
        true,
        inDays(-0.1),
      ),
      m(
        'Не помогло( вот ссылка: https://sub.postq.example/api/sub/aGVsbG8td29ybGQtdGhpcy1pcy1hLXZlcnktbG9uZy10b2tlbg',
        false,
        inDays(-0.05),
      ),
    ],
  },
  {
    id: 102,
    title: 'Двойное списание за продление',
    status: 'pending',
    priority: 'urgent',
    created_at: inDays(-1),
    updated_at: inDays(-0.6),
    closed_at: null,
    is_reply_blocked: false,
    user: users[1],
    messages: [
      m('Списали два раза по 199 ₽, вот чек из банка', false, inDays(-1), [
        photo('shot-tall-4'),
      ]),
      m('Проверяем платёж, вернёмся с ответом в течение часа.', true, inDays(-0.9)),
      m('Есть новости?', false, inDays(-0.6)),
    ],
  },
  {
    id: 103,
    title: 'Как подключить Android TV',
    status: 'answered',
    priority: 'normal',
    created_at: inDays(-2),
    updated_at: inDays(-1.8),
    closed_at: null,
    is_reply_blocked: false,
    user: users[2],
    messages: [
      m('Подскажите, как поставить на телевизор?', false, inDays(-2)),
      m(
        'Установите Happ из Google Play на телевизоре, затем на странице «Подключение» выберите Android TV и отсканируйте QR-код телефоном.',
        true,
        inDays(-1.8),
        [{ type: 'document', file_id: 'doc-guide', caption: 'Инструкция_AndroidTV.pdf', token: 'mock' }],
      ),
    ],
  },
  {
    id: 104,
    title: 'Сменить почту',
    status: 'closed',
    priority: 'low',
    created_at: inDays(-6),
    updated_at: inDays(-5),
    closed_at: inDays(-5),
    is_reply_blocked: false,
    user: users[3],
    messages: [
      m('Хочу сменить почту на новую', false, inDays(-6)),
      m('Сделали, проверьте вход по новой почте.', true, inDays(-5.5)),
      m('Спасибо, всё работает!', false, inDays(-5)),
    ],
  },
];

const listItem = (t) => ({
  ...t,
  messages_count: t.messages.length,
  last_message: t.messages.at(-1) ?? null,
  messages: undefined,
});

/** Placeholder pictures as SVG: tall «phone screenshots» and a wide one. */
function svgFor(id) {
  const wide = id.includes('wide');
  const [w, h] = wide ? [1600, 900] : id.startsWith('up-') ? [1000, 1000] : [1170, 2532];
  const hue = [...id].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const rows = Array.from({ length: wide ? 6 : 14 }, (_, i) => {
    const y = 260 + i * (wide ? 100 : 150);
    const bw = 300 + ((i * 137 + hue) % (w - 500));
    return `<rect x="80" y="${y}" width="${bw}" height="${wide ? 40 : 56}" rx="20" fill="white" fill-opacity="0.55"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<rect width="100%" height="100%" fill="hsl(${hue} 55% 42%)"/>
<rect x="0" y="0" width="100%" height="180" fill="black" fill-opacity="0.25"/>
<text x="80" y="120" font-family="sans-serif" font-size="64" fill="white">${id}</text>
${rows}</svg>`;
}

let nextUpload = 1;

export const adminTicketRoutes = [
  [
    'GET /cabinet/admin/tickets/stats',
    () => ({
      total: tickets.length,
      open: tickets.filter((t) => t.status === 'open').length,
      pending: tickets.filter((t) => t.status === 'pending').length,
      answered: tickets.filter((t) => t.status === 'answered').length,
      closed: tickets.filter((t) => t.status === 'closed').length,
    }),
  ],
  [
    'GET /cabinet/admin/tickets',
    ({ query }) => {
      const items = tickets
        .filter((t) => !query.status || t.status === query.status)
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .map(listItem);
      return { items, total: items.length, page: Number(query.page || 1), per_page: 20, pages: 1 };
    },
  ],
  [
    'GET /cabinet/admin/tickets/:id',
    ({ params }) =>
      tickets.find((t) => String(t.id) === params.id) ?? {
        __status: 404,
        body: { detail: 'Not found' },
      },
  ],
  [
    'POST /cabinet/admin/tickets/:id/status',
    ({ params, body }) => {
      const t = tickets.find((x) => String(x.id) === params.id);
      if (!t) return { __status: 404, body: { detail: 'Not found' } };
      t.status = body.status;
      t.closed_at = body.status === 'closed' ? nowIso() : null;
      t.updated_at = nowIso();
      return { success: true };
    },
  ],
  [
    'POST /cabinet/admin/tickets/:id/reply',
    ({ params, body }) => {
      const t = tickets.find((x) => String(x.id) === params.id);
      if (!t) return { __status: 404, body: { detail: 'Not found' } };
      const media = (body.media_items ?? []).map((i) => ({ ...i, caption: null, token: 'mock' }));
      const msg = m(body.message || '', true, nowIso(), media);
      t.messages.push(msg);
      t.status = 'answered';
      t.updated_at = nowIso();
      return msg;
    },
  ],
  ['POST /cabinet/admin/tickets/notifications/ticket/:id/read', () => ({ success: true, marked_count: 0 })],
  ['POST /cabinet/tickets/notifications/ticket/:id/read', () => ({ success: true, marked_count: 0 })],
  [
    'GET /cabinet/tickets/notifications',
    () => ({ items: [], unread_count: 0 }),
  ],

  // ─── Media ───────────────────────────────────────────────────────────────
  ['POST /cabinet/media/upload', () => ({ file_id: `up-${nextUpload++}`, success: true })],
  [
    'GET /cabinet/media/:id',
    ({ params }) =>
      params.id.startsWith('doc-')
        ? { __raw: { type: 'text/plain; charset=utf-8', data: 'Mock document' } }
        : { __raw: { type: 'image/svg+xml', data: svgFor(params.id) } },
  ],
];
