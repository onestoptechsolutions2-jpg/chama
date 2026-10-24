# Architecture

Current-state technical reference for the Chama Platform. For *why* things
are shaped this way and the bugs that shaped them, see
[`CHANGELOG.md`](./CHANGELOG.md) — that file has the full phase-by-phase
build history and every real bug found along the way. This file only
describes what's true today.

See also: [`user-guide.md`](./user-guide.md) (what the app does, by role),
[`developer-guide.md`](./developer-guide.md) (how to work on it), and
[`api.md`](./api.md) (every HTTP-facing route and the IntaSend webhook
contract).

## What this app is

A multi-tenant SaaS for managing African group-savings associations
("chama" = Kenyan savings circle). One deployment serves many independent
**groups** (tenants), each of one of four **types** — `chama`, `welfare`,
`hybrid`, `selfhelp` — which seed a default set of active **products**
(loans, MGR, welfare, projects) at creation. Products are independently
toggleable after that (Settings → Products) — `type` is just a descriptive
label and a one-time default, not a permanent gate.

| Product | What it is |
|---|---|
| Members, contributions, rules, meetings, fines | The base ledger every group always has |
| Loans | Member-requested or staff-direct loans, interest + guarantors + repayment tracking |
| MGR (merry-go-round) | Rotating-payout cycles — each member takes a turn receiving the pooled contribution |
| Welfare | A multi-reserve fund (emergency/long-term/advance) with tiered-approval claims |
| Projects | Table-banking style group-funded projects, target vs. collected |

A user can belong to multiple groups with a **different role per group**
(`admin`, `treasurer`, `secretary`, `member`) via `group_memberships` — this
is the multi-tenancy backbone. A separate, platform-wide `users.platformRole`
(`owner` | `support` | `null`) gates the super-admin console, independent of
any per-group role.

## Stack

