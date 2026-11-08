import { describe, expect, it } from 'vitest';
import { stripLeadingEmoji } from './stripLeadingEmoji';

describe('stripLeadingEmoji', () => {
  it('drops a leading emoji and the space after it', () => {
    expect(stripLeadingEmoji('🏦 СБП (QR)')).toBe('СБП (QR)');
    expect(stripLeadingEmoji('💳 Карты (RUB)')).toBe('Карты (RUB)');
    expect(stripLeadingEmoji('🇷🇺 Мир')).toBe('Мир');
    expect(stripLeadingEmoji('❤️ ЮMoney')).toBe('ЮMoney');
  });
  it('keeps names without one, and emoji-only names', () => {
    expect(stripLeadingEmoji('Карты (RUB)')).toBe('Карты (RUB)');
    expect(stripLeadingEmoji('СБП 🏦')).toBe('СБП 🏦');
    expect(stripLeadingEmoji('💳')).toBe('💳');
  });
});
