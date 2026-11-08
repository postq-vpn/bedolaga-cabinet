/**
 * Payment option names from the bot carry a leading emoji («🏦 СБП (QR)»,
 * «💳 Карты (RUB)»). The postq design shows them as plain text.
 */
const LEADING_EMOJI =
  /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\u200d|\ufe0f|\u20e3|\s)+/u;

export function stripLeadingEmoji(name: string): string {
  const stripped = name.replace(LEADING_EMOJI, '');
  return stripped || name;
}
