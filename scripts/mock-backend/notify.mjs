// Test page for cabinet notifications. Pushes WebSocket events the real bot
// sends (src/components/WebSocketNotifications.tsx, TicketNotificationBell.tsx).
//
//   http://localhost:5173/api/mock-notify          — page with a button per event
//   curl -X POST localhost:8080/mock-notify/balance.topup
//   curl -X POST localhost:8080/mock-notify/balance.change -H 'content-type: application/json' \
//        -d '{"amount_kopeks": -5000, "description": "Списание"}'   — fields override the preset

import { db, inDays, rub } from './state.mjs';
import { broadcast, wsClientCount } from './ws.mjs';

function setBalance(kopeks) {
  db.user.balance_kopeks = kopeks;
  db.user.balance_rubles = rub(kopeks);
}

/** type → [group, label, () => payload]. Balance events also move the mock balance. */
const PRESETS = {
  'balance.topup': ['Баланс', 'Пополнение (модалка)', () => {
    setBalance(db.user.balance_kopeks + 50000);
    return { amount_kopeks: 50000, new_balance_kopeks: db.user.balance_kopeks };
  }],
  'balance.change': ['Баланс', 'Изменение баланса', () => {
    setBalance(db.user.balance_kopeks + 15000);
    return { amount_kopeks: 15000, amount_rubles: 150, description: 'Начисление от администратора' };
  }],
  'payment.received': ['Баланс', 'Платёж получен', () => ({ amount_kopeks: 30000, amount_rubles: 300 })],

  'subscription.activated': ['Подписка', 'Активирована (модалка)', () => ({
    expires_at: inDays(30),
    tariff_name: 'Стандарт',
  })],
  'subscription.renewed': ['Подписка', 'Продлена (модалка)', () => ({
    amount_kopeks: 29900,
    new_expires_at: inDays(42),
  })],
  'subscription.expiring': ['Подписка', 'Скоро истекает', () => ({ days_left: 3 })],
  'subscription.expired': ['Подписка', 'Истекла', () => ({})],
  'subscription.daily_debit': ['Подписка', 'Суточное списание', () => {
    setBalance(db.user.balance_kopeks - 1000);
    return { amount_kopeks: 1000, amount_rubles: 10 };
  }],
  'subscription.traffic_reset': ['Подписка', 'Сброс трафика', () => ({})],
  'subscription.devices_purchased': ['Подписка', 'Куплены устройства', () => ({
    amount_kopeks: 10000,
    devices_added: 2,
    new_device_limit: 5,
  })],
  'subscription.traffic_purchased': ['Подписка', 'Куплен трафик', () => ({
    amount_kopeks: 15000,
    traffic_gb_added: 50,
    new_traffic_limit_gb: 150,
  })],

  'autopay.success': ['Автоплатёж', 'Успешно', () => ({ amount_kopeks: 29900, amount_rubles: 299 })],
  'autopay.failed': ['Автоплатёж', 'Ошибка', () => ({ reason: 'Платёжная система недоступна' })],
  'autopay.insufficient_funds': ['Автоплатёж', 'Не хватает денег', () => ({
    required_kopeks: 29900,
    required_rubles: 299,
    balance_kopeks: 4500,
    balance_rubles: 45,
  })],

  'sbp_recurring.confirmed': ['СБП-подписка', 'Списание прошло', () => ({ amount_kopeks: 29900, amount_rubles: 299 })],
  'sbp_recurring.activated': ['СБП-подписка', 'Подключена', () => ({})],
  'sbp_recurring.failed': ['СБП-подписка', 'Ошибка', () => ({})],
  'sbp_recurring.past_due': ['СБП-подписка', 'Просрочена', () => ({})],
  'sbp_recurring.cancelled': ['СБП-подписка', 'Отключена', () => ({})],

  'referral.bonus': ['Рефералы', 'Бонус', () => ({
    bonus_kopeks: 5000,
    bonus_rubles: 50,
    referral_name: 'Иван',
  })],
  'referral.registered': ['Рефералы', 'Новый реферал', () => ({ referral_name: 'Иван' })],

  'ticket.admin_reply': ['Тикеты', 'Ответ поддержки', () => ({
    ticket_id: db.tickets[0]?.id ?? 1,
    title: db.tickets[0]?.title ?? 'Тикет',
    message: 'Попробуйте обновить подписку в приложении.',
  })],
  'ticket.new': ['Тикеты', 'Новый тикет (админ)', () => ({
    ticket_id: 99,
    title: 'Не работает на iOS',
    message: 'Новый тикет от postq_tester',
  })],
  'ticket.user_reply': ['Тикеты', 'Ответ пользователя (админ)', () => ({
    ticket_id: db.tickets[0]?.id ?? 1,
    title: db.tickets[0]?.title ?? 'Тикет',
    message: 'Спасибо, заработало',
  })],

  'account.warning': ['Аккаунт', 'Предупреждение', () => ({ message: 'Слишком много устройств одновременно' })],
  'account.banned': ['Аккаунт', 'Блокировка', () => ({ reason: 'Нарушение правил' })],
  'account.unbanned': ['Аккаунт', 'Разблокировка', () => ({})],
};

