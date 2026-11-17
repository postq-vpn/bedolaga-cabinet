// Mock routes: tariffs & purchase, connection, support, profile, gifts, referral lists.

import { db, nowIso, inDays, rub, subscriptionView } from './state.mjs';

const partner = {
  status: process.env.MOCK_PARTNER || 'none',
  application:
    process.env.MOCK_PARTNER === 'rejected'
      ? { id: 1, status: 'rejected', admin_comment: 'Нужна ссылка на канал с аудиторией от 1000 человек.', created_at: new Date().toISOString(), processed_at: null }
      : null,
};

const fmt = (kopeks) => `${(kopeks / 100).toLocaleString('ru-RU')} ₽`;

const SERVERS = [
  { uuid: 'sq-nl', name: 'Нидерланды' },
  { uuid: 'sq-fi', name: 'Финляндия' },
  { uuid: 'sq-de', name: 'Германия' },
];

// One tariff, as on postq-site (src/components/redesign/RdPricing.tsx): 3
// devices included, unlimited traffic; extra devices are billed per month at
// the period's rate, up to 10 devices in total.
const TARIFF = {
  id: 1,
  name: 'PostqVPN',
  description: 'Безлимитный трафик, 3 устройства',
  devices: 3,
  maxDevices: 10,
};
const TARIFFS = [TARIFF];

// Totals in kopeks, exactly as the site lists them.
const PERIODS = [
  { days: 30, months: 1, total: 34900, discount: 0, extraMonth: 11500 },
  { days: 90, months: 3, total: 94200, discount: 10, extraMonth: 10400 },
  { days: 180, months: 6, total: 167500, discount: 20, extraMonth: 9200 },
  { days: 360, months: 12, total: 293200, discount: 30, extraMonth: 8000, highlighted: true },
];
const BASE_MONTH = 34900;

const periodLabel = (m) =>
  m === 1 ? '1 месяц' : m === 12 ? '12 месяцев' : m === 3 ? '3 месяца' : `${m} месяцев`;

function periodsOf() {
  return PERIODS.map((p) => {
    const original = BASE_MONTH * p.months;
    const perMonth = Math.round(p.total / p.months / 100) * 100; // whole rubles, as on the site
    return {
      days: p.days,
      months: p.months,
      label: periodLabel(p.months),
      price_kopeks: p.total,
      price_label: fmt(p.total),
      price_per_month_kopeks: perMonth,
      price_per_month_label: fmt(perMonth),
      ...(p.discount
        ? {
            original_price_kopeks: original,
            original_price_label: fmt(original),
            original_per_month_kopeks: BASE_MONTH,
            original_per_month_label: fmt(BASE_MONTH),
            discount_percent: p.discount,
            discount_amount_kopeks: original - p.total,
            discount_label: `-${p.discount}%`,
          }
        : {}),
      is_highlighted: !!p.highlighted,
    };
  });
}

function tariffView(t) {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    is_highlighted: false,
    tier_level: 1,
    traffic_limit_gb: 0,
    traffic_limit_label: 'Безлимит',
    is_unlimited_traffic: true,
    device_limit: t.devices,
    purchase_device_selection_supported: true,
    base_device_limit: t.devices,
    extra_devices_count: 0,
    servers_count: SERVERS.length,
    servers: SERVERS,
    periods: periodsOf(),
    is_current: db.subscriptions[0]?.tariff_id === t.id,
    is_available: true,
    device_price_kopeks: PERIODS[0].extraMonth,
    traffic_topup_enabled: false,
    traffic_topup_packages: [],
  };
}

/** Price of a period with `devices` in total (extra ones billed per month). */
function priceOf(_tariffId, days, devices) {
  const t = TARIFF;
  const period = PERIODS.find((x) => x.days === Number(days)) ?? PERIODS[0];
  const p = periodsOf().find((x) => x.days === period.days);
  const count = Math.min(t.maxDevices, Math.max(t.devices, Number(devices) || t.devices));
  const devicesCost = (count - t.devices) * period.extraMonth * period.months;
  return { t, p, count, devicesCost, total: p.price_kopeks + devicesCost };
}

/** The promo code discount (`SALE`), taken off the whole sum as the bot does. */
function promoOff(total) {
  const d = db.promoDiscount;
  if (!d || (d.expires_at && Date.parse(d.expires_at) <= Date.now())) return 0;
  return Math.floor((total * d.percent) / 100);
}

