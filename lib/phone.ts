// South Africa is WDF Call's default dialling context.
const DEFAULT_COUNTRY_CODE = '27';

/**
 * Normalises a number typed on the dialpad into E.164 for dialling, so users
 * don't need to type the country code for local South African numbers.
 * Mirrors the same logic used in the Flutter app (TwilioService.normalizeDialed).
 *
 *   +27821234567  -> +27821234567  (already E.164, passed through)
 *   0027821234567 -> +27821234567  (00 = international access code)
 *   0821234567    -> +27821234567  (leading 0 = SA national trunk code)
 *   27821234567   -> +27821234567  (already carries the SA country code)
 *   821234567     -> +27821234567  (bare subscriber number, no trunk 0)
 *
 * Returns null if it can't form a valid E.164 number.
 */
export function normalizeDialed(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  const hasPlus = raw.startsWith('+');
  const digits = raw.replace(/[^0-9]/g, '');
  if (!digits) return null;

  let e164: string;
  if (hasPlus) {
    e164 = `+${digits}`;
  } else if (digits.startsWith('00')) {
    e164 = `+${digits.slice(2)}`;
  } else if (digits.startsWith('0')) {
    e164 = `+${DEFAULT_COUNTRY_CODE}${digits.slice(1)}`;
  } else if (digits.startsWith(DEFAULT_COUNTRY_CODE)) {
    e164 = `+${digits}`;
  } else {
    e164 = `+${DEFAULT_COUNTRY_CODE}${digits}`;
  }

  return isValidE164(e164) ? e164 : null;
}

/** Basic E.164 validation: a leading '+', then 7-15 digits, first non-zero. */
export function isValidE164(value: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(value);
}