function page() {
  const groups = new Map();
  for (const [type, [group, label]] of Object.entries(PRESETS)) {
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(
      `<button data-type="${type}">${label}<span>${type}</span></button>`,
    );
  }
  const sections = [...groups]
    .map(([g, buttons]) => `<section><h2>${g}</h2><div class="grid">${buttons.join('')}</div></section>`)
    .join('');
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Уведомления — mock</title>
<style>
  body { margin: 0; font: 16px/24px system-ui, sans-serif; background: #f4f4f4; color: #111; }
  .layout { display: flex; gap: 24px; padding: 24px 16px; align-items: flex-start; }
  main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 24px; }
  .phone { position: sticky; top: 24px; flex: none; width: 390px; height: min(844px, calc(100vh - 48px));
           border: 0; border-radius: 24px; background: #000; box-shadow: 0 0 0 8px #222; }
  @media (max-width: 800px) { .layout { flex-direction: column-reverse; } .phone { position: static; width: 100%; } }
  h1 { margin: 0; font-size: 32px; line-height: 40px; }
  h2 { margin: 0 0 8px; font-size: 16px; color: #666; font-weight: 500; }
  p { margin: 0; color: #666; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
  button { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding: 12px 16px;
           border: 0; border-radius: 12px; background: #fff; color: #111; font: inherit; text-align: left; cursor: pointer; }
  button:hover { background: #e8e8e8; }
  button span { font-size: 12px; line-height: 16px; color: #888; font-family: ui-monospace, monospace;
                max-width: 100%; overflow-wrap: anywhere; }
  #status { font-size: 12px; line-height: 16px; }
</style></head>
<body><div class="layout"><main>
  <h1>Уведомления</h1>
  <p>Справа — кабинет; войдите в нём, если просит. Кнопка отправляет событие во все
     открытые кабинеты, тост живёт 5–8 секунд — смотрите на кабинет справа.</p>
  <p id="status">Подключено кабинетов: ${wsClientCount()}</p>
  ${sections}
</main>
<iframe class="phone" src="/" title="Кабинет"></iframe></div>
<script>
  const status = document.getElementById('status');
  document.querySelectorAll('button[data-type]').forEach((b) => {
    b.addEventListener('click', async () => {
      const r = await fetch(location.pathname.replace(/[/]+$/, '') + '/' + b.dataset.type, { method: 'POST' });
      const d = await r.json();
      status.textContent = d.delivered
        ? 'Отправлено ' + b.dataset.type + ' → кабинетов: ' + d.delivered
        : 'Нет подключённых кабинетов — откройте кабинет и войдите';
    });
  });
</script>
</body></html>`;
}

export const notifyRoutes = [
  ['GET /mock-notify', () => ({ __html: page() })],
  [
    'POST /mock-notify/:type',
    ({ params, body }) => {
      const preset = PRESETS[params.type];
      const { raw: _raw, ...overrides } = body || {};
      const message = { type: params.type, ...(preset ? preset[2]() : {}), ...overrides };
      const delivered = broadcast(message);
      console.log(`WS   → ${params.type} (${delivered} open)`);
      return { delivered, message };
    },
  ],
];