function quote(body) {
  const priced = priceOf(body.tariff_id, body.period_days, body.selected_device_limit);
  const { t, p, count, devicesCost } = priced;
  const off = promoOff(priced.total);
  const total = priced.total - off;
  return {
    quote_id: `q-${Date.now()}`,
    expires_at: inDays(1 / 24),
    purchase_kind: db.subscriptions.length ? 'paid_renewal' : 'new',
    device_selection: {
      effective_limit: count,
      included_limit: t.devices,
      selectable: true,
      min_limit: t.devices,
      max_limit: t.maxDevices,
      reason: null,
    },
    tariff_cost_kopeks: p.price_kopeks,
    devices_cost_kopeks: devicesCost,
    traffic_cost_kopeks: 0,
    discount_kopeks: (p.discount_amount_kopeks ?? 0) + off,
    total_kopeks: total,
    balance_kopeks: db.user.balance_kopeks,
    missing_kopeks: Math.max(0, total - db.user.balance_kopeks),
  };
}

const platform = (name, apps) => ({ displayName: { ru: name, en: name }, apps });
const app = (name, featured = false) => ({
  name,
  featured,
  blocks: [
    {
      title: { ru: 'Установите приложение', en: 'Install the app' },
      description: { ru: `Скачайте ${name} из магазина приложений.`, en: `Download ${name}.` },
      buttons: [
        { type: 'external', url: 'https://www.happ.su/', text: { ru: 'Скачать', en: 'Download' } },
      ],
    },
    {
      title: { ru: 'Добавьте подписку', en: 'Add subscription' },
      description: {
        ru: 'Нажмите кнопку — подписка добавится автоматически.',
        en: 'Tap the button.',
      },
      buttons: [
        { type: 'subscriptionLink', text: { ru: 'Добавить подписку', en: 'Add subscription' } },
      ],
    },
    {
      title: { ru: 'Подключитесь', en: 'Connect' },
      description: { ru: 'Включите VPN в приложении.', en: 'Turn VPN on.' },
    },
  ],
});

/** The user's subscription; a blank expired one when there is none yet. */
function ensureSubscription() {
  let s = db.subscriptions[0];
  if (!s) {
    s = {
      id: 1,
      status: 'expired',
      is_trial: false,
      start_date: nowIso(),
      end_date: nowIso(),
      traffic_used_gb: 0,
      connected_squads: SERVERS.map((x) => x.uuid),
      servers: SERVERS.map((x) => ({ ...x, country_code: null })),
      autopay_enabled: false,
      autopay_days_before: 3,
      subscription_url: 'https://sub.postq.space/mock-subscription-token',
      subscription_crypto_link: null,
      hide_subscription_link: false,
      tariff_id: TARIFF.id,
      tariff_name: TARIFF.name,
      traffic_limit_gb: 0,
      device_limit: TARIFF.devices,
    };
    db.subscriptions.push(s);
  }
  return s;
}

// ─── Platega SBP auto-debit (recurrent) ───────────────────────────────────
// Binding = PENDING until confirmed on the fake bank page (/mock-sbp/:id),
// then ACTIVE and charged monthly, like the bot (the tariff's shortest period).
// MOCK_SBP=off answers as the bot does with PLATEGA_RECURRENT_ENABLED=false.

export const sbpEnabled = process.env.MOCK_SBP !== 'off';
const sbpBindings = new Map();
const SBP_DAYS = 30;

const originOf = (headers) => {
  if (headers.origin) return headers.origin;
  try {
    return new URL(headers.referer).origin;
  } catch {
    return 'http://localhost:5173';
  }
};

/** Balance auto-renewal switched on: the bot cancels the SBP binding. */
export function cancelSbp(subscriptionId) {
  sbpBindings.delete(subscriptionId);
}

/** Devices changed: a binding priced for another count is closed (as the bot does). */
export function sbpOnDevicesChanged(subscription) {
  const b = sbpBindings.get(subscription.id);
  if (!b || b.devices === subscription.device_limit) return false;
  sbpBindings.delete(subscription.id);
  return true;
}

// As the bot: Platega charges per month or year only; a chosen 90/180 days is refused.
const sbpPeriodOk = (days) => (days >= 28 && days <= 31) || (days >= 350 && days <= 380);
const sbpPeriodRefused = {
  __status: 400,
  body: { detail: 'Автосписание через СБП доступно для срока 1 месяц или 1 год' },
};

