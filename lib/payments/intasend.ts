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

// ── Group wallets (lib/domain/group-wallet.ts) ───────────────────────────
// Endpoints and fields as in IntaSend's official SDK (IntaSend/intasend-python:
// wallets.py, collections.py, transfers.py): POST wallets/, GET wallets/{id},
// POST payment/mpesa-stk-push/ with wallet_id, POST send-money/initiate/.

/** Group wallets are a deliberate opt-in: they make the platform's IntaSend account custodian of group money. */
export function groupWalletsEnabled(): boolean {
  return process.env.GROUP_WALLETS_ENABLED === "true" && Boolean(process.env.INTASEND_SECRET_KEY);
}

async function intasend<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${getBaseUrl()}v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${getSecretKey()}`,
      "Content-Type": "application/json",
      ...(process.env.INTASEND_PUBLISHABLE_KEY ? { INTASEND_PUBLIC_API_KEY: process.env.INTASEND_PUBLISHABLE_KEY } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`IntaSend ${method} ${path} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

export async function createGroupWallet(label: string): Promise<{ wallet_id: string }> {
  return intasend("POST", "wallets/", { wallet_type: "WORKING", currency: "KES", label, can_disburse: true });
}

export async function getWallet(walletId: string): Promise<{ wallet_id: string; available_balance: number; current_balance: number }> {
  const w = await intasend<{ wallet_id: string; available_balance: string | number; current_balance: string | number }>(
    "GET",
    `wallets/${walletId}`,
  );
  return { wallet_id: w.wallet_id, available_balance: Number(w.available_balance), current_balance: Number(w.current_balance) };
}

/** An M-Pesa prompt on the member's phone; the money lands in the group's wallet. */
export async function stkPushToWallet(params: {
  walletId: string;
  amount: number;
  phoneNumber: string;
  apiRef: string;
  narrative: string;
}): Promise<StkPushResponse> {
  return intasend("POST", "payment/mpesa-stk-push/", {
    amount: params.amount.toFixed(2),
    phone_number: params.phoneNumber,
    api_ref: params.apiRef,
    currency: "KES",
    method: "M-PESA",
    narrative: params.narrative,
    wallet_id: params.walletId,
  });
}

/**
 * Pays out of a group wallet. requires_approval "NO": the two-official
 * approval already happened in the app (approvalError) before this is called.
 */
export async function sendFromWallet(params: {
  walletId: string;
  provider: string;
  transaction: Record<string, unknown>;
  callbackUrl?: string;
}): Promise<{ tracking_id: string; status?: string }> {
  return intasend("POST", "send-money/initiate/", {
    provider: params.provider,
    currency: "KES",
    transactions: [params.transaction],
    requires_approval: "NO",
    wallet_id: params.walletId,
    ...(params.callbackUrl ? { callback_url: params.callbackUrl } : {}),
  });
}

/** Kenyan bank codes for PesaLink payouts. Null if IntaSend can't be reached (the form then takes a code by hand). */
export async function getBankCodes(): Promise<{ name: string; code: string }[] | null> {
  try {
    const res = await fetch(`${getBaseUrl()}v1/send-money/bank-codes/ke/`, { next: { revalidate: 86400 } });
    if (!res.ok) return null;
    const rows = (await res.json()) as { bank_name?: string; bank_code?: string | number }[];
    return rows.filter((r) => r.bank_name && r.bank_code !== undefined).map((r) => ({ name: r.bank_name!, code: String(r.bank_code) }));
  } catch {
    return null;
  }
}
