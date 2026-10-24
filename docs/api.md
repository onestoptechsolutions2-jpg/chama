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

### `GET /api/cron/mgr-reminders`

Daily, 05:45 UTC (08:45 Africa/Nairobi). For every `active` MGR cycle dated
tomorrow (Nairobi), notifies each member who has a login that contributions
are due, and notifies whoever holds a claimed/assigned slot in it that their
turn is tomorrow. Skips anyone already reminded for that cycle, so a
double-fired cron sends nothing twice. Response shape identical to
`contribution-dues` above.

All the crons write one `cron_runs` row per invocation (job name, started/
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

## Partner API — funeral funds (Family Compass)

Server-to-server, for a partner that creates **funeral funds**: a
short-lived group for a funeral harambee. Mourners give by M-Pesa prompt
into the fund's own IntaSend wallet without joining; the committee are the
group's officials, and money leaves only to the account the family
nominated, after one official asks and another approves (see Group
wallets below). Needs `GROUP_WALLETS_ENABLED`; otherwise `POST /funds`
returns 503 and the partner keeps its manual fallback.

Auth: `Authorization: Bearer <token>`, one token per partner in
`PARTNER_API_TOKENS` (`familycompass:<token>,…`, tokens ≥ 24 chars). A
partner only ever sees its own funds (another's id is a 404). All amounts
are whole shillings. Base: `/api/partner/v1`.

### `POST /funds` — create (idempotent on `ref`)

```json
{ "ref": "memorial-42", "deceasedName": "Jane Wanjiru", "name": "optional",
  "closesOn": "2026-12-23",            // optional, default 60 days, at most 120
  "targetKes": 200000,                 // optional
  "committee": [ { "name": "Wanjiku Kamau", "phone": "0712345678", "role": "chair" },
                 { "name": "Akinyi Otieno", "phone": "0722111222", "role": "treasurer" } ],
  "branches": ["Kamau family", "Wanjiru family"],
  "payout": { "kind": "mpesa", "phone": "0799000111", "name": "Mary Wanjiru" },
  "webhookUrl": "https://partner.example/chama-webhook" }
// 201 { "fundId": 15, "ref", "name", "deceasedName", "status": "open", "closesOn", "targetKes",
//       "branches", "giveUrl": "https://<chama>/f/<token>",
//       "webhookSecret": "<shown once>", "invites": [{ "phone", "role", "sent" }] }
// 200 (same ref again) — the same fund, without webhookSecret
```

- Committee: a chair is required (chair = group admin), at most one of each
  role, distinct valid phones. Each gets an SMS invite and joins with their
  own login. Platform staff accounts are refused.
- `payout` kinds: `mpesa` (phone), `paybill` (paybill + accountRef), `till`,
  `bank` (bankCode + account). Set only here, before any money arrives;
  afterwards only the chair can change it in the app.

### `POST /funds/{fundId}/gifts` — M-Pesa prompt for a mourner

```json
{ "name": "Peter", "phone": "0711000001", "amount": 1000, "branch": "Kamau family",
  "message": "Pole sana", "anonymous": false }
// 202 { "giftId": 1, "status": "pending" }
```

Ksh 10 – 250,000; `branch` must be one of the fund's branches; at most 3
prompts per phone per fund in 10 minutes (429); refused once the fund is
closed. The result arrives as a `fund.gift.paid` / `fund.gift.failed`
webhook.

### `GET /funds/{fundId}` — live totals

```json
{ "fundId", "ref", "name", "deceasedName", "status": "open|closed|converted", "closesOn",
  "targetKes", "branches", "giveUrl", "total": 1500, "giftCount": 2,
  "byBranch": [{ "branch": "Kamau family", "total": 1000, "count": 1 }],
  "recent": [{ "name": "Well-wisher", "amount": 500, "message": "Rest in peace", "paidAt": "…" }] }
```

`byBranch` is for the committee — the partner decides who sees it (Chama's
own public page doesn't show it). Anonymous givers show as "Well-wisher".

### `POST /funds/{fundId}/convert` — keep going as a family welfare chama

```json
{ "members": [{ "name": "John Kamau", "phone": "0733000001" }] }
// 200 { "groupId": 15, "status": "converted", "invites": [{ "phone", "invited", "sms", "reason" }] }
```

Stops gifts, switches on welfare with the funeral benefit table and rules,
and invites each person (duplicates and bad phones are skipped and
reported). The committee stay as officials; the group then subscribes
like any other.

### Webhooks to `webhookUrl`

Same signing as group webhooks (`X-Chama-Timestamp`,
`X-Chama-Signature-256`, `eventId`; see Outbound webhooks):
`fund.gift.paid` `{ fundId, ref, giftId, name, amount, branch, message, total, giftCount, byBranch }`,
`fund.gift.failed` `{ fundId, ref, giftId }`,
`fund.closed` `{ fundId, ref, total, giftCount }` (daily job
`/api/cron/funds-close` just after midnight Nairobi).

### Bereavement referral (Chama → Family Compass)

When a group approves a **bereavement** welfare claim and the claimant
ticked "Family Compass may text me an offer", Chama POSTs to
`FAMILY_COMPASS_REFERRAL_URL`, signed the same way with
`FAMILY_COMPASS_REFERRAL_SECRET`:

```json
{ "eventId": "…", "event": "bereavement.approved", "groupId": 15, "groupName": "…",
  "referrerCode": "chama-15", "payout": { "kind": "mpesa", … } | null }
// Family Compass answers 200 { "link": "https://<family-compass>/r/<code>?to=/shop/funeral-programme" }
```

No personal details are sent. Chama texts the link to the claimant (only
a link on Family Compass's own origin). `payout` is the group's nominated
account, where Family Compass pays the group's referral commission.

## Group wallets (IntaSend) — optional

Off unless `GROUP_WALLETS_ENABLED=true` and `INTASEND_SECRET_KEY` are set
(`groupWalletsEnabled()`). Server Actions only, no public routes
(`app/(dashboard)/dashboard/payments/wallet-actions.ts`), all through
commands in `lib/commands/wallet.ts`:

| Command | Permission | What it does |
|---|---|---|
| `wallet.enable` | `settings.manage` | `POST wallets/` — a WORKING KES wallet labelled `GROUP-<id>` |
| `collections.prompt` | `group.view` (others: `money.record`) | pending `incoming_payments` row (member + purpose known), then `POST payment/mpesa-stk-push/` with `wallet_id` and `api_ref chama-<group>-<payment>` |
| `collections.confirm` | `money.record` (via `mpesa`) | from the webhook: COMPLETE → applied to the member and receipted; FAILED → failed. Idempotent |
| `wallet.setDestination` | `money.payoutDestination` (admin; never support) | bank (PesaLink, bank code), paybill, till or M-Pesa number (B2C) |
| `wallet.requestWithdrawal` | `money.withdraw` | checks the live balance and destination |
| `wallet.approveWithdrawal` | `money.approveWithdrawal` | a different official; then `POST send-money/initiate/` (PESALINK or MPESA-B2B) |
| `wallet.cancelWithdrawal` | `money.withdraw` | only while waiting for approval |

The existing IntaSend webhook (`/api/payments/callback`) routes a COMPLETE /
FAILED event whose `invoice_id` matches a prompt to `collections.confirm`.
Withdrawals are `movesMoney`: the agent can't run them, and in support mode
only platform owners can.

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

## Incoming M-Pesa payments (C2B) — the group's own paybill/till

### `POST /api/mpesa/c2b/<token>/validation` and `/confirmation`

Safaricom Daraja C2B notifications for a group's **own** paybill or till.
The URLs (with the group's secret `<token>`) are shown on the group's
Payments page; register them with Daraja's *Register URL* or give them to
the group's M-Pesa provider. The money goes to the group's account — this
app only records it.

- **validation** → always accepts.
- **confirmation** → stores the payment once (`incoming_payments`, unique
  per group + `TransID`, so retries are harmless), matches it to a member
  by the account reference (`BillRefNumber`: member number, optionally
  followed by `welfare`/`loan`/`savings`/`shares`, e.g. `12 welfare`, `12W`)
  or phone, and records it with the same contribution/repayment rules as
  the app (`payments.receive`, `via: mpesa`). Unmatched payments wait on
  the Payments page.
- Always answers `{"ResultCode":0,"ResultDesc":"Accepted"}` for a known
  token (refusing would make Safaricom reverse the member's payment);
  unknown token → 404. Daraja doesn't sign callbacks, so the token is the
  credential; the group can rotate it from the Payments page.

Bank statements and payroll check-off files are imported as CSV on the
Payments page (`payments.import`), with the same matching.

## The agent (deterministic — no AI)

The agent is a set of fixed rules ("playbooks", `lib/domain/agent-playbooks.ts`),
not an AI model: the same group records always produce the same actions. It
runs daily from Vercel Cron (`GET /api/cron/agent`, 09:00 Nairobi), from the
Support console's **Run agent** button (preview, then *Do it*), or from
another system with:

### `GET /api/internal/agent`
Lists the playbooks and the rule each follows.

### `POST /api/internal/agent`

```json
{ "groupId": 12, "playbooks": ["rematch-payments"], "dryRun": true }
// 200 { "groupId": 12, "groupName": "...", "dryRun": true,
//       "steps": [{ "playbook": "rematch-payments", "summary": "Payment #8 → Akinyi (capital, matched by account)", "ok": null }] }
```

- Auth: `Authorization: Bearer $AGENT_API_TOKEN`. `dryRun` defaults to true.
- It can only run playbooks — it can't be given arbitrary commands, so no
  outside system (an AI model included) can steer it.
- Each step runs through the normal commands as `via: agent` with the
  playbook as the reason: permission-checked, re-validated, audited, never
  moving money out.

Playbooks: **rematch-payments** (re-checks unmatched payments against
today's member numbers/phones) and **loan-reminders** (SMS 3 days before,
on the due date, and weekly while overdue).

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

Records a contribution by running the same command as the in-app button
(`lib/commands/contributions.ts` → `contributions.record`): member check,
balance update (atomic), welfare routing, audit log (`via: api`), the
`contribution.recorded` webhook and the member's SMS receipt.

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

`welfare`-type contributions don't move a `members` balance field — they
are split into the welfare fund's reserves by the group's welfare policy,
the same as from the app. (Before the command layer, API welfare
contributions skipped the fund; that drift is why the logic is now shared.)

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
submission isn't exposed yet. Integrate with the welfare lifecycle by
*subscribing to the `welfare.request.*` [webhook events](#outbound-webhooks)
below instead.

```json
{ "welfareRequests": [ { "id": 6, "memberId": 5, "amount": "5000.00", "status": "pending", "...": "..." } ] }
```

### `GET /api/v1/welfare/policy`

A group's welfare policy — funding method, reserve-allocation split,
per-request caps, approval-tier thresholds, and cooldown/tenure rules —
so an integrator can validate against real limits instead of guessing.

```json
{
  "policy": {
    "fundingMethod": "pct_contribution", "fundingPct": "10.00",
    "emergencyAllocationPct": "50.00", "longTermAllocationPct": "30.00",
    "advanceAllocationPct": "20.00",
    "maxEmergencyGrant": "20000.00", "maxLongTermGrant": "50000.00",
    "maxAdvance": "30000.00", "maxOutstandingAdvancePerMember": "30000.00",
    "minEmergencyReserveFloor": "0.00",
    "maxClaimsPerMemberPerYear": 2, "cooldownDays": 30, "minTenureMonths": 0,
    "advanceFeePct": "0.00", "advanceMaxRepaymentMonths": 6,
    "tier1MaxAmount": "10000.00", "tier2MaxAmount": "30000.00",
    "allowOverdraft": false
  }
}
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
X-Chama-Timestamp: 1793091600
X-Chama-Signature-256: <hex HMAC-SHA256 of "<timestamp>.<raw body>", keyed with your endpoint's secret>
X-Chama-Signature: <hex HMAC-SHA256 of the raw body alone — kept for older integrations>
```

```json
{
  "eventId": "8b0d1c7e-…",
  "event": "contribution.recorded",
  "groupId": 12,
  "occurredAt": "2026-08-31T09:00:00.000Z",
  "data": { "contributionId": 89, "memberId": 5, "type": "capital", "amount": 1000 }
}
```

### Verifying the signature

Recompute the HMAC over `"<X-Chama-Timestamp>.<raw body>"` — the **exact
raw bytes** of the body (don't re-serialize the parsed JSON) — with your
endpoint's secret, compare it to `X-Chama-Signature-256`, and reject a
timestamp more than ~5 minutes old (replay protection). `eventId` is unique
per event: store the ones you've handled and ignore repeats.

```js
import { createHmac, timingSafeEqual } from "crypto";

function isValidChamaWebhook(rawBody, timestamp, signatureHeader, secret) {
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
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
| `welfare.request.submitted` | `{ requestId, memberId, amount }` | A member submits a "Request help" form |
| `welfare.request.approved` | `{ requestId, memberId, amount }` | A tier1 staff decision or a tier2/tier3 quorum approves a request — fires alongside `.disbursed`, since approval and disbursement happen atomically in this domain (there's no separate "approved but not yet paid" moment) |
| `welfare.request.rejected` | `{ requestId, memberId, amount }` | A tier1 staff decision, or any single tier2/tier3 co-signer declining |
| `welfare.request.disbursed` | `{ requestId, memberId, amount }` | Money actually leaves the welfare fund's reserves for a request |

`welfare.request.*` `amount` is the combined emergency + long-term + advance
total (requested for `.submitted`/`.rejected`, approved for
`.approved`/`.disbursed`).

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

## Sign-in with Google

Optional; both routes are public and do nothing unless `GOOGLE_CLIENT_ID`
and `GOOGLE_CLIENT_SECRET` are set.

- `GET /api/auth/google?next=/path` — stores a one-time `g_state` cookie (and
  `g_next`, same-origin relative paths only) and redirects to Google.
- `GET /api/auth/google/callback` — verifies `state`, exchanges the code,
  requires a verified email, finds or creates the user, opens a session and
  redirects to `next` (default `/dashboard`). Any failure redirects to
  `/login?error=google`.

## File upload

### `POST /api/upload`

Session-gated (any authenticated user) — a thin primitive with no business
logic of its own. Used for KYC self-service (`/dashboard/profile`) and
staff adding a member's documents. The caller decides what the returned
URL is used for; this route just stores the file.

`multipart/form-data`, field name `file`. Max 8MB. JPG, PNG, WebP or PDF only (SVG is refused).
Stored via Vercel Blob at `kyc/{userId}/{timestamp}-{sanitized filename}`,
public access, a random suffix appended to the path.

```json
// 200
{ "url": "https://....public.blob.vercel-storage.com/kyc/12/..." }
// 400
{ "error": "File is too large (max 8MB)" }
{ "error": "Please upload a photo (JPG, PNG) or a PDF" }
// 502 — BLOB_READ_WRITE_TOKEN missing/invalid, or the upload itself failed
{ "error": "..." }
```

Requires `BLOB_READ_WRITE_TOKEN` — provisioned by creating a Blob store in
the Vercel dashboard and linking it to the project (see `.env.example`).
