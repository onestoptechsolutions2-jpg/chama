# API & Webhooks reference

Every HTTP-facing route in the app. Most of this document covers two very
different things, so don't confuse them:

- **The internal routes** (cron, payments, inbound IntaSend webhook, file
  upload) — session- or shared-secret-gated, built for this app's own UI
  and infrastructure, no stable versioning promise.
- **The public developer API** (`/api/v1/*`) and **outbound webhooks** —
  built for a *third-party developer* integrating their own system with a
  single group's data (an accounting sync, a custom dashboard, an SMS
  gateway). This is the part covered by [Public developer API](#public-developer-api-v1)
  and [Outbound webhooks](#outbound-webhooks) below.

For live configuration status and a log of recent inbound webhook events,
see `/super-admin/integrations` in the app (platform-admin only) — it's
the operational companion to this document. A group's own API keys and
webhook subscriptions are managed at `/dashboard/developer` (group admin
only), not `/super-admin`.

## Auth model

Every route below is one of:
- **Session-gated** — reads the same httpOnly session cookie every page
  does, via `requireRole()`/`requireSession()`. No API key. If you're
  calling one of these from outside a browser session, it isn't meant to
  be called that way.
- **Public + shared-secret** — the IntaSend webhook. Verified by a
  plain-equality check against a configured challenge string, not HMAC
  (see [Webhooks (inbound)](#webhooks-inbound) below).
- **Public + bearer token (platform)** — the two cron routes, verified
  against `CRON_SECRET`.
- **Public + bearer token (per-group API key)** — every `/api/v1/*` route.
  Verified against a per-group key a group admin generates themselves at
  `/dashboard/developer`. See [Public developer API](#public-developer-api-v1).

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

## Public developer API (v1)

For a third-party developer connecting their own system to **one specific
group's** data — not for this app's own UI, which uses Server Actions
throughout. Every route is scoped to exactly the group the API key
belongs to; there is no cross-group or platform-wide key.

### Authentication

Generate a key at `/dashboard/developer` (group admin only, any plan) —
click "New API key", give it a name so it's recognizable in the list
later, and copy the plaintext value shown. **It is shown exactly once**
and cannot be retrieved again; only a hash is stored server-side, the same
convention as GitHub/Stripe personal tokens. If it's lost, revoke it and
generate a new one — revoking takes effect immediately and is permanent.

Send it on every request:

```
Authorization: Bearer chama_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

```json
// 401 — missing header
{ "error": "Missing Authorization: Bearer <key> header" }
// 401 — unknown or revoked key
{ "error": "Invalid or revoked API key" }
```

A valid key updates its `last used` timestamp (visible in the
`/dashboard/developer` table) on every call, best-effort — a failure to
record that never fails the request itself.

### Scope: read + a few safe writes

v1 is deliberately narrow. Every route below is `GET` except
`POST /api/v1/contributions` — the one write judged safe to expose:
recording money *coming into* a member's balance, never a disbursement,
an approval, or anything that moves money the other direction. Loan
approval, membership approval, and welfare-request submission all involve
multi-step domain logic (eligibility checks, tiered approval, notification
fan-out) that stays Server-Action-only for now; integrate with those flows
by *subscribing to their webhook events* instead (below), not by trying to
trigger them over the API.

### `GET /api/v1/group`

```json
// 200
{
  "group": {
    "id": 12, "name": "Umoja Chama", "type": "chama",
    "description": "...", "currency": "KES",
    "loansEnabled": true, "mgrEnabled": true,
    "welfareEnabled": true, "projectsEnabled": false,
    "registrationComplete": true
  }
}
```

### `GET /api/v1/members`

Active and inactive members both included; check `active`.

```json
// 200
{
  "members": [
    {
      "id": 5, "name": "Jane Wanjiru", "phone": "0712345678",
      "email": "jane@example.com", "capital": "15000.00",
      "security": "2000.00", "personalSavings": "500.00",
      "totalFines": "0.00", "active": true, "joinedDate": "2025-01-10"
    }
  ]
}
```

### `GET /api/v1/contributions`

Optional `?memberId=5` to filter. Newest first, capped at 200 rows.

```json
// 200
{
  "contributions": [
    { "id": 88, "groupId": 12, "memberId": 5, "amount": "1000.00",
      "type": "capital", "status": "paid", "reference": "AUG-2026",
      "createdAt": "2026-08-15T05:00:00.000Z", "...": "..." }
  ]
}
```

### `POST /api/v1/contributions`

Records a contribution and updates the member's running balance, exactly
as `recordContributionAction` does from the Contributions page. Fires a
`contribution.recorded` webhook on success.

```json
// Request
{
  "memberId": 5,
  "type": "capital",           // capital | security | mgr | welfare | personal_savings | project | other
  "amount": 1000,
  "reference": "AUG-2026"       // optional
}
// 201
{ "ok": true, "id": 89 }
// 400 — validation (bad type/amount, or amount fails this group's rules,
//        e.g. below its configured minPersonalSavingsIncrement)
{ "error": "..." }
// 404
{ "error": "Member not found" }
```

`welfare`-type contributions are recorded but don't move a `members`
balance field — welfare has its own fund, managed separately.

### `GET /api/v1/loans`

Newest first, capped at 200 rows.

```json
// 200
{
  "loans": [
    { "id": 21, "memberId": 5, "principal": "20000.00",
      "interestRate": "10.00", "totalRepayable": "22000.00",
      "amountRemaining": "22000.00", "status": "active",
      "purpose": "School fees", "dueDate": "2026-11-15",
      "createdAt": "2026-08-15T09:00:00.000Z" }
  ]
}
```

### `GET /api/v1/fines`

```json
{ "fines": [ { "id": 3, "memberId": 5, "amount": "200.00", "reason": "...", "status": "unpaid", "...": "..." } ] }
```

### `GET /api/v1/meetings`

```json
{ "meetings": [ { "id": 9, "meetingDate": "2026-08-20", "...": "..." } ] }
```

### `GET /api/v1/mgr/cycles`

Merry-go-round cycles and slots for this group, only present if
`mgrEnabled`.

```json
{
  "cycles": [ { "id": 2, "cycleNumber": 2, "...": "..." } ],
  "slots": [
    { "id": 14, "cycleNumber": 2, "slotNumber": 3, "memberId": 5,
      "status": "paid", "payoutAmount": "18000.00",
      "paidAt": "2026-08-10T00:00:00.000Z" }
  ]
}
```

### `GET /api/v1/welfare/requests`

Read-only — see [Scope](#scope-read--a-few-safe-writes) above for why
submission isn't exposed yet.

```json
{ "welfareRequests": [ { "id": 6, "memberId": 5, "amount": "5000.00", "status": "pending", "...": "..." } ] }
```

### `GET /api/v1/capital-position`

The same aggregate the Capital dashboard page shows — pooled
capital/security/personal-savings, welfare fund available (if enabled),
and outstanding loan principal/receivable.

```json
{
  "position": {
    "capitalPool": 150000, "securityPool": 20000,
    "personalSavingsPool": 5000, "welfareAvailable": 12000,
    "projectsCommitted": 0,
    "loanPrincipalOutstanding": 40000,
    "loanReceivableOutstanding": 44000
  }
}
```

## Outbound webhooks

A group admin subscribes an HTTPS endpoint to one or more event types at
`/dashboard/developer`. When a subscribed event happens, this app POSTs
the event to every active endpoint subscribed to it.

### Setting up an endpoint

"New webhook endpoint" → paste the URL your system exposes, pick which
event types to receive, save. The signing **secret is shown once**, at
creation — copy it then; only a hash-equivalent isn't kept, so if it's
lost, delete the endpoint and create a new one. Endpoints can be paused
(kept, stops receiving) or deleted from the same page. The last 20
delivery attempts across all of a group's endpoints are visible there too
— status, HTTP response code, and error message if any.

### Request shape

```
POST <your configured URL>
Content-Type: application/json
X-Chama-Event: contribution.recorded
X-Chama-Signature: <hex HMAC-SHA256 of the raw request body, keyed with your endpoint's secret>
```

```json
{
  "event": "contribution.recorded",
  "groupId": 12,
  "occurredAt": "2026-08-31T09:00:00.000Z",
  "data": { "contributionId": 89, "memberId": 5, "type": "capital", "amount": 1000 }
}
```

### Verifying the signature

Recompute the HMAC over the **exact raw bytes** of the request body
(don't re-serialize the parsed JSON — key order/whitespace would differ)
using your endpoint's secret, and compare to `X-Chama-Signature`:

```js
import { createHmac, timingSafeEqual } from "crypto";

function isValidChamaWebhook(rawBody, signatureHeader, secret) {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signatureHeader ?? "", "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
```

### Event types and payloads

| Event | `data` shape | Fired from |
|---|---|---|
| `contribution.recorded` | `{ contributionId, memberId, type, amount }` | `POST /api/v1/contributions`, and the Contributions page's own `recordContributionAction` |
| `loan.approved` | `{ applicationId, memberId, amount }` | Loan application review, admin approves |
| `loan.rejected` | `{ applicationId, memberId, amount }` | Loan application review, admin rejects |
| `member.joined` | `{ membershipId, userId, name }` | A pending join request is approved |
| `mgr.slot.paid` | `{ slotId, memberId, payoutAmount, payoutReference }` | An MGR slot is marked paid |

### Delivery semantics — read this before relying on it

- **Single attempt, no retry queue.** This app is fully serverless with no
  background job runner, so a failed delivery (your endpoint down,
  timeout, non-2xx response) is not retried automatically. Every attempt
  — success or failure — is logged and visible at `/dashboard/developer`,
  so build your own reconciliation (e.g. poll `GET /api/v1/contributions`
  periodically as a backstop) if you can't tolerate a missed event.
- **8-second timeout.** Your endpoint must respond within 8s or the
  attempt is recorded as failed.
- **Fire-and-forget, always after the fact.** A webhook is dispatched only
  after the triggering action has fully committed — a slow or unreachable
  subscriber never blocks or fails the action itself (approving a loan
  still succeeds even if every webhook delivery to it fails).
- **Respond `2xx` quickly.** Do the real work asynchronously on your side;
  don't make this app wait on it.

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
