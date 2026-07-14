/**
 * Bug 5 (docs/architecture.md): the original payments.js hardcoded the
 * platform fee at 5% instead of reading the group's configurable
 * groups.mgr_fee_pct — the Settings UI field did nothing. This is the one
 * place the fee is computed; every call site passes the group's actual
 * mgrFeePct instead of a literal.
 */
export function calcPlatformFee(amount: number, feePct: number): number {
  // amount * feePct is algebraically (amount * feePct / 100) * 100, i.e.
  // the fee scaled up by 100 — rounding that to the nearest integer before
  // dividing back down is the standard "round currency to 2dp" idiom.
  return Math.round(amount * feePct) / 100;
}

/**
 * Kenyan phone numbers are stored/entered as 07XXXXXXXX or 01XXXXXXXX but
 * IntaSend (like Daraja) expects the 2547XXXXXXXX / 2541XXXXXXXX MSISDN
 * format for STK push.
 */
export function normalizeKenyanPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 10) return `254${digits.slice(1)}`;
  if (digits.startsWith("254") && digits.length === 12) return digits;
  if (digits.startsWith("7") && digits.length === 9) return `254${digits}`;
  return digits;
}

/**
 * This webhook-verification check is pure (env var in, boolean out) and
 * deliberately lives here rather than in lib/payments/intasend.ts — that
 * file imports "server-only" (correctly, since it also makes outbound
 * fetch() calls with a secret credential), but that guard throws when the
 * module is imported outside Next.js's bundler, which meant this check was
 * never actually unit-tested before this was noticed.
 *
 * IntaSend doesn't sign webhooks with an HMAC — it echoes back a static
 * `challenge` string configured once in the dashboard alongside the
 * webhook URL. Verification is a plain equality check against that
 * pre-shared value (see developers.intasend.com/docs/payment-collection-events).
 */
export function isValidIntasendChallenge(payload: { challenge?: string }): boolean {
  const expected = process.env.INTASEND_WEBHOOK_CHALLENGE;
  return !!expected && payload.challenge === expected;
}
