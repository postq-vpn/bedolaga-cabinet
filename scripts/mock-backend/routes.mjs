// Handlers of the mock backend: "METHOD /path/:param" → ({ params, query, body }) => data.
// Return { __status, body } for a non-200 answer. Shapes follow src/types and src/api.

import { db, nowIso, inDays, rub, subscriptionView, subscriptionListItem } from './state.mjs';
import { shopRoutes } from './routes-shop.mjs';

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

/** Unsigned JWT: the cabinet only reads `exp` (src/utils/token.ts). */
function jwt(ttlSeconds) {
  const now = Math.floor(Date.now() / 1000);
  return `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ sub: String(db.user.id), iat: now, exp: now + ttlSeconds })}.mock`;
}

function tokens() {
  return {
    access_token: jwt(60 * 60),
    refresh_token: jwt(60 * 60 * 24 * 30),
    token_type: 'bearer',
    expires_in: 3600,
  };
}

const auth = () => ({ ...tokens(), user: db.user, campaign_bonus: null });

/** Pending account merges: token → the email that belongs to «another» account. */
const mergeTokens = new Map();

// ─── Fake payment provider state ───────────────────────────────────────────
// Top-ups become invoices with a payment link; the balance is credited only
// when the invoice is paid on the provider page (/mock-pay/:id).

const payments = [];
let nextPaymentId = 1001;

/** Where the cabinet runs (localhost:5173 or a LAN address) — for links back to it. */
function cabinetOrigin(headers) {
  if (headers.origin) return headers.origin;
  try {
    return new URL(headers.referer).origin;
  } catch {
    return 'http://localhost:5173';
  }
}

function createPayment({ amount, method, option, origin }) {
  const id = nextPaymentId++;
  const p = {
    id,
    method,
    option,
    origin,
    amount_kopeks: amount,
    status: 'pending',
    created_at: nowIso(),
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    payment_url: `${origin}/api/mock-pay/${id}`,
  };
  payments.push(p);
  return p;
}

const findPayment = (id) => payments.find((p) => String(p.id) === String(id));

function settlePayment(p) {
  p.status = 'paid';
  db.user.balance_kopeks += p.amount_kopeks;
  db.user.balance_rubles = rub(db.user.balance_kopeks);
  db.transactions.unshift({
    id: db.transactions.length + 1,
    type: 'deposit',
    amount_kopeks: p.amount_kopeks,
    amount_rubles: rub(p.amount_kopeks),
    description: `Пополнение через ${methodName(p.method)}`,
    payment_method: p.method,
    is_completed: true,
    created_at: p.created_at,
    completed_at: nowIso(),
  });
}

function methodName(id) {
  return db.paymentMethods.find((m) => m.id === id)?.name ?? id;
}

const STATUS_TEXT = {
  pending: ['⏳', 'Ожидает оплаты'],
  paid: ['✅', 'Оплачен'],
  canceled: ['❌', 'Отменён'],
};

function pendingView(p) {
  const [emoji, text] = STATUS_TEXT[p.status];
  return {
    source: 'provider',
    id: p.id,
    method: p.method,
    method_display: methodName(p.method),
    identifier: `MOCK-${p.id}`,
    amount_kopeks: p.amount_kopeks,
    amount_rubles: rub(p.amount_kopeks),
    status: p.status,
    status_emoji: emoji,
    status_text: text,
    is_paid: p.status === 'paid',
    is_checkable: p.status === 'pending',
    created_at: p.created_at,
    expires_at: p.expires_at,
    payment_url: p.status === 'pending' ? p.payment_url : null,
  };
}

