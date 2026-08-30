# API & Webhooks reference

Every HTTP-facing route in the app. This is deliberately small — most
reads/writes go through Next.js Server Actions (called directly from the
UI, not over HTTP with a stable contract), not a REST API. The routes below
exist because something *other* than this app's own UI needs to call them:
IntaSend's webhook, Vercel Cron, or a plain-`FormData` file upload.

For live configuration status and a log of recent inbound webhook events,
see `/super-admin/integrations` in the app (platform-admin only) — it's
the operational companion to this document.

## Auth model

Every route below is one of:
- **Session-gated** — reads the same httpOnly session cookie every page
  does, via `requireRole()`/`requireSession()`. No separate API key. If
  you're calling one of these from outside a browser session, it isn't
  meant to be called that way.
- **Public + shared-secret** — the IntaSend webhook. Verified by a
  plain-equality check against a configured challenge string, not HMAC
  (see [Webhooks](#webhooks-inbound) below).
- **Public + bearer token** — the two cron routes, verified against
  `CRON_SECRET`.

There is no general-purpose public API and no per-tenant API keys.

## Cron (Vercel Cron only)

Both require `Authorization: Bearer $CRON_SECRET` — Vercel attaches this
header automatically for its own scheduled invocations when `CRON_SECRET`
is set in the project's env vars. A request without it gets `401`.

### `GET /api/cron/contribution-dues`

Daily, 05:00 UTC (08:00 Africa/Nairobi). Two passes, both across every
active group: generates this period's `contribution_dues` row for every
active member whose group's `contributionDay` has arrived (skipped if one
already exists), then fines any due still `pending` more than 5 days past
its date.

```json
// 200 — ran
{ "ok": true, "jobName": "contribution-dues", "rowsAffected": 3, "error": null }
// 200 — another invocation was already in flight (serverless cron is at-least-once)
{ "ok": true, "skipped": "already running" }
// 401
{ "error": "Unauthorized" }
```

### `GET /api/cron/loan-overdue`

Daily, 05:15 UTC (08:15 Africa/Nairobi). Flags any `active`/`extended` loan
past its due date as `overdue` and applies the group's configured late
penalty — at most once every 30 days per loan, so a loan that's been
overdue for months isn't re-penalized daily.

Response shape identical to `contribution-dues` above.

Both crons write one `cron_runs` row per invocation (job name, started/
finished timestamps, rows affected, status) — visible on
`/super-admin/stats`, the queryable answer to "did today's enforcement
actually run" that serverless logs alone don't give you.

## Payments (IntaSend / M-Pesa)

All four trigger routes below share one shape: session-gated (admin, or
admin+treasurer for the subscription one), validate the body, create a
`pending` `platform_payments` row, call IntaSend to start an M-Pesa STK
push (a prompt on the payer's phone), and return immediately — the actual
paid/failed outcome arrives later via the [webhook](#webhooks-inbound)
below, not in this response. If the STK trigger call itself fails (bad
credentials, IntaSend down), the payment row is marked `failed` inline and
the error is returned directly.

Every route: `POST`, JSON body, `Content-Type: application/json`.

### `POST /api/payments/platform-fee`

Admin only. Charges the group's configured `mgrFeePct` on a claimed MGR
slot's payout.

```json
// Request
{ "mgrSlotId": 42, "phone": "0712345678" }
// 200
{ "ok": true, "paymentId": 17, "fee": 150 }
// 400 — validation, slot not found, or no payout amount set
{ "error": "Slot not found" }
// 502 — STK trigger failed
{ "error": "INTASEND_SECRET_KEY is not set" }
```

### `POST /api/payments/loan-fee`

Admin only. Charges the platform's disbursement fee
(`lib/domain/billing.ts`'s `computeTransactionFee("loan_disbursement", ...)`,
currently 0.75% of principal) — refuses if this loan's fee has already
been paid.

```json
{ "loanId": 8, "phone": "0712345678" }
// 200
{ "ok": true, "paymentId": 18, "fee": 37.5 }
```

### `POST /api/payments/subscription-invoice`

Admin or treasurer. Charges an already-generated (via the Billing page's
"Generate invoice" Server Action), still-`pending` `subscription_invoices`
row. Retriggering an invoice that already has a stuck-`pending` prior
payment attempt marks that old attempt `failed` first, so at most one live
pending payment ever exists per invoice.

```json
{ "invoiceId": 5, "phone": "0712345678" }
// 200
{ "ok": true, "paymentId": 19, "amount": 4300 }
```

### `POST /api/payments/wallet-topup`

Admin or treasurer. Tops up the group's prepaid wallet (used only for
instant platform-fee deduction — never member savings/contributions/loan
funds).

```json
{ "amount": 5000, "phone": "0712345678" }
// 200
{ "ok": true, "paymentId": 20, "amount": 5000 }
```

## Webhooks (inbound)

### `POST /api/payments/callback` — IntaSend

**Public** — IntaSend calls this directly and can't authenticate like a
session user, so there's no session/bearer check on the route itself.
Verification is a **shared-secret equality check**, not an HMAC signature —
that's genuinely how IntaSend's webhooks work, not a shortcut taken here.

```json
// IntaSend's actual payload shape
{
  "invoice_id": "...",
  "state": "COMPLETE",          // PENDING | COMPLETE | FAILED
  "api_ref": "...",             // the platform_payments.id this was triggered for
  "net_amount": "...",
  "mpesa_reference": "...",     // present only once M-Pesa has settled
  "challenge": "..."            // must equal INTASEND_WEBHOOK_CHALLENGE
}
```

Every attempt — valid or not — is logged to `payment_webhook_events`
first, before touching anything else; an invalid-challenge attempt is
itself worth a permanent record (either a misconfiguration or a spoofing
attempt). An invalid challenge gets `401` and nothing further happens. A
valid one updates the matching `platform_payments` row (looked up by
`invoice_id`) idempotently — IntaSend can and does resend the same
webhook, and the update is gated on the row's *previous* status (read with
`FOR UPDATE`) so a resend can't double-credit a wallet top-up. `COMPLETE`
→ `paid`, `FAILED` → `failed`, anything else → `pending`. A `paid` wallet
top-up credits the wallet in the same transaction; a `paid`/`failed`
subscription payment cascades that status onto its linked
`subscription_invoices` row.

```json
// Always
{ "ok": true }
// Invalid challenge
{ "error": "Invalid challenge" }   // 401
// Malformed body
{ "error": "Invalid payload" }     // 400
```

To configure: set `INTASEND_WEBHOOK_CHALLENGE` to a string you choose, and
paste the same string into IntaSend's dashboard under the webhook's
settings — they echo it back on every call.

## File upload

### `POST /api/upload`

Session-gated (any authenticated user) — a thin primitive with no business
logic of its own. Used for KYC self-service (`/dashboard/profile`) and
staff adding a member's documents. The caller decides what the returned
URL is used for; this route just stores the file.

`multipart/form-data`, field name `file`. Max 8MB, images or PDF only.
Stored via Vercel Blob at `kyc/{userId}/{timestamp}-{sanitized filename}`,
public access, a random suffix appended to the path.

```json
// 200
{ "url": "https://....public.blob.vercel-storage.com/kyc/12/..." }
// 400
{ "error": "File is too large (max 8MB)" }
{ "error": "Only images or PDFs are accepted" }
// 502 — BLOB_READ_WRITE_TOKEN missing/invalid, or the upload itself failed
{ "error": "..." }
```

Requires `BLOB_READ_WRITE_TOKEN` — provisioned by creating a Blob store in
the Vercel dashboard and linking it to the project (see `.env.example`).
