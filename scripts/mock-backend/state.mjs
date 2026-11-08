// In-memory data of the mock backend. Resets on restart.

export const nowIso = () => new Date().toISOString();
export const inDays = (d) => new Date(Date.now() + d * 86400000).toISOString();
export const rub = (kopeks) => Math.round(kopeks) / 100;

const SUB_URL = 'https://sub.postq.space/mock-subscription-token';

export const db = {
  branding: {
    name: 'postq',
    logo_url: null,
    logo_letter: 'P',
    has_custom_logo: false,
  },

  user: {
    id: 1,
    telegram_id: 100000001,
    username: 'postq_tester',
    first_name: 'Тест',
    last_name: 'Тестов',
    email: 'test@postq.space',
    email_verified: true,
    balance_kopeks: 45000,
    balance_rubles: 450,
    referral_code: 'POSTQTEST',
    language: 'ru',
    created_at: inDays(-120),
    auth_type: 'email',
  },

  subscriptions: [
    {
      id: 1,
      status: 'active',
      is_trial: false,
      start_date: inDays(-18),
      end_date: inDays(12),
      traffic_limit_gb: 0, // 0 = unlimited
      traffic_used_gb: 37.4,
      device_limit: 3,
      connected_squads: ['sq-nl', 'sq-fi'],
      servers: [
        { uuid: 'sq-nl', name: 'Нидерланды', country_code: 'NL' },
        { uuid: 'sq-fi', name: 'Финляндия', country_code: 'FI' },
      ],
      autopay_enabled: false,
      autopay_days_before: 3,
      subscription_url: SUB_URL,
      subscription_crypto_link: null,
      hide_subscription_link: false,
      tariff_id: 1,
      tariff_name: 'PostqVPN',
      traffic_reset_mode: 'NO_RESET',
    },
  ],

  devices: [
    {
      hwid: 'mock-hwid-iphone',
      platform: 'iOS',
      device_model: 'iPhone 15',
      created_at: inDays(-10),
      local_name: null,
    },
    {
      hwid: 'mock-hwid-mac',
      platform: 'macOS',
      device_model: 'MacBook Air',
      created_at: inDays(-3),
      local_name: 'Рабочий ноут',
    },
  ],

  transactions: [
    {
      id: 2,
      type: 'subscription_payment',
      amount_kopeks: -29900,
      amount_rubles: -299,
      description: 'Продление подписки на 30 дней',
      payment_method: null,
      is_completed: true,
      created_at: inDays(-18),
      completed_at: inDays(-18),
    },
    {
      id: 1,
      type: 'deposit',
      amount_kopeks: 74900,
      amount_rubles: 749,
      description: 'Пополнение баланса',
      payment_method: 'yookassa',
      is_completed: true,
      created_at: inDays(-19),
      completed_at: inDays(-19),
    },
  ],

  notificationSettings: {
    subscription_expiry_enabled: true,
    subscription_expiry_days: 3,
    traffic_warning_enabled: true,
    traffic_warning_percent: 80,
    balance_low_enabled: false,
    balance_low_threshold: 100,
    news_enabled: true,
    promo_offers_enabled: false,
  },

  tickets: [
    {
      id: 1,
      title: 'Не подключается на Android',
      status: 'answered',
      priority: 'normal',
      created_at: inDays(-2),
      updated_at: inDays(-1),
      closed_at: null,
      messages: [
        {
          id: 1,
          message_text: 'Добрый день! Happ на Android не подключается, пишет timeout.',
          is_from_admin: false,
          has_media: false,
          media_type: null,
          media_file_id: null,
          media_caption: null,
          created_at: inDays(-2),
        },
        {
          id: 2,
          message_text:
            'Здравствуйте! Обновите подписку в приложении и попробуйте сервер в Финляндии.',
          is_from_admin: true,
          has_media: false,
          media_type: null,
          media_file_id: null,
          media_caption: null,
          created_at: inDays(-1),
        },
      ],
    },
  ],

  // As on the production cabinet: Platega (SBP QR / RUB cards) and CryptoBot.
  paymentMethods: [
    {
      id: 'platega',
      name: 'Карты (RUB), Мир, СБП',
      description: 'Оплата через Platega',
      min_amount_kopeks: 100,
      max_amount_kopeks: 100000000,
      is_available: true,
      options: [
        { id: 'sbp', name: '🏦 СБП (QR)', description: null },
        { id: 'card', name: '💳 Карты (RUB)', description: null },
      ],
      quick_amounts: [10000, 30000, 50000, 100000],
    },
    {
      id: 'cryptobot',
      name: 'Криптовалюта',
      description: 'Оплата криптовалютой через CryptoBot',
      min_amount_kopeks: 1000,
      max_amount_kopeks: 10000000,
      is_available: true,
      options: null,
      quick_amounts: [10000, 30000, 50000, 100000],
    },
  ],
};

export function subscriptionView(s) {
  const ms = new Date(s.end_date).getTime() - Date.now();
  const left = Math.max(0, ms);
  const days = Math.floor(left / 86400000);
  const hours = Math.floor((left % 86400000) / 3600000);
  const minutes = Math.floor((left % 3600000) / 60000);
  const expired = ms <= 0;
  return {
    ...s,
    days_left: days,
    hours_left: hours,
    minutes_left: minutes,
    time_left_display: `${days} д. ${hours} ч.`,
    traffic_used_percent: s.traffic_limit_gb ? (s.traffic_used_gb / s.traffic_limit_gb) * 100 : 0,
    is_active: !expired && (s.status === 'active' || s.status === 'trial'),
    is_expired: expired,
    is_limited: false,
    traffic_purchases: [],
  };
}

export function subscriptionListItem(s) {
  return {
    id: s.id,
    status: s.status,
    tariff_id: s.tariff_id ?? null,
    tariff_name: s.tariff_name ?? null,
    traffic_limit_gb: s.traffic_limit_gb,
    traffic_used_gb: s.traffic_used_gb,
    device_limit: s.device_limit,
    end_date: s.end_date,
    subscription_url: s.subscription_url,
    subscription_crypto_link: s.subscription_crypto_link,
    is_trial: s.is_trial,
    autopay_enabled: s.autopay_enabled,
    connected_squads: s.connected_squads,
  };
}

// MOCK_SCENARIO=trial — a new user: no subscription, the free trial on offer,
// 100 ₽ of bonus on the balance (as in the Figma "пробный период" frame).
export const SCENARIO = process.env.MOCK_SCENARIO || 'active';
if (SCENARIO === 'trial') {
  db.subscriptions = [];
  db.devices = [];
  db.transactions = [];
  db.user.balance_kopeks = 10000;
  db.user.balance_rubles = 100;
}
db.trialUsed = SCENARIO !== 'trial';