| Layer | Choice |
|---|---|
| Hosting | Vercel, Node.js serverless runtime (not Edge — needs the full Postgres driver) |
| Framework | Next.js App Router, Server Actions for app-triggered writes, Route Handlers for third-party callers |
| Database | Neon Postgres, connected directly (not the Vercel Postgres wrapper) — plain Postgres so RLS, `FOR UPDATE`, and advisory locks all work unmodified |
| ORM | Drizzle — `lib/db/schema.ts` is the single source of truth; a phantom-column reference is a compile error, not a runtime 500 |
| Auth | Hand-rolled DB-backed session cookie (not NextAuth) — see [Auth](#auth-db-backed-session-cookie) |
| Design system | Tailwind + shadcn/ui on **Base UI** primitives (not Radix) — this install uses a `render` prop for composition (`<Trigger render={<Button />} />`), not Radix's `asChild`/`Slot` |
| Payments | IntaSend (M-Pesa gateway) — see [`api.md`](./api.md) |
| File storage | Vercel Blob (`@vercel/blob`) for KYC document/photo/signature uploads |

## Multi-tenancy & Row-Level Security

RLS is **defense-in-depth**, not the sole mechanism — the query layer still
writes explicit `WHERE group_id = ...`, and RLS is the fail-safe net.
Forgetting the tenant wrapper means RLS returns zero rows (safe failure),
not another tenant's data.

- Every tenant-scoped table: `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL
  SECURITY` (FORCE is required because the app connects as one Postgres
  role, not per-tenant credentials — see [Roles](#database-roles) below).
- Standard tenant policy shape: `USING (group_id = NULLIF(current_setting
  ('app.current_group_id', true), '')::int OR current_setting
  ('app.is_platform_admin', true) = 'true')`. The `NULLIF` guard matters —
  on a pooled connection, once any transaction has set the GUC, a later one
  that never sets it sees `''`, not `NULL`, and `''::int` throws.
- `groups` gets extra policies beyond the standard tenant one: anonymous
  `SELECT` where `is_public = true AND registration_complete = true`
  (`groups_public_read`, encoding the discovery business rule
  declaratively), a member's own groups regardless of visibility
  (`groups_own_membership_read`), and a self-service insert for an
  authenticated active user creating their own group
  (`groups_self_service_insert`).
- Append-only tables (`mgr_slot_events`, `wallet_transactions`,
  `welfare_ledger`) deliberately have only `SELECT`/`INSERT` RLS policies —
  no `UPDATE`/`DELETE` policy exists at all, so under FORCE those commands
  are denied outright for any role without `BYPASSRLS`.

### Transaction wrappers (`lib/db/rls.ts`)

Every query touching an RLS-protected table goes through one of these —
each sets its GUC as the *first* statement of its own transaction:

| Wrapper | Sets | Use for |
|---|---|---|
| `withTenant(groupId, fn)` | `app.current_group_id` | Anything scoped to one tenant — almost everything |
| `withPlatformAdmin(fn)` | `app.is_platform_admin` | Super-admin cross-tenant reads/writes, and any genuinely tenant-less operation (bootstrapping a new group, a webhook that doesn't know its tenant until it looks up a payment by invoice ID) |
| `withUser(userId, fn)` | `app.current_user_id` | "My own data across every tenant I belong to" — session loading, self-service group creation |

**The one rule that matters more than any other here: never share one
transaction across concurrent queries.** `Promise.all([withTenant(id, q1),
withTenant(id, q2)])` — independent transactions run concurrently — is
correct and fast. `withTenant(id, async (tx) => { await Promise.all([q1(tx),
q2(tx)]) })` — concurrent queries *sharing* one transaction — is a bug: it
can silently drop the transaction-local `SET LOCAL` context on the unlucky
query, so RLS fails safe to zero rows instead of throwing. This exact class
of bug has been found and fixed **three separate times** in this codebase
(see [`CHANGELOG.md`](./CHANGELOG.md)'s Phase 7, subscription-billing, and
guarantors entries) — including once in `getSession()`, the single
most-executed function in the app. Sequential `await`s against one shared
`tx` are fine; concurrent ones are not.

### Database roles

Neon's project-default/owner role (`neondb_owner`) has `BYPASSRLS` — a
Postgres attribute that exempts a role from RLS entirely regardless of how
carefully the policies are written. The app never connects as that role:

- `DATABASE_URL` → the owner role, used **only** by `drizzle-kit
  generate`/`migrate` (DDL requires ownership).
- `APP_DATABASE_URL` → `chama_app`, a second, least-privilege role
  (`NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`) the running app
  actually connects as. `lib/db/client.ts` throws a clear error if this
  isn't set, rather than silently falling back to the bypass-capable owner.
  `tests/rls.test.ts`'s first assertion checks `pg_roles.rolbypassrls`
  directly so this can't silently regress.

## Auth: DB-backed session cookie

- Login creates a `sessions` row (`id`, `user_id`, `active_group_id`,
  `expires_at`); one httpOnly/Secure/SameSite=Lax cookie holds the opaque
  session id.
- **DB-backed, not stateless JWT, deliberately** — `group_memberships.status`
  can flip to `suspended` and must take effect immediately; a stateless JWT
  can't be revoked without a blocklist.
- `active_group_id` lives server-side on the session row — never
  client-tamperable.
- `getSession()` (`lib/auth/session.ts`, wrapped in React `cache()`) reads
  the cookie once per request, loads `{ user, activeGroupId,
  activeMembership, memberships }`. Every Server Component/Action/Route
  Handler uses this instead of trusting anything client-supplied.
- `switchGroup(groupId)` validates the target membership is `active`,
  updates `sessions.active_group_id`.
- **Sign-in methods**: email/phone + bcrypt password (`loginAction`), and
  optional Google (`app/api/auth/google/*`, `lib/auth/google.ts`) — a state
  cookie guards the redirect, the profile is read from Google's userinfo
  endpoint over TLS and must carry a verified email, and the user is matched
  by `users.google_id`, then by email, else created (with a random unusable
  password hash, since the column is required). Both paths finish with
  `startSessionForUser`.
- **Brute-force guard**: `users.failed_logins` / `users.locked_until` — 5
  wrong passwords lock that account's sign-in for 15 minutes; a success
  resets the counter. Per-account only (see the CHANGELOG known gaps).
- **Browser headers** (`next.config.ts`): HSTS, `X-Frame-Options: DENY`,
  `nosniff`, `Referrer-Policy`, and a `Permissions-Policy` that blocks
  camera/microphone/geolocation. There is no CSP yet.
- Real enforcement is `requirePermission("<permission>")` /
  `requirePlatformPermission(...)` (plus `requireSession()` /
  `requireActiveGroup()`) at the top of every protected surface, reading
  one matrix in `lib/auth/permissions.ts` — see [`iam.md`](./iam.md). Same
  "coarse gate + RLS as the real net" pattern RLS itself uses. They
  redirect to `/login` (unauthenticated) or `/dashboard` (not permitted).
- **Identity**: one person = one phone (canonical `2547…`) — every
  find-or-create goes through `lib/identity/people.ts`; unique indexes on
  phone/email back it up. Officials and members join by **invite**
  (`group_invites`, `/invite/[token]`).
- **Support mode**: `sessions.support_session_id` → `support_sessions`;
  `getSession()` then returns the group as the chosen member sees it, plus
  `session.support`. Writes are checked by `lib/auth/support-rules.ts` and
  audited. See [`iam.md`](./iam.md#7-support-mode-act-as).

## Data model

Grouped by concern; see `lib/db/schema.ts` for the authoritative column
list — every table there is documented inline.

**Identity & tenancy** — `users` (login identity; no per-group role lives
here), `groups` (tenant row + ~30 business-rule config columns — share
price, loan terms, MGR config, fine amounts, capital policy, minimums — see
[`user-guide.md`](./user-guide.md#settings) for what each one does),
`group_memberships` (the (user, group) join — **this is what authorization
actually checks**, not any field on `users`), `members` (financial profile
per (user, group): capital/security/personal_savings/total_fines + KYC
fields — deliberately separate from `users` so a person can exist in a
group's roster before they have a login), `sessions`.

**Core ledger** — `contributions`, `contribution_dues` (expected-payment
tracking that drives the overdue-fine cron), `fines`, `meetings` +
`attendance` (auto-generates fines), `rules`, `announcements` (schema
exists, no UI built yet).

**Loans** — `loans`, `loan_repayments`, `loan_applications` (self-service
apply/review flow), `loan_guarantors` (real consent — `applicationId`/
`loanId` are both nullable, exactly one set at a time; approval re-points
the same rows rather than creating fresh ones, so the acceptance record
survives the application→loan transition).

**MGR** — `mgr_rotations` (one full round; settings snapshot, start and
computed end date, active/archived), `mgr_cycles` and `mgr_slots` (each with
`rotation_id`), `mgr_member_turns` (multi-turn
members), `mgr_agreements` (a 4-field legal signature gating participation,
scoped per (user, cycle) since terms can differ between cycles),
`mgr_slot_events` (append-only audit log — see [RLS](#multi-tenancy--row-level-security) above).

**Welfare** — `welfare_policies` (per-group config: funding method,
reserve-allocation split, grant/advance caps, approval tiers, tenure/cooldown
rules — editable via a `WelfarePolicyWizard` at Settings → Welfare, the
first UI this schema ever had), `welfare_funds` (cached balances —
emergency/long-term/advance reserves), `welfare_requests` + `welfare_approvals`
(tiered co-sign), `welfare_grants`, `welfare_advances` + `welfare_advance_repayments`,
`welfare_ledger` (append-only source of truth the cached balances derive
from). The legacy `welfare_claims` table predates this and is unused by any
current code path. `welfare_claim_type` (the request `reason` field) covers
10 categories: medical, bereavement, emergency, education, maternity,
disability, benevolence, wedding, calamity, other.

**Projects** — `projects`, `project_contributions`.

**Payments & billing** — `platform_payments` (every STK-push-triggering
event: MGR fee, loan fee, subscription, wallet top-up), `payment_webhook_events`
(every inbound webhook attempt, verified or not — see [`api.md`](./api.md)),
`group_wallets` + `wallet_transactions` (a prepaid balance for platform
fees *only*, never member funds), `subscription_invoices`.

**Notifications** — `notifications` (generic — see
[Notifications](#notifications) below).

**Developer API & webhooks** — `api_keys` (per-group bearer tokens, SHA-256
hashed, plaintext shown once at creation), `webhook_endpoints` (a group's
subscribed URL + HMAC secret + event-type array), `webhook_deliveries`
(append-only attempt log — insert/select-only RLS policy, same pattern as
`payment_webhook_events`). See [`api.md`](./api.md)'s Public developer API
and Outbound webhooks sections.

**Governance** — `group_documents` (constitution, bank details, registration
certificate, minutes — a title/category/file-URL row, reusing the same
`/api/upload` primitive as KYC documents), `compliance_obligations` (AGM
dates, annual returns, or custom deadlines — `upcoming`/`due`/`overdue`/
`completed`, optionally recurring). Closes the "Governance/KYC follow-up"
Known Gap; see [`api.md`](./api.md) and the [Cron jobs](#cron-jobs-vercel-cron)
section below for the daily reminder job.

**Identity, access & audit** — `group_invites` (invite by phone/email +
role, secret token, one live invite per person), `group_audit_log`
(append-only: SELECT/INSERT policies only), `support_sessions`
(platform-only RLS), `users.merged_into_user_id`, `sessions.support_session_id`.

**Incoming payments** — `incoming_payments` (M-Pesa C2B, bank and payroll
check-off; unique per group + source + external id), `members.member_number`
(the paybill account number; a trigger numbers new members per group),
`groups.paybill_number` / `c2b_token` / `payment_default_type`. Matching
rules: `lib/domain/payment-matching.ts`.

**Messaging** — `sms_messages` (every SMS per group; Africa's Talking via
`lib/notify/sms.ts`, optional, with each plan's monthly allowance).

**Platform / super-admin** — `cron_runs` (audit log), `group_account_activities`
+ CRM-ish columns on `groups` (onboarding stage, account tier/owner,
follow-up date), `platform_user_audit_logs` (audit trail for platform-role
grants).

## Repo structure

```
app/
  page.tsx                      # public marketing landing page
  (public)/discover/            # anonymous group discovery + join requests
  (auth)/{login,register}/      # ?next= redirect support (open-redirect-guarded)
  (dashboard)/                  # route group — NOT a URL segment
    layout.tsx                  # requireSession(), renders DashboardShell
    actions.ts                  # switchGroupAction — shared across the group
    dashboard/                  # the literal /dashboard/* URL prefix
      page.tsx                  # dashboard home
      insights/                 # MGR pacing, recommendations, staff-only reports
      members/, loans/, mgr/, welfare/, projects/, fines/, meetings/,
      rules/, settings/, capital/, billing/, wallet/, statement/,
      profile/, notifications/, pending-members/, onboarding/, guide/,
      developer/                 # per-group API keys + webhook endpoints UI (parked from the menu)
      governance/                # group documents + compliance obligations UI
      collect/                   # meeting-day recorder (Record Money)
      payments/                  # M-Pesa/bank/payroll matching inbox + setup
      share-out/                 # year-end share-out
      activity/                  # group audit log
      access/                    # roles & access (the permission matrix)
  super-admin/                  # literal URL segment (not a route group —
    layout.tsx                  # would collide with (dashboard)'s own routes)
    groups/, groups/[id]/, users/, stats/, integrations/
  api/
    cron/{contribution-dues,loan-overdue,compliance-reminders,mgr-reminders}/
    auth/google/ + callback/    # optional Google sign-in
    payments/{callback,platform-fee,loan-fee,subscription-invoice,wallet-topup}/
    upload/
    v1/{group,members,contributions,loans,fines,meetings,mgr/cycles,
        welfare/requests,welfare/policy,capital-position}/  # public developer API — see api.md
    mpesa/c2b/[token]/[kind]/   # the group's own paybill/till notifications
    internal/agent/             # trigger the deterministic agent's playbooks
    cron/agent/                 # daily agent run
  invite/[token]/               # accept an invite
  s/[token]/                    # a member's no-password statement
  print/registration-pack/      # printable registration papers
lib/
  db/{schema.ts, client.ts, rls.ts}
  domain/{..., identity.ts, payment-matching.ts, share-out.ts, segments.ts,
          next-steps.ts, welfare-benefits.ts, registration-pack.ts, dates.ts}
                    # pure, DB-free, unit-tested business logic
  commands/         # one rule for every door: types, run, actor, registry, …
  identity/people.ts  # the only find-or-create-person path
  invites/, next-steps/  # server data loaders
  notify/{sms.ts, receipts.ts}
  statement-link.ts # signed no-password statement links
  auth/{session.ts, permissions.ts, support.ts, support-rules.ts, google.ts,
        api-keys.ts, api-session.ts, api-response.ts}
  webhooks/dispatch.ts  # outbound webhook signing + delivery + logging
  nav-config.ts    # single source of truth for the sidebar + role/product gating
  validation/      # zod schemas
  payments/intasend.ts
  cron/helpers.ts
components/ui/      # shadcn primitives
components/feature/ # everything app-specific
drizzle/             # hand-reviewed SQL migrations
scripts/             # seed + one-off data scripts
tests/
docs/
```

`app/(dashboard)/dashboard/*` looks redundant but isn't: `(dashboard)` is a
route *group* (parentheses — contributes no URL segment, just a shared
`layout.tsx`), and `dashboard/` inside it is a literal segment, so every
authenticated page ends up at `/dashboard/*` under one shared layout. `/`
itself is the public marketing page (`app/page.tsx`), not the dashboard.

**Server Actions vs. Route Handlers** — deliberate split. Server Actions for
everything triggered from the app's own UI, colocated per feature (one
`actions.ts` next to each `page.tsx`), no parallel REST contract to
maintain. Route Handlers reserved for things a *third party* calls: the
IntaSend webhook, Vercel Cron triggers, and file upload (a plain HTTP POST
from a form, not a Server Action, so it can carry `FormData` with a File).

## Commands (`lib/commands/*`) — one rule for every door

Money-moving and record-changing rules that more than one caller needs
live in **commands**: `defineCommand({ name, permission, input (zod), run,
afterCommit })`, run by `runCommand(actor, command, input, { dryRun })`.
`runCommand` checks the permission matrix (plus support/agent rules),
validates input, runs the rule inside the group's `withTenant` transaction
(any failure rolls back everything), writes an append-only
`group_audit_log` row, then fires webhooks/SMS after commit. The **actor**
says who and through which door (`ui`, `api`, `mpesa`, `cron`, `support`,
`agent`) — `actorFromSession(session)` or `systemActor(groupId, via)`.

Commands today: `contributions.record`, `contributions.recordBatch`,
`collections.recordMeeting`, `fines.issue`, `fines.settle`,
`loans.recordRepayment`, `payments.receive`, `payments.import`,
`payments.assign`, `payments.ignore`, `loans.sendReminder`, and the group
wallet ones (`wallet.enable`, `collections.prompt`, `collections.confirm`,
`wallet.setDestination`, `wallet.requestWithdrawal`,
`wallet.approveWithdrawal`, `wallet.cancelWithdrawal`; rules in
`lib/domain/group-wallet.ts`, table `group_withdrawals`, migration 0059). The deterministic agent (`lib/agent/run.ts`) plans
from fixed playbooks (`lib/domain/agent-playbooks.ts`) and runs them through
these commands. A Server Action using one is three
lines (permission → `runCommand` → `revalidatePath`); the public API, the
M-Pesa callback and the agent endpoint call the same commands. Older
actions still hold their logic inline; move one into a command when another
door needs it (and add it to `lib/commands/registry.ts` for the agent).

## Domain logic convention (`lib/domain/*`)

Pure functions, no Next/DB imports, unit-tested without a database. One
function per business rule, imported everywhere that rule applies — this is
the direct structural fix for a whole class of bug this project shipped
early on (a rule hardcoded in one route, ignored elsewhere, or reading a
value that no longer matched the schema). Examples: `computeLoanLimit`,
`calcPlatformFee`, `attendanceStatusToFineType`, `computeCapitalPosition`,
`generateMgrSchedule`, `checkGuarantorEligibility`.

**The standing rule**: a business-rule constant (a fee percentage, a
minimum amount, a cap) belongs on the `groups` row, read fresh by the
domain function, not hardcoded — even as a "sensible default," unless it's
genuinely platform-wide (see `lib/domain/billing.ts`'s pricing engine,
which *is* deliberately platform-wide — Laitor's own pricing, not a
per-tenant setting). A handful of platform constants in
`lib/domain/constants.ts` are documented as fallbacks only, for callers
with no group in scope (mainly tests) — every real call site should pass
the group's own configured value.

## Cron jobs (Vercel Cron)

`app/api/cron/contribution-dues/route.ts`, `app/api/cron/loan-overdue/route.ts`,
`app/api/cron/compliance-reminders/route.ts` and
`app/api/cron/mgr-reminders/route.ts`, declared in `vercel.json`.
Vercel Cron is UTC-only; Nairobi is UTC+3 year-round (no DST). All four:

- Require `Authorization: Bearer $CRON_SECRET` (Vercel attaches this
  automatically when `CRON_SECRET` is set).
- Are idempotent under at-least-once delivery (`lib/cron/helpers.ts`'s
  `runCronJob` takes a Postgres advisory lock; a concurrent invocation
  returns `{ skipped: "already running" }` rather than double-processing).
- Process independently per group (or per row, for the two that touch
  money — `SELECT ... FOR UPDATE` — so one bad row can't roll back
  another's already-committed fine).
- Write to `cron_runs` (job name, started/finished, rows affected, status)
  — a queryable answer to "did today's enforcement run," which ephemeral
  serverless logs don't give you. Surfaced on `/super-admin/stats`.

Full request/response shape: [`api.md`](./api.md).

### MGR rotations (how cycles are numbered and counted)

A rotation (`mgr_rotations`) is one full round in which every member gets
their turns; at most one per group is `active` (partial unique index), the
rest `archived`. It stores the settings it was planned with (frequency,
recipients per cycle, contribution), its start date and its **computed end
date** — the last cycle's date (`rotationEndDate`; cycles =
`cyclesNeeded(turns, recipientsPerCycle)`), refreshed whenever the schedule
changes (`refreshRotationTotals`). Until the first payout a rebuild takes the
group's current settings; after it the settings are fixed and only remaining
turns are re-planned, with completed cycles keeping their dates
(`generateScheduleAction`). `rescheduleRotation` moves the start (nothing
paid yet) or the next payout and everything after it. Cycle numbers stay
group-wide (a rotation numbers its cycles after `cycle_offset`); every query
that counts a member's turns (claim limit, auto-assign, the Turns tab) is
scoped by `rotation_id`. `mgr_cycles.status` is `planned → active →
completed` (`closed` is legacy, pre-0062). When the last cycle completes,
`finishRotation` archives the rotation and notifies officials with the
suggested next start (`nextRotationStart`). Closing is guarded
(`cycleCloseBlocker`): only the active cycle, only when every slot is paid or
skipped — and it happens automatically when the last slot is settled. A paid
slot can't be reassigned or un-paid. Fair-fill logic
(`assignByPreferences`, `buildAutoAssignQueue`, `shuffled`) lives in
`lib/domain/mgr.ts` as pure, unit-tested functions; dates are anchored to
the start date (`cycleDate`) so they never drift.

## Notifications

A generic `notifications` table (`groupId`, `userId`, `category`, `title`,
`body`, `link`, `sourceType`/`sourceId`), read per-user via app-level
filtering — RLS on this table only ever enforces the *tenant* boundary, not
per-user visibility within a tenant (same convention as `contributions`/
`loans`), so every insert/read also filters by `userId` explicitly.

Each feature keeps its own event union and template builder in
`lib/domain/notifications.ts` (`WelfareNotificationEvent`,
`MembershipNotificationEvent`, `LoanNotificationEvent`, ...) rather than one
union overloaded across domains. All of them funnel through
`lib/db/notifications.ts`'s `insertNotification`/`listActiveStaffUserIds` —
the shared insert path (always inside the caller's own `withTenant`, since
the table is FORCE RLS'd) and a staff fan-out helper for "notify whoever can
act on this."

## Design system

Tailwind + shadcn/ui on Base UI. `lib/nav-config.ts` is the single source of
truth for the sidebar: one `NavItem[]` array (`href`, `label`, `icon`,
`roles?`, `product?`, `guide`, `primary?`) plus a pure `getVisibleNavItems()`
filter, consumed by the desktop sidebar, the mobile bottom tab bar (capped
at the first 4 `primary: true` items + a "More" tab, so it stays small
regardless of role or group type), and `/dashboard/guide`.

`app/globals.css` carries two independent token sets:
- The brand palette (`--background`/`--primary`/`--accent`/`--chart-1..5`/
  `--sidebar-*`) — cream/forest/terracotta/lime, both light and dark,
  consumed everywhere through Tailwind semantic classes (`bg-primary`,
  `text-muted-foreground`), never hardcoded per-component.
- A separate `--viz-*` data-viz token set (8 categorical hues, a 6-step
  sequential ramp, a fixed good/warning/serious/critical status scale) —
  validated against this app's own light/dark surfaces with a six-check
  colorblind/contrast validator, independent of the brand palette so the
  two can evolve separately. `components/feature/charts.tsx` is the
  resulting shared chart primitive set (`SequentialColumnChart`,
  `RankedBarList`, `StatusBarList`, `CompositionBar`, `Meter`) — plain
  HTML/CSS, no charting library, each with hover *and* keyboard-focus
  tooltips.

## Testing & verification

- **Domain logic**: Vitest, one test file per `lib/domain/*` module, no DB
  required — the bulk of the suite.
- **DB-backed**: `tests/seed-membership.test.ts` (the seed script actually
  produces a loggable-in account) and `tests/rls.test.ts` (authenticate as
  tenant A, attempt to read/write tenant B's rows directly, assert every
  attempt returns zero rows/fails) hit the real dev database — slower,
  run as one sequential file group.
- **Manual/smoke**: no automated end-to-end suite exists. Verification has
  been Playwright-driven manual walkthroughs per feature (see
  [`developer-guide.md`](./developer-guide.md#running--smoke-testing)) —
  in both a staff and a member role, across at least two group types, to
  confirm feature gating works.
- **Pre-launch**: deploy to a Vercel preview environment, smoke-test each
  role × group-type combination end-to-end (register, join a group, record
  a contribution, apply for a loan, claim an MGR slot, submit a welfare
  claim) before promoting to production.

Run everything: `npm run lint && npx tsc --noEmit && npm test && npx next
build`.
