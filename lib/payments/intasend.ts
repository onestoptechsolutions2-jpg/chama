import "server-only";

/**
 * Thin wrapper around IntaSend's REST API (chosen over calling Safaricom
 * Daraja directly — see docs/architecture.md "Payments & super-admin").
 * Base URLs and the Bearer-secret-key auth scheme are exactly as documented
 * at developers.intasend.com/docs/authentication and
 * developers.intasend.com/docs/api-testing-and-sandbox — pulled from the
 * live docs rather than assumed, since a payment integration is the wrong
 * place to guess.
 */

function getBaseUrl(): string {
  const env = process.env.INTASEND_ENV === "live" ? "live" : "sandbox";
  return env === "live"
    ? "https://payment.intasend.com/api/"
    : "https://sandbox.intasend.com/api/";
}

function getSecretKey(): string {
  const key = process.env.INTASEND_SECRET_KEY;
  if (!key) throw new Error("INTASEND_SECRET_KEY is not set");
  return key;
}

export type IntasendInvoiceState = "PENDING" | "COMPLETE" | "FAILED";

export type StkPushResponse = {
  id: string;
  invoice: {
    invoice_id: string;
    state: IntasendInvoiceState;
    provider: string;
    charges: string;
    net_amount: string;
    currency: string;
    value: string;
    mpesa_reference?: string | null;
    created_at: string;
    updated_at: string;
  };
};

/**
 * Triggers an M-Pesa STK push prompt on the customer's phone.
 * `apiRef` should be our own platform_payments row id (as a string) so the
 * webhook callback can correlate the payment even before/without trusting
 * IntaSend's own invoice_id as the sole key.
 */
export async function triggerMpesaStkPush(params: {
  amount: number;
  phoneNumber: string;
  apiRef: string;
  email?: string;
}): Promise<StkPushResponse> {
  const res = await fetch(`${getBaseUrl()}v1/payment/mpesa-stk-push/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getSecretKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: params.amount.toFixed(2),
      phone_number: params.phoneNumber,
      api_ref: params.apiRef,
      currency: "KES",
      ...(params.email ? { email: params.email } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`IntaSend STK push failed (${res.status}): ${body}`);
  }

  return res.json();
}

/** The flat JSON body IntaSend POSTs to our webhook for a payment state change. */
export type IntasendWebhookPayload = {
  invoice_id: string;
  state: IntasendInvoiceState;
  provider: string;
  charges: string;
  net_amount: string;
  currency: string;
  value: string;
  account: string;
  api_ref: string | null;
  host: string;
  failed_reason: string | null;
  failed_code: string | null;
  created_at: string;
  updated_at: string;
  challenge: string;
};

// isValidIntasendChallenge() lives in lib/domain/payments.ts (pure logic,
// unit-tested there — this file imports "server-only", which throws if
// imported outside Next.js's bundler, so pure/testable checks don't belong
// here even though they're conceptually "IntaSend's" verification rule).
