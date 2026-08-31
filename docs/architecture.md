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
- Real enforcement is `requireSession()` / `requireRole(...roles)` /
  `requireActiveGroup()` / `requireProduct(product, ...roles)` /
  `requirePlatformAdmin()` at the top of every protected surface — same
  "coarse gate + RLS as the real net" pattern RLS itself uses. All of these
  redirect to `/login` (unauthenticated) or `/dashboard` (authenticated but
  not permitted) on failure.

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

**MGR** — `mgr_cycles`, `mgr_slots`, `mgr_member_turns` (multi-turn
members), `mgr_agreements` (a 4-field legal signature gating participation,
scoped per (user, cycle) since terms can differ between cycles),
`mgr_slot_events` (append-only audit log — see [RLS](#multi-tenancy--row-level-security) above).

**Welfare** — `welfare_policies` (per-group config: funding method,
reserve-allocation split, grant/advance caps, approval tiers, tenure/cooldown
rules), `welfare_funds` (cached balances — emergency/long-term/advance
reserves), `welfare_requests` + `welfare_approvals` (tiered co-sign),
`welfare_grants`, `welfare_advances` + `welfare_advance_repayments`,
`welfare_ledger` (append-only source of truth the cached balances derive
from). The legacy `welfare_claims` table predates this and is unused by any
current code path.

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
      developer/                 # per-group API keys + webhook endpoints UI
  super-admin/                  # literal URL segment (not a route group —
    layout.tsx                  # would collide with (dashboard)'s own routes)
    groups/, groups/[id]/, users/, stats/, integrations/
  api/
    cron/{contribution-dues,loan-overdue}/
    payments/{callback,platform-fee,loan-fee,subscription-invoice,wallet-topup}/
    upload/
    v1/{group,members,contributions,loans,fines,meetings,mgr/cycles,
        welfare/requests,capital-position}/   # public developer API — see api.md
lib/
  db/{schema.ts, client.ts, rls.ts}
  domain/          # pure, DB-free, unit-tested business logic
  auth/{session.ts, api-keys.ts, api-session.ts, api-response.ts}
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

`app/api/cron/contribution-dues/route.ts` and `app/api/cron/loan-overdue/route.ts`,
declared in `vercel.json`. Vercel Cron is UTC-only; Nairobi is UTC+3
year-round (no DST). Both:

- Require `Authorization: Bearer $CRON_SECRET` (Vercel attaches this
  automatically when `CRON_SECRET` is set).
- Are idempotent under at-least-once delivery (`lib/cron/helpers.ts`'s
  `runCronJob` takes a Postgres advisory lock; a concurrent invocation
  returns `{ skipped: "already running" }` rather than double-processing).
- Process each candidate row in its own transaction with `SELECT ... FOR
  UPDATE`, so one bad row can't roll back another's already-committed fine.
- Write to `cron_runs` (job name, started/finished, rows affected, status)
  — a queryable answer to "did today's enforcement run," which ephemeral
  serverless logs don't give you. Surfaced on `/super-admin/stats`.

Full request/response shape: [`api.md`](./api.md).

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
