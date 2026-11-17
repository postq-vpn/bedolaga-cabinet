import { expect, it } from 'vitest';
import { stripLeadingEmoji } from './usePromocode';

it('drops the emoji the bot puts in front of its texts', () => {
  expect(stripLeadingEmoji('💸 Получена скидка 15% (действует 24 ч.)')).toBe(
    'Получена скидка 15% (действует 24 ч.)',
  );
  expect(stripLeadingEmoji('🎁️ +7 дней')).toBe('+7 дней');
  expect(stripLeadingEmoji('👨‍👩‍👧 Семья')).toBe('Семья');
  expect(stripLeadingEmoji('+100 ₽ на баланс')).toBe('+100 ₽ на баланс');
});