function providerPage(p) {
  const body = !p
    ? '<h1>Счёт не найден</h1><p>Mock перезапускался — создайте платёж заново.</p>'
    : p.status !== 'pending'
      ? `<h1>Счёт MOCK-${p.id}: ${STATUS_TEXT[p.status][1].toLowerCase()}</h1>
         <a class="btn" href="${p.origin}/balance/top-up/result">Вернуться в кабинет</a>`
      : `<p class="caption">Счёт MOCK-${p.id} · ${methodName(p.method)}${p.option ? ` · ${p.option}` : ''}</p>
         <h1>${rub(p.amount_kopeks).toLocaleString('ru-RU')} ₽</h1>
         <p class="caption">Получатель: postq</p>
         <a class="btn" href="/api/mock-pay/${p.id}/pay">Оплатить</a>
         <a class="btn secondary" href="/api/mock-pay/${p.id}/cancel">Отменить платёж</a>`;
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Оплата — тестовая платёжная система</title>
<style>
  body { margin: 0; font: 16px/24px system-ui, sans-serif; background: #f4f4f4; color: #111; }
  .bar { padding: 12px 16px; background: #fff3c4; font-size: 12px; line-height: 16px; }
  main { max-width: 400px; margin: 48px auto; padding: 32px; background: #fff; border-radius: 16px;
         display: flex; flex-direction: column; gap: 12px; }
  h1 { margin: 0; font-size: 32px; line-height: 40px; }
  .caption { margin: 0; color: #666; }
  .btn { display: block; padding: 12px 16px; border-radius: 12px; background: #111; color: #fff;
         text-align: center; text-decoration: none; }
  .btn.secondary { background: #eee; color: #111; }
</style></head>
<body><div class="bar">Тестовая платёжная система mock-бэкенда — деньги не списываются</div>
<main>${body}</main></body></html>`;
}

export const routes = new Map([
  // ─── Health ──────────────────────────────────────────────────────────────
  ['GET /health', () => ({ status: 'ok' })],
  ['GET /health/unified', () => ({ status: 'ok', web_api: true })],

  // ─── Branding / public config ────────────────────────────────────────────
  ['GET /cabinet/branding', () => db.branding],
  ['GET /cabinet/branding/animation', () => ({ enabled: false })],
  ['GET /cabinet/branding/animation-config', () => ({ enabled: false })],
  ['GET /cabinet/branding/fullscreen', () => ({ enabled: false })],
  ['GET /cabinet/branding/lite-mode', () => ({ enabled: false })],
  ['GET /cabinet/branding/footer-enabled', () => ({ enabled: true })],
  ['GET /cabinet/branding/email-auth', () => ({ enabled: true, verification_enabled: false })],
  ['GET /cabinet/branding/gift-enabled', () => ({ enabled: true })],
  ['GET /cabinet/branding/themes', () => ({ dark: true, light: true })],
  [
    'GET /cabinet/branding/analytics',
    () => ({ yandex_metrika_id: '', google_ads_id: '', google_ads_label: '' }),
  ],
  [
    'GET /cabinet/branding/telegram-widget',
    () => ({
      bot_username: 'postq_mock_bot',
      size: 'large',
      radius: 12,
      userpic: false,
      request_access: false,
      oidc_enabled: false,
      oidc_client_id: '',
    }),
  ],
  ['GET /cabinet/branding/bot-start-video', () => ({ enabled: false, url: null })],

  // ─── Info ────────────────────────────────────────────────────────────────
  [
    'GET /cabinet/info-pages/tab-replacements',
    () => ({ faq: null, rules: null, privacy: null, offer: null }),
  ],
  ['GET /cabinet/info-pages', () => []],
  [
    'GET /cabinet/info/visibility',
    () => ({ faq: true, rules: true, privacy: true, offer: true, recurrent: false }),
  ],
  [
    'GET /cabinet/info/support-config',
    () => ({
      tickets_enabled: true,
      support_type: 'both',
      support_url: null,
      support_username: 'postq_support',
      contact_is_telegram: true,
    }),
  ],
  [
    'GET /cabinet/info/legal-consent',
    () => ({ required: false, prechecked: true, documents: ['offer', 'privacy'] }),
  ],
  [
    'GET /cabinet/info/service',
    () => ({
      name: 'postq',
      description: 'Mock',
      support_email: 'support@postq.space',
      support_telegram: '@postq_support',
      website: 'https://postq.space',
    }),
  ],
  ['GET /cabinet/info/languages', () => ({ languages: ['ru', 'en'], default: 'ru' })],
  ['GET /cabinet/info/user/language', () => ({ language: db.user.language })],
  [
    'PATCH /cabinet/info/user/language',
    ({ body }) => {
      if (body.language) db.user.language = body.language;
      return { language: db.user.language };
    },
  ],
  [
    'GET /cabinet/info/faq',
    () => [
      {
        id: 1,
        title: 'Как подключиться?',
        content: '<p>Скопируйте ссылку подписки и добавьте её в приложение.</p>',
        order: 1,
      },
    ],
  ],
  ...['rules', 'privacy-policy', 'public-offer', 'recurrent-payments'].map((p) => [
    `GET /cabinet/info/${p}`,
    () => ({ content: `<p>Mock: ${p}</p>`, updated_at: nowIso() }),
  ]),

  // ─── Auth ────────────────────────────────────────────────────────────────
  [
    'POST /cabinet/auth/email/login',
    ({ body }) => {
      // Keep a test-unlinked email unlinked across re-logins.
      if (body.email && !db.emailUnlinked) db.user.email = body.email;
      return auth();
    },
  ],
  // Test helpers (not part of the real API): unlink / relink the email.
  //   curl -X POST localhost:8080/__mock/email/unlink
  [
    'POST /__mock/email/unlink',
    () => {
      db.emailUnlinked = true;
      db.user.email = null;
      db.user.email_verified = false;
      db.user.auth_type = 'telegram';
      return { ok: true };
    },
  ],
  [
    'POST /__mock/email/link',
    () => {
      db.emailUnlinked = false;
      db.user.email = 'test@postq.space';
      db.user.email_verified = true;
      db.user.auth_type = 'email';
      return { ok: true };
    },
  ],
  // Email-only account: no Telegram, no username (signed up on the site).
  //   curl -X POST localhost:8080/__mock/profile/email-only
  [
    'POST /__mock/profile/email-only',
    () => {
      db.emailUnlinked = false;
      Object.assign(db.user, {
        telegram_id: null,
        username: null,
        first_name: null,
        last_name: null,
        email: 'test@postq.space',
        email_verified: true,
        auth_type: 'email',
      });
      return { ok: true };
    },
  ],
  [
    'POST /__mock/profile/reset',
    () => {
      db.emailUnlinked = false;
      db.usedPromocodes = new Set();
      Object.assign(db.user, {
        telegram_id: 100000001,
        username: 'postq_tester',
        first_name: 'Тест',
        last_name: 'Тестов',
        email: 'test@postq.space',
        email_verified: true,
        auth_type: 'email',
      });
      return { ok: true };
    },
  ],
  // ─── Email link + account merge ──────────────────────────────────────────
  // Linking an email that belongs to another account asks to merge them:
  //   taken@…  — the other account has no subscription
  //   both@…   — both have one, the user picks which to keep
  [
    'POST /cabinet/auth/email/register',
    ({ body }) => {
      const email = String(body.email || '').toLowerCase();
      if (email.startsWith('taken@') || email.startsWith('both@')) {
        const token = `mock-merge-${Date.now()}`;
        mergeTokens.set(token, { email, both: email.startsWith('both@'), until: Date.now() + 10 * 60 * 1000 });
        return { message: 'merge required', merge_required: true, merge_token: token };
      }
      db.user.email = email;
      db.user.email_verified = false;
      return { message: 'Verification email sent' };
    },
  ],
  [
    'GET /cabinet/auth/merge/:token',
    ({ params }) => {
      const m = mergeTokens.get(params.token);
      if (!m || m.until < Date.now()) return { __status: 404, body: { detail: 'Merge token not found' } };
      const sub = db.subscriptions[0];
      const mine = sub
        ? { tariff_name: sub.tariff_name ?? 'PostqVPN', status: sub.status, end_date: sub.end_date, traffic_limit_gb: sub.traffic_limit_gb, device_limit: sub.device_limit }
        : null;
      return {
        primary: {
          id: db.user.id, username: db.user.username, first_name: db.user.first_name, email: db.user.email,
          auth_methods: ['telegram', ...(db.user.email ? ['email'] : [])],
          balance_kopeks: db.user.balance_kopeks, subscription: mine, created_at: db.user.created_at ?? null,
        },
        secondary: {
          id: 2, username: null, first_name: null, email: m.email, auth_methods: ['email'],
          balance_kopeks: 12000,
          subscription: m.both
            ? { tariff_name: 'PostqVPN', status: 'active', end_date: inDays(40), traffic_limit_gb: 0, device_limit: 5 }
            : null,
          created_at: inDays(-90),
        },
        expires_in_seconds: Math.round((m.until - Date.now()) / 1000),
      };
    },
  ],
  [
    'POST /cabinet/auth/merge/:token',
    ({ params }) => {
      const m = mergeTokens.get(params.token);
      if (!m) return { __status: 404, body: { detail: 'Merge token not found' } };
      mergeTokens.delete(params.token);
      db.user.email = m.email;
      db.user.email_verified = true;
      db.user.balance_kopeks += 12000;
      db.user.balance_rubles = rub(db.user.balance_kopeks);
      return { success: true, ...tokens(), user: db.user };
    },
  ],
  ['POST /cabinet/auth/telegram', auth],
  ['POST /cabinet/auth/telegram/widget', auth],
  ['POST /cabinet/auth/telegram/oidc', auth],
  ['POST /cabinet/auth/refresh', tokens],
  ['POST /cabinet/auth/logout', () => ({ success: true })],
  ['GET /cabinet/auth/me', () => db.user],
  ['GET /cabinet/auth/me/avatar', () => ({ photo_url: null })],
  ['GET /cabinet/auth/me/is-admin', () => ({ is_admin: true })],
  [
    'GET /cabinet/auth/oauth/providers',
    () => ({
      providers: [
        { name: 'google', display_name: 'Google' },
        { name: 'yandex', display_name: 'Яндекс' },
        { name: 'discord', display_name: 'Discord' },
      ],
    }),
  ],

  // ─── Balance ─────────────────────────────────────────────────────────────
  [
    'GET /cabinet/balance',
    () => ({ balance_kopeks: db.user.balance_kopeks, balance_rubles: rub(db.user.balance_kopeks) }),
  ],
  ['GET /cabinet/balance/transactions', ({ query }) => paginate(db.transactions, query)],
  ['GET /cabinet/balance/payment-methods', () => db.paymentMethods],
  ['GET /cabinet/balance/saved-cards', () => ({ cards: [], recurrent_enabled: false })],
  [
    'GET /cabinet/balance/pending-payments',
    ({ query }) => paginate(payments.map(pendingView).reverse(), query),
  ],
  // `latest` before `:id`, otherwise «latest» is taken for an id.
  [
    'GET /cabinet/balance/pending-payments/:method/latest',
    ({ params }) => {
      const p = payments.filter((x) => x.method === params.method).at(-1);
      return p ? pendingView(p) : { __status: 404, body: { detail: 'Payment not found' } };
    },
  ],
  [
    'GET /cabinet/balance/pending-payments/:method/:id',
    ({ params }) => {
      const p = findPayment(params.id);
      return p ? pendingView(p) : { __status: 404, body: { detail: 'Payment not found' } };
    },
  ],
  [
    'POST /cabinet/balance/pending-payments/:method/:id/check',
    ({ params }) => {
      const p = findPayment(params.id);
      if (!p) return { __status: 404, body: { detail: 'Payment not found' } };
      return {
        success: true,
        message: p.status === 'paid' ? 'Платёж зачислен' : 'Платёж ещё не оплачен',
        payment: pendingView(p),
        status_changed: false,
        old_status: p.status,
        new_status: p.status,
      };
    },
  ],
  [
    'POST /cabinet/balance/topup',
    ({ body, headers }) => {
      // Like the real bot: the provider creates an invoice and hands back a
      // payment link; the money lands only after it's paid on the provider page.
      const amount = Number(body.amount_kopeks) || 0;
      const p = createPayment({
        amount,
        method: body.payment_method ?? 'mock',
        option: body.payment_option ?? null,
        origin: cabinetOrigin(headers),
      });
      return {
        payment_id: String(p.id),
        payment_url: p.payment_url,
        amount_kopeks: amount,
        amount_rubles: rub(amount),
        status: 'pending',
        expires_at: p.expires_at,
      };
    },
  ],

  // ─── Fake payment provider ───────────────────────────────────────────────
  // Opened in the browser via the Vite proxy (/api/mock-pay/… → /mock-pay/…).
  ['GET /mock-pay/:id', ({ params }) => ({ __html: providerPage(findPayment(params.id)) })],
  [
    'GET /mock-pay/:id/:action',
    ({ params }) => {
      const p = findPayment(params.id);
      if (!p) return { __html: providerPage(null), __status: 404 };
      if (p.status === 'pending') {
        if (params.action === 'pay') settlePayment(p);
        else if (params.action === 'cancel') p.status = 'canceled';
      }
      // return_url: the cabinet polls the payment status there.
      return { __redirect: `${p.origin}/balance/top-up/result` };
    },
  ],
  [
    // Test codes (any case):
    //   POSTQ  — +100 ₽ on the balance (repeat → already used)
    //   DAYS   — +7 days; with 2+ subscriptions asks which one first
    //   SALE   — a 15% discount on the next purchase
    //   OLD    — expired;  BUSY — another discount is already active
    //   anything else — not found
    'POST /cabinet/promocode/activate',
    ({ body }) => {
      const code = String(body.code || '').trim().toUpperCase();
      const fail = (c, message) => ({ __status: 400, body: { detail: { code: c, message } } });
      db.usedPromocodes ??= new Set();
      if (code === 'OLD') return fail('expired', 'Promocode expired');
      if (code === 'BUSY') return fail('active_discount_exists', 'Discount already active');
      if (!['POSTQ', 'DAYS', 'SALE'].includes(code)) return fail('not_found', 'Not found');
      if (db.usedPromocodes.has(code)) return fail('already_used_by_user', 'Already used');
      if (code === 'DAYS') {
        if (!db.subscriptions.length) return fail('no_subscription_for_days', 'No subscription');
        if (db.subscriptions.length > 1 && !body.subscription_id)
          return {
            success: false,
            error: 'select_subscription',
            code,
            eligible_subscriptions: db.subscriptions.map((s) => ({
              id: s.id,
              tariff_name: s.tariff_name ?? 'PostqVPN',
              days_left: s.days_left ?? 0,
            })),
          };
        db.usedPromocodes.add(code);
        return { success: true, message: 'ok', bonus_description: '+7 дней к подписке' };
      }
      db.usedPromocodes.add(code);
      if (code === 'SALE')
        return { success: true, message: 'ok', bonus_description: 'Скидка 15% на следующую покупку' };
      const before = rub(db.user.balance_kopeks);
      db.user.balance_kopeks += 10000;
      db.user.balance_rubles = rub(db.user.balance_kopeks);
      db.transactions.unshift({
        id: db.transactions.length + 1,
        type: 'promocode',
        amount_kopeks: 10000,
        amount_rubles: 100,
        description: 'Промокод POSTQ',
        payment_method: null,
        is_completed: true,
        created_at: nowIso(),
        completed_at: nowIso(),
      });
      return {
        success: true,
        message: 'ok',
        bonus_description: 'Промокод активирован',
        balance_before: before,
        balance_after: rub(db.user.balance_kopeks),
      };
    },
  ],

  // ─── Subscriptions ───────────────────────────────────────────────────────
  [
    'GET /cabinet/subscriptions',
    () => ({
      subscriptions: db.subscriptions.map(subscriptionListItem),
      multi_tariff_enabled: false,
    }),
  ],
  [
    'GET /cabinet/subscriptions/:id',
    ({ params }) => {
      const s = db.subscriptions.find((x) => String(x.id) === params.id);
      return s ? subscriptionListItem(s) : { __status: 404, body: { detail: 'Not found' } };
    },
  ],
  [
    'GET /cabinet/subscription',
    () => {
      const s = db.subscriptions[0];
      return { has_subscription: !!s, subscription: s ? subscriptionView(s) : null };
    },
  ],
  [
    'GET /cabinet/subscription/renewal-options',
    () =>
      [30, 90, 180, 360].map((d, i) => ({
        period_days: d,
        // Same as the single tariff on postq-site (routes-shop.mjs).
        price_kopeks: [34900, 94200, 167500, 293200][i],
        price_rubles: [349, 942, 1675, 2932][i],
        discount_percent: [0, 10, 20, 30][i],
        original_price_kopeks: i ? 34900 * [1, 3, 6, 12][i] : null,
        is_highlighted: d === 360,
      })),
  ],
  [
    'GET /cabinet/subscription/trial',
    () => ({
      is_available: !db.trialUsed && db.subscriptions.length === 0,
      duration_days: 1,
      traffic_limit_gb: 10,
      device_limit: 1,
      requires_payment: false,
      price_kopeks: 0,
      price_rubles: 0,
      reason_unavailable: db.trialUsed ? 'Пробный период уже использован' : null,
    }),
  ],
  [
    'POST /cabinet/subscription/trial',
    () => {
      if (db.trialUsed)
        return { __status: 400, body: { detail: 'Пробный период уже использован' } };
      db.trialUsed = true;
      const s = {
        id: 1,
        status: 'trial',
        is_trial: true,
        start_date: nowIso(),
        end_date: inDays(1),
        traffic_limit_gb: 10,
        traffic_used_gb: 0,
        device_limit: 1,
        connected_squads: ['sq-nl', 'sq-fi'],
        servers: [
          { uuid: 'sq-nl', name: 'Нидерланды', country_code: 'NL' },
          { uuid: 'sq-fi', name: 'Финляндия', country_code: 'FI' },
        ],
        autopay_enabled: false,
        autopay_days_before: 3,
        subscription_url: 'https://sub.postq.space/mock-subscription-token',
        subscription_crypto_link: null,
        hide_subscription_link: false,
        tariff_id: 1,
        tariff_name: 'PostqVPN',
        traffic_reset_mode: 'NO_RESET',
      };
      db.subscriptions.push(s);
      return subscriptionView(s);
    },
  ],
  [
    'GET /cabinet/subscription/devices',
    () => ({
      devices: db.devices,
      total: db.devices.length,
      device_limit: db.subscriptions[0]?.device_limit ?? 0,
    }),
  ],
  [
    'DELETE /cabinet/subscription/devices/:hwid',
    ({ params }) => {
      db.devices = db.devices.filter((d) => d.hwid !== params.hwid);
      return { success: true };
    },
  ],
  [
    'PATCH /cabinet/subscription/autopay',
    ({ body }) => {
      const s = db.subscriptions[0];
      if (s) s.autopay_enabled = !!body.enabled;
      return { success: true, autopay_enabled: s?.autopay_enabled ?? false };
    },
  ],
  [
    'GET /cabinet/subscription/traffic-packages',
    () => [
      { gb: 50, price_kopeks: 9900, price_rubles: 99, is_unlimited: false },
      { gb: 100, price_kopeks: 14900, price_rubles: 149, is_unlimited: false },
    ],
  ],
  [
    'POST /cabinet/subscription/refresh-traffic',
    () => {
      const s = db.subscriptions[0];
      const gb = s?.traffic_used_gb ?? 0;
      const limit = s?.traffic_limit_gb ?? 0;
      return {
        success: true,
        cached: false,
        traffic_used_bytes: Math.round(gb * 1024 ** 3),
        traffic_used_gb: gb,
        traffic_limit_bytes: Math.round(limit * 1024 ** 3),
        traffic_limit_gb: limit,
        traffic_used_percent: limit ? (gb / limit) * 100 : 0,
        is_unlimited: !limit,
      };
    },
  ],

  // ─── Permissions (admin) ─────────────────────────────────────────────────
  [
    'GET /cabinet/auth/me/permissions',
    () => ({ permissions: ['*:*'], roles: ['superadmin'], role_level: 1000 }),
  ],

  // ─── Dashboard extras ────────────────────────────────────────────────────
  ['GET /cabinet/public/site-verification', () => ({ apay_tag: null })],
  ['GET /cabinet/tickets/notifications/unread-count', () => ({ unread_count: 0 })],
  ['GET /cabinet/admin/tickets/notifications/unread-count', () => ({ unread_count: 0 })],
  ['GET /cabinet/promo/offers', () => []],
  [
    'GET /cabinet/promo/active-discount',
    () => ({ discount_percent: 0, source: null, expires_at: null, is_active: false }),
  ],
  [
    'GET /cabinet/promo/group-discounts',
    () => ({
      group_name: null,
      server_discount_percent: 0,
      traffic_discount_percent: 0,
      device_discount_percent: 0,
      period_discounts: {},
    }),
  ],
  ['GET /cabinet/reminders/active', () => []],
  [
    'GET /cabinet/news',
    () => ({
      items: [
        {
          id: 1,
          title: 'Новые серверы в Финляндии',
          slug: 'new-fi-servers',
          excerpt: 'Добавили две ноды в Хельсинки — быстрее для северо-запада.',
          category: 'Обновления',
          category_color: '#ff2181',
          category_id: 1,
          tag: null,
          tag_id: null,
          featured_image_url: null,
          is_published: true,
          is_featured: true,
          published_at: inDays(-2),
          read_time_minutes: 2,
          views_count: 128,
        },
      ],
      total: 1,
      categories: ['Обновления'],
    }),
  ],
  [
    'GET /cabinet/referral',
    () => ({
      referral_code: db.user.referral_code,
      referral_link: `https://web.postq.space/?ref=${db.user.referral_code}`,
      bot_referral_link: `https://t.me/postq_mock_bot?start=${db.user.referral_code}`,
      total_referrals: 4,
      active_referrals: 2,
      total_earnings_kopeks: 12000,
      total_earnings_rubles: 120,
      commission_percent: 10,
      available_balance_kopeks: 12000,
      available_balance_rubles: 120,
      withdrawn_kopeks: 0,
    }),
  ],
  [
    'GET /cabinet/referral/terms',
    () => ({
      is_enabled: true,
      commission_percent: 10,
      minimum_topup_kopeks: 10000,
      minimum_topup_rubles: 100,
      first_topup_bonus_kopeks: 5000,
      first_topup_bonus_rubles: 50,
      inviter_bonus_kopeks: 5000,
      inviter_bonus_rubles: 50,
      max_commission_payments: 0,
      partner_section_visible: true,
      scheme: 'legacy',
    }),
  ],
  [
    'GET /cabinet/wheel/config',
    () => ({
      is_enabled: false,
      name: '',
      spin_cost_stars: null,
      spin_cost_days: null,
      spin_cost_stars_enabled: false,
      spin_cost_days_enabled: false,
      prizes: [],
      daily_limit: 0,
      user_spins_today: 0,
      can_spin: false,
      can_spin_reason: 'disabled',
      can_pay_stars: false,
      can_pay_days: false,
      user_balance_kopeks: db.user.balance_kopeks,
      required_balance_kopeks: 0,
      has_subscription: true,
      eligible_subscriptions: null,
    }),
  ],
  ['GET /cabinet/gift/pending', () => []],
  ['GET /cabinet/contests/count', () => ({ count: 0 })],
  ['GET /cabinet/polls/count', () => ({ count: 0 })],
  ['POST /cabinet/activity/events', () => ({ success: true })],

  ...shopRoutes,
]);

function paginate(items, query) {
  const page = Number(query.page || 1);
  const perPage = Number(query.per_page || query.limit || 20);
  const start = (page - 1) * perPage;
  return {
    items: items.slice(start, start + perPage),
    total: items.length,
    page,
    per_page: perPage,
    pages: Math.max(1, Math.ceil(items.length / perPage)),
  };
}