function sbpBind(s, origin, { devices, purchase, days = SBP_DAYS }) {
  const { count, total } = priceOf(TARIFF.id, days, devices ?? s.device_limit);
  const b = {
    status: 'PENDING',
    interval: days >= 350 ? 4 : 3,
    amount_kopeks: total,
    charge_days: days,
    next_charge_at: null,
    // Enabling keeps the current count; a purchase takes the chosen one.
    devices: purchase ? count : s.device_limit,
    purchase,
    origin,
    redirect_url: `${origin}/api/mock-sbp/${s.id}`,
  };
  b.created_at = Date.now();
  sbpBindings.set(s.id, b);
  // As the bot: balance auto-renewal is switched off only once the bank
  // confirms (see the confirm action) — an abandoned attempt keeps it.
  return b;
}

const sbpOff = { __status: 403, body: { detail: 'Platega recurrent disabled' } };

function sbpPage(id, b) {
  const body = !b
    ? '<h1>Привязка не найдена</h1><p>Mock перезапускался или привязку отменили.</p>'
    : b.status !== 'PENDING'
      ? `<h1>Привязка уже ${b.status === 'ACTIVE' ? 'подтверждена' : 'обработана'}</h1>
         <a class="btn" href="${b.origin}/">Вернуться в кабинет</a>`
      : `<p class="caption">Тестовый банк · СБП · подписка №${id}</p>
         <h1>${(b.amount_kopeks / 100).toLocaleString('ru-RU')} ₽ ${b.interval === 4 ? 'раз в год' : 'ежемесячно'}</h1>
         <p class="caption">Получатель: postq. Первое списание — сейчас.</p>
         <a class="btn" href="/api/mock-sbp/${id}/confirm">Подтвердить привязку</a>
         <a class="btn secondary" href="/api/mock-sbp/${id}/decline">Отклонить</a>`;
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Привязка СБП — тестовый банк</title>
<style>
  body { margin: 0; font: 16px/24px system-ui, sans-serif; background: #f4f4f4; color: #111; }
  .bar { padding: 12px 16px; background: #fff3c4; font-size: 12px; line-height: 16px; }
  main { max-width: 400px; margin: 48px auto; padding: 32px; background: #fff; border-radius: 16px; }
  h1 { font-size: 28px; line-height: 36px; margin: 8px 0 16px; }
  .caption { color: #666; margin: 0; }
  .btn { display: block; margin-top: 16px; padding: 14px; border-radius: 12px; background: #1d1d1f;
    color: #fff; text-align: center; text-decoration: none; }
  .btn.secondary { background: #eee; color: #111; }
</style></head>
<body><div class="bar">Mock: это не настоящий банк, деньги не списываются.</div>
<main>${body}</main></body></html>`;
}

const sbpRoutes = [
  [
    'GET /cabinet/subscription/platega-recurrent',
    () => {
      if (!sbpEnabled) return sbpOff;
      const s = db.subscriptions[0];
      const b = s && sbpBindings.get(s.id);
      if (!b) return { status: 'none' };
      // Platega fails an unconfirmed binding after 30 minutes (MOCK_SBP_CONFIRM_MS to shorten).
      const confirmMs = Number(process.env.MOCK_SBP_CONFIRM_MS || 30 * 60 * 1000);
      if (b.status === 'PENDING' && Date.now() - b.created_at > confirmMs) {
        sbpBindings.delete(s.id);
        return { status: 'none' };
      }
      const { status, interval, amount_kopeks, next_charge_at, redirect_url } = b;
      const confirm_until =
        status === 'PENDING' ? new Date(b.created_at + confirmMs).toISOString() : null;
      return { status, interval, amount_kopeks, next_charge_at, redirect_url, confirm_until };
    },
  ],
  [
    'POST /cabinet/subscription/platega-recurrent/enable',
    ({ headers }) => {
      if (!sbpEnabled) return sbpOff;
      const s = db.subscriptions[0];
      if (!s) return { __status: 404, body: { detail: 'No subscription found' } };
      if (s.is_trial)
        return {
          __status: 400,
          body: { detail: 'Trial subscriptions cannot enable SBP auto-payment' },
        };
      const b = sbpBind(s, originOf(headers), { purchase: false });
      return { status: 'pending', redirect_url: b.redirect_url };
    },
  ],
  [
    'POST /cabinet/subscription/platega-recurrent/cancel',
    () => {
      const s = db.subscriptions[0];
      if (s) cancelSbp(s.id);
      return { status: 'cancelled' };
    },
  ],
  [
    'GET /cabinet/subscription/platega-recurrent/purchase-preview',
    ({ query }) => {
      if (!sbpEnabled) return { __status: 403, body: { detail: 'platega recurrent disabled' } };
      const days = query.period_days ? Number(query.period_days) : SBP_DAYS;
      if (!sbpPeriodOk(days)) return sbpPeriodRefused;
      const { count, total } = priceOf(TARIFF.id, days, query.selected_device_limit);
      return {
        amount_kopeks: total,
        charge_days: days,
        interval: days >= 350 ? 4 : 3,
        selected_device_limit: count,
        quote_id: `rq-${Date.now()}`,
        checkout_id: null,
        expires_at: inDays(1 / 24),
      };
    },
  ],
  [
    'POST /cabinet/subscription/platega-recurrent/purchase',
    ({ query, headers }) => {
      if (!sbpEnabled) return sbpOff;
      const days = query.period_days ? Number(query.period_days) : SBP_DAYS;
      if (!sbpPeriodOk(days)) return sbpPeriodRefused;
      const s = ensureSubscription();
      const b = sbpBind(s, originOf(headers), {
        devices: query.selected_device_limit,
        purchase: true,
        days,
      });
      return { status: 'pending', redirect_url: b.redirect_url, subscription_id: s.id };
    },
  ],
  // Fake bank page, opened through the Vite proxy (/api/mock-sbp/… → /mock-sbp/…).
  ['GET /mock-sbp/:id', ({ params }) => ({ __html: sbpPage(params.id, sbpBindings.get(Number(params.id))) })],
  [
    'GET /mock-sbp/:id/:action',
    ({ params }) => {
      const id = Number(params.id);
      const b = sbpBindings.get(id);
      const s = db.subscriptions.find((x) => x.id === id);
      if (!b || !s) return { __html: sbpPage(params.id, null), __status: 404 };
      if (b.status === 'PENDING' && params.action === 'confirm') {
        b.status = 'ACTIVE';
        s.autopay_enabled = false;
        // The first charge renews right away (the bot extends on CONFIRMED).
        const base = Math.max(Date.now(), new Date(s.end_date).getTime());
        Object.assign(s, {
          status: 'active',
          device_limit: b.purchase ? b.devices : s.device_limit,
          end_date: new Date(base + b.charge_days * 86400000).toISOString(),
        });
        b.next_charge_at = s.end_date;
      } else if (params.action === 'decline') {
        sbpBindings.delete(id);
      } else if (params.action === 'pastdue' && b.status === 'ACTIVE') {
        // Not linked anywhere: open /api/mock-sbp/1/pastdue by hand.
        b.status = 'PAST_DUE';
        b.next_charge_at = null;
      }
      return { __redirect: `${b.origin}/` };
    },
  ],
];

export const shopRoutes = [
  ...sbpRoutes,
  // ─── Tariffs & purchase ──────────────────────────────────────────────────
  [
    'GET /cabinet/subscription/purchase-options',
    () => {
      const s = db.subscriptions[0];
      return {
        sales_mode: 'tariffs',
        tariffs: TARIFFS.map(tariffView),
        current_tariff_id: s?.tariff_id ?? null,
        balance_kopeks: db.user.balance_kopeks,
        balance_label: fmt(db.user.balance_kopeks),
        subscription_status: s?.status,
        subscription_is_expired: s ? subscriptionView(s).is_expired : false,
        has_subscription: !!s,
        all_tariffs_purchased: false,
        platega_recurrent_enabled: sbpEnabled,
      };
    },
  ],
  ['POST /cabinet/subscription/purchase-tariff/preview', ({ body }) => quote(body)],
  [
    'POST /cabinet/subscription/purchase-tariff',
    ({ body }) => {
      const priced = priceOf(body.tariff_id, body.period_days, body.selected_device_limit);
      const { t, p, count } = priced;
      const total = priced.total - promoOff(priced.total);
      if (db.user.balance_kopeks < total) {
        return {
          __status: 400,
          body: {
            detail: {
              code: 'insufficient_funds',
              message: 'Недостаточно средств на балансе',
              missing_amount: total - db.user.balance_kopeks,
            },
          },
        };
      }
      db.user.balance_kopeks -= total;
      db.user.balance_rubles = rub(db.user.balance_kopeks);
      // One-shot: the purchase uses the discount up.
      db.promoDiscount = null;
      const s = ensureSubscription();
      const base = Math.max(Date.now(), new Date(s.end_date).getTime());
      // A purchase converts the trial, as the bot does (is_trial = False).
      Object.assign(s, {
        status: 'active',
        is_trial: false,
        tariff_id: t.id,
        tariff_name: t.name,
        traffic_limit_gb: 0,
        device_limit: count,
        end_date: new Date(base + p.days * 86400000).toISOString(),
      });
      db.transactions.unshift({
        id: db.transactions.length + 1,
        type: 'subscription_payment',
        amount_kopeks: -total,
        amount_rubles: -rub(total),
        description: `Тариф «${t.name}» на ${p.days} дней`,
        payment_method: null,
        is_completed: true,
        created_at: nowIso(),
        completed_at: nowIso(),
      });
      return {
        success: true,
        subscription_id: s.id,
        charged_amount: total,
        message: 'Подписка оформлена',
        subscription: subscriptionView(s),
        tariff_id: t.id,
        tariff_name: t.name,
        balance_kopeks: db.user.balance_kopeks,
        balance_label: fmt(db.user.balance_kopeks),
      };
    },
  ],

  // ─── Connection ──────────────────────────────────────────────────────────
  [
    'GET /cabinet/subscription/connection-link',
    () => {
      const url = db.subscriptions[0]?.subscription_url ?? null;
      return {
        subscription_url: url,
        display_link: url,
        happ_redirect_link: null,
        happ_scheme_link: url ? `happ://add/${url}` : null,
        connect_mode: 'miniapp_custom',
        hide_link: false,
        instructions: { steps: ['Установите приложение', 'Добавьте подписку', 'Подключитесь'] },
      };
    },
  ],
  [
    'GET /cabinet/subscription/app-config',
    () => ({
      platformNames: {
        ios: { ru: 'iOS', en: 'iOS' },
        android: { ru: 'Android', en: 'Android' },
        macos: { ru: 'macOS', en: 'macOS' },
        windows: { ru: 'Windows', en: 'Windows' },
      },
      hasSubscription: db.subscriptions.length > 0,
      subscriptionUrl: db.subscriptions[0]?.subscription_url ?? null,
      hideLink: false,
      branding: { name: 'postq' },
      isRemnawave: true,
      svgLibrary: {},
      baseTranslations: {},
      baseSettings: { isShowTutorialButton: false, tutorialUrl: '' },
      uiConfig: { installationGuidesBlockType: 'timeline' },
      platforms: {
        ios: platform('iOS', [app('Happ', true), app('Streisand')]),
        android: platform('Android', [app('Happ', true), app('v2rayNG')]),
        macos: platform('macOS', [app('Happ', true)]),
        windows: platform('Windows', [app('Happ', true), app('Hiddify')]),
      },
    }),
  ],
  ['GET /cabinet/subscription/happ-downloads', () => ({ platforms: {}, happ_enabled: false })],

  // ─── Support ─────────────────────────────────────────────────────────────
  [
    'GET /cabinet/tickets',
    ({ query }) => {
      const items = db.tickets.map((t) => ({
        ...t,
        messages_count: t.messages.length,
        last_message: t.messages.at(-1) ?? null,
        messages: undefined,
      }));
      return { items, total: items.length, page: Number(query.page || 1), per_page: 20, pages: 1 };
    },
  ],
  [
    'GET /cabinet/tickets/:id',
    ({ params }) => {
      const t = db.tickets.find((x) => String(x.id) === params.id);
      return t
        ? { ...t, is_reply_blocked: false }
        : { __status: 404, body: { detail: 'Not found' } };
    },
  ],
  [
    'POST /cabinet/tickets',
    ({ body }) => {
      const t = {
        id: db.tickets.length + 1,
        title: body.title || 'Обращение',
        status: 'open',
        priority: 'normal',
        created_at: nowIso(),
        updated_at: nowIso(),
        closed_at: null,
        messages: [msg(1, body.message || '', false)],
      };
      db.tickets.unshift(t);
      return { ...t, is_reply_blocked: false };
    },
  ],
  [
    'POST /cabinet/tickets/:id/messages',
    ({ params, body }) => {
      const t = db.tickets.find((x) => String(x.id) === params.id);
      if (!t) return { __status: 404, body: { detail: 'Not found' } };
      const m = msg(t.messages.length + 1, body.message || '', false);
      t.messages.push(m);
      t.updated_at = nowIso();
      return m;
    },
  ],

  // ─── Profile ─────────────────────────────────────────────────────────────
  [
    'GET /cabinet/auth/account/linked-providers',
    () => ({
      // Derived from the user, so the /__mock helpers change it too.
      providers: [
        {
          provider: 'telegram',
          linked: !!db.user.telegram_id,
          identifier: db.user.username ? `@${db.user.username}` : null,
        },
        { provider: 'email', linked: !!db.user.email, identifier: db.user.email },
      ],
    }),
  ],
  ['GET /cabinet/notifications', () => db.notificationSettings],
  ['PATCH /cabinet/notifications', ({ body }) => Object.assign(db.notificationSettings, body)],

  // ─── Gifts ───────────────────────────────────────────────────────────────
  [
    'GET /cabinet/gift/config',
    () => ({
      is_enabled: true,
      tariffs: TARIFFS.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        traffic_limit_gb: 0,
        device_limit: t.devices,
        is_highlighted: false,
        periods: periodsOf().map((p) => ({
          days: p.days,
          price_kopeks: p.price_kopeks,
          price_label: p.price_label,
          original_price_kopeks: p.original_price_kopeks ?? null,
          discount_percent: p.discount_percent ?? null,
          is_highlighted: p.is_highlighted,
        })),
      })),
      payment_methods: [
        {
          method_id: 'yookassa',
          display_name: 'Банковская карта',
          description: null,
          icon_url: null,
          min_amount_kopeks: null,
          max_amount_kopeks: null,
          sub_options: null,
        },
      ],
      balance_kopeks: db.user.balance_kopeks,
      currency_symbol: '₽',
      promo_group_name: null,
      active_discount_percent: null,
      active_discount_expires_at: null,
    }),
  ],

  // ─── Referral lists, misc lists ──────────────────────────────────────────
  ['GET /cabinet/referral/list', () => ({ items: [], total: 0, page: 1, per_page: 10, pages: 1 })],
  [
    'GET /cabinet/referral/earnings',
    () => ({ items: [], total: 0, page: 1, per_page: 10, pages: 1 }),
  ],
  [
    'GET /cabinet/referral/partner/status',
    () => ({
      partner_status: partner.status,
      commission_percent: partner.status === 'approved' ? 20 : null,
      latest_application: partner.application,
      campaigns: [],
    }),
  ],
  [
    // Application → «на рассмотрении». MOCK_PARTNER=approved|rejected to see the others.
    'POST /cabinet/referral/partner/apply',
    ({ body }) => {
      partner.status = 'pending';
      partner.application = { id: 1, status: 'pending', ...body, admin_comment: null, created_at: new Date().toISOString(), processed_at: null };
      return partner.application;
    },
  ],
  [
    'GET /cabinet/referral/withdrawal/balance',
    () => ({
      total_earned: 12000,
      referral_spent: 0,
      withdrawn: 0,
      pending: 0,
      available_referral: 12000,
      available_total: 12000,
      only_referral_mode: true,
      min_amount_kopeks: 50000,
      is_withdrawal_enabled: true,
      can_request: false,
      cannot_request_reason: 'Минимальная сумма вывода — 500 ₽',
      requisites_text: '',
    }),
  ],
  ['GET /cabinet/referral/withdrawal/history', () => ({ items: [], total: 0 })],
  ['GET /cabinet/contests', () => []],
  ['GET /cabinet/polls', () => []],
  ['GET /cabinet/wheel/history', () => ({ items: [], total: 0, page: 1, per_page: 10, pages: 1 })],
];

function msg(id, text, fromAdmin) {
  return {
    id,
    message_text: text,
    is_from_admin: fromAdmin,
    has_media: false,
    media_type: null,
    media_file_id: null,
    media_caption: null,
    created_at: nowIso(),
  };
}
