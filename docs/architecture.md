> This is the context and architecture document for the Next.js/Vercel rewrite
> of the Chama Platform, carried over from the planning phase so it survives
> as part of the repo rather than only in an external plan file. Read this
> before making architectural changes.
>
> **Provenance note:** the legacy `backend/`/`frontend/` split this rewrite
> replaced was removed from the working tree once this document was written,
> but it remains fully retrievable from git history (e.g.
> `git log --all -- backend/src/routes/mgr.js`, `git show <commit>:path`) —
> nothing described below as "ported from the old X" was destroyed, just
> cleaned out of the working tree.

# Chama Platform — Ground-Up Rewrite (Next.js / Vercel)

## Context

### Why this rewrite
The original app (Node/Express + raw-SQL Postgres backend, Vite/React SPA frontend) worked but had accumulated real, live schema-drift bugs from writing SQL by hand against a schema that evolved across four migrations without a compiler/ORM to catch mismatches. A deep-dive review (two rounds of codebase exploration, ~9 backend route files + all 18 frontend pages + all 4 migrations read in full) surfaced **9 confirmed live bugs**, several architectural inconsistencies, and confirmed the team already had Vercel deploy experience (the original frontend's `vercel.json` was a working static-SPA deploy). The decision was a full rewrite rather than patching bugs incrementally, on the condition that:
- Same feature scope, "done right" — not a rescope, not a trim.
- Hosted on Vercel (Next.js, so backend + frontend live in one deploy).
- Clean slate — no production data to migrate, fresh seed data is fine.

### What this app is
A multi-tenant SaaS for managing African group-savings associations ("chama" = Kenyan savings circle). One deployment serves many independent **groups** (tenants), each of one of four **types** — `chama`, `welfare`, `hybrid`, `selfhelp` — where the type determines which features are active:

| Feature | chama | welfare | hybrid | selfhelp |
|---|---|---|---|---|
| Members, contributions, rules, meetings, fines | ✅ | ✅ | ✅ | ✅ |
| Loans (20% interest) | ✅ | ❌ | ✅ | ✅ |
| MGR / merry-go-round rotation | ✅ | ❌ | ✅ | ❌ |
| Welfare claims | ❌ | ✅ | ✅ | ❌ |
| Projects (table-banking style) | ❌ | ❌ | ✅ | ✅ |

A user can belong to multiple groups with a **different role per group** (`admin`, `treasurer`, `secretary`, `member`) via a `group_memberships` join table — this is the multi-tenancy backbone. There's also a platform-level **super-admin** surface (originally a shared-secret header, not integrated with normal auth) for cross-tenant ops (creating new tenant groups).

### Full domain model (from the original 4 migrations — reimplemented via Drizzle schema, not hand-written SQL)
- **groups** — tenant row + ~20 business-rule config columns (share_price, loan_interest_rate default 20%, loan_max_multiplier default 3.0, loan_repayment_months, loan_late_penalty, mgr_frequency/cycle_day/recipients_per_cycle/start_date/contribution_amount, mgr_fee_pct default 5.0, fine_lateness/fine_absence/fine_rule_violation, is_public/require_approval/max_members, platform_terms).
- **users** — login identity (email/phone/password_hash), no longer the source of role (see group_memberships).
- **members** — financial profile per (user, group): capital, security, personal_savings, welfare_balance, total_fines, limit_reduced (flag set after a loan extension halves future limit), active. Deliberately separate from `users` so financial data is isolated.
- **group_memberships** — (user_id, group_id) unique, role, status (pending/active/rejected/suspended), join_message, reviewed_by/at. **This is what authorization actually checks** — not any field on `users`.
- **contributions** — amount, type (capital/security/mgr/welfare/personal_savings/project/other), month/year, status (paid/pending/waived), reference.
- **loans** — principal, interest_rate, total_repayable, amount_remaining, status (pending/active/extended/overdue/cleared/rejected), extended/limit_reduced_by_extension flags, overdue_flagged_at, penalty_total.
- **loan_repayments** — amount, reference, notes per loan.
- **loan_applications** — member self-service: amount_requested, purpose, repayment_months, status (pending/approved/rejected/cancelled), links to resulting loan_id on approval.
- **contribution_dues** — expected-payment tracking per member per period, drives the overdue-fine cron.
- **fines** — type (lateness/absence/rule_violation/loan_default/other), amount, status (pending/paid/waived), reason.
- **meetings** + **attendance** — meeting_date/type/venue/agenda/minutes; attendance status (present/absent/late/excused) unique per (meeting, member), auto-generates fines.
- **welfare_claims** — claim_type (medical/bereavement/emergency/education/maternity/disability/other), amount_requested/approved, status (pending/under_review/approved/rejected/disbursed), beneficiary info.
- **projects** + **project_contributions** — target/collected amounts, status (planning/active/on_hold/completed/cancelled).
- **rules** — group bylaws, categorized, penalty_amount, soft-delete via `active`.
- **announcements** — title/content/pinned.
- **mgr_cycles** — rotation cycle: cycle_number, status (active/planned/completed/closed), scheduled_date, slot_count, payout_per_slot, total_contributions.
- **mgr_slots** — one row per recipient slot per cycle: slot_number, member_id, status (open/claimed/auto_assigned/paid/skipped), payout_amount.
- **mgr_member_turns** — how many rotation turns a member gets (turns_total) and their contribution_multiplier (multi-turn members pay/receive N× per cycle).
- **mgr_agreements** — 4-field legal signature (platform_terms, group_terms, financial_acknowledged, digital_signature) gating MGR participation — carries real legal/compliance text, must be preserved verbatim.
- **platform_payments** — the 5% platform fee charged on MGR payouts via M-Pesa STK push; tracks checkout_request_id/mpesa_ref/status (pending/paid/failed/cancelled).

### Full API surface to preserve (~70 endpoints across 17 route files in the original)
auth (register/login/me/change-password), groups (public discovery + join-request flow), group+settings (tenant profile + business-rule config — originally two overlapping routers, merged in the rewrite), users (admin manages group's user accounts), members (CRUD), contributions (record + summary), loans (approve/update/repay/statement + member self-service apply/list/review/cancel), mgr (config/schedule/generate/turns/slot-claim/auto-assign/cycles/agreement — the most complex feature), fines, meetings (+ attendance with auto-fine), welfare (+ fund summary), projects (+ contributions), rules, dashboard (single aggregate), payments (M-Pesa Daraja STK push + webhook callback), super-admin (cross-tenant ops).

The full original frontend page inventory (18 pages) and the exact `api.js` → endpoint map were captured during research and should be treated as the acceptance checklist for feature parity — retrievable from git history if needed (`frontend/src/api.js`, `frontend/src/pages/*.jsx` as of commit `ffe7580`).

### The 9 known bugs — fixed by design, not ported
1. `mgr.js` queried `m.status`/`m.member_id` on `members` — neither column existed. Broke turns/generate/schedule entirely.
2. `loans.js` `/statement` queried `c.payment_date`/`c.month_label` on `contributions` — neither existed. Broke member statement.
3. `meetings.js` attendance auto-fine inserted `fines.type = 'absent'/'late'`, but the CHECK constraint only allowed `lateness/absence/rule_violation/loan_default/other` — every attendance submission with an absent/late member threw.
4. `welfare.js` `GET /fund` used a `CROSS JOIN` that silently returned zero rows (zeroing totals) when there were no disbursed claims yet.
5. `payments.js` hardcoded the 5% platform fee instead of reading `groups.mgr_fee_pct`.
6. `users.js` updated `users.role` directly, but authorization actually checked `group_memberships.role` — two sources of truth that could diverge.
7. `migrate.js` only ran migration 001, silently omitting 002-004 — masked because `server.js` re-ran all four on every boot (a pattern with no equivalent in serverless).
8. `seed.js` never created `group_memberships` rows for the members/admin it seeded — those accounts couldn't pass the membership check.
9. Loan limit formula was inconsistent: `groups.loan_max_multiplier` (default 3.0) was exposed in Settings UI but ignored — actual logic hardcoded limit = 2× total savings (1× if `limit_reduced`).

See "How each of the 9 bugs is prevented by design" below for the structural fix applied to each.

### Business-rule constants to preserve (originally hardcoded in scattered places — centralized in the rewrite)
Loan interest 20%, default repayment 3 months, fines Ksh 50 lateness / 100 absence, min personal-savings increment Ksh 500, min loan Ksh 1,000, MGR platform fee 5% (via M-Pesa STK push), loan limit = 2× total savings (1× after an extension flags `limit_reduced`).

### Original auth/multi-tenancy mechanism (redesigned for SSR in the rewrite)
JWT bearer token in `localStorage`; an `X-Group-Id` header (also from `localStorage`, set on group-switch) told the backend which tenant to scope to; middleware verified an active `group_memberships` row and attached that row's `role`. This pattern didn't suit Next.js Server Components (no client-side header injection available server-side) — replaced with an httpOnly-cookie-based session that carries both identity and active-group server-side (see Architecture below).

---

## Architecture

Grounded against the actual original code (all 4 migrations, `middleware/auth.js`, `mgr.js`, `loans.js`, `payments.js`, `superAdmin.js`, `jobs/enforcement.js`, `server.js`, `App.jsx`/`Layout.jsx` read directly) — every decision below is built to make each bug's *class* structurally impossible, not just patch the instance.

### Stack (opinionated, one choice each)

| Decision | Choice | Why |
|---|---|---|
| Hosting | Vercel, Node.js serverless runtime (not Edge) | Needed for full Postgres driver + Drizzle |
| Database | **Neon**, connected directly (not the Vercel Postgres marketplace wrapper) | Plain Postgres (RLS, `FOR UPDATE`, advisory locks all work unmodified); instant branching gives a per-PR DB branch to catch constraint-affecting changes (i.e. bugs 1–3) before merge |
| ORM | **Drizzle**, not Prisma | Prisma's schema DSL has no first-class CHECK-constraint modeling — this schema is full of them. Drizzle's SQL-first migrations let CHECK/RLS/advisory-lock SQL live directly in the migration. No query-engine binary → better serverless cold starts. Schema-as-TypeScript is the actual mechanism that kills bugs 1–3: referencing a nonexistent column becomes a compile error, not a 500. |
| Auth | Hand-rolled DB-backed session cookie, not NextAuth/Auth.js | Per-group role + required custom "switch group" flow doesn't map cleanly onto Auth.js's session-callback model; simple enough here to not need the abstraction |
| Design system | Tailwind + shadcn/ui, full rebuild | The original hand-rolled modals/dropdowns didn't compose with RSC/streaming; shadcn is server-rendered by default, only goes client where interactivity requires it. |
| Repo shape | **Single Next.js app at repo root** — the `frontend/`/`backend/` split has been retired | No separate backend process anymore; a Turborepo/monorepo would be pure overhead for one deployable |

### Repo structure

```
app/
  (public)/                    # no auth — group discovery + join requests
    page.tsx
    groups/[slug]/page.tsx
  (auth)/
    login/page.tsx
    register/page.tsx
  (dashboard)/                 # authenticated, tenant-scoped
    layout.tsx                 # requireSession(), renders sidebar from nav-config
    page.tsx                   # branches staff-aggregate vs member-home view
    members/page.tsx
    loans/{page.tsx, apply/page.tsx, actions.ts}
    mgr/{page.tsx, actions.ts}          # tabs: schedule/turns/admin
    fines/page.tsx
    meetings/page.tsx
    welfare/page.tsx
    projects/page.tsx
    rules/page.tsx
    settings/page.tsx          # 5 tabs → 5 narrow Server Actions, ONE table write path
    users/page.tsx
    pending-members/page.tsx
    statement/page.tsx
  super-admin/                 # literal URL segment, not a route group — a
    layout.tsx                 # (super-admin) route group would produce
    groups/page.tsx            # /groups, /stats etc. at the root, colliding
    stats/page.tsx              # with (dashboard)'s own routes. requirePlatformAdmin() in layout.tsx.
  api/
    cron/contribution-dues/route.ts
    cron/loan-overdue/route.ts
    payments/platform-fee/route.ts
    payments/callback/route.ts     # Daraja webhook
lib/
  db/{schema.ts, client.ts, rls.ts}     # schema.ts = single source of truth
  domain/{loans.ts, fines.ts, mgr.ts, payments.ts, constants.ts}  # pure, DB-free, unit-testable
  auth/{session.ts, cookies.ts}
  nav-config.ts
  validation/                          # zod, drizzle-zod derived
components/ui/                         # shadcn primitives
components/<feature>/
drizzle/                               # generated SQL migrations
scripts/seed.ts
tests/
```

**Server Actions vs Route Handlers** — deliberate split. Server Actions for everything triggered from the app's own UI (record contribution, approve loan, claim MGR slot, switch group, submit welfare claim, update settings) — colocated per feature, no parallel REST contract to maintain. Route Handlers reserved for things a *third party* calls: the Daraja webhook, Vercel Cron triggers. This directly fixes the original `group.js`/`settings.js` "two overlapping routers" problem — one settings write-path per section, nothing left to drift.

**Shared domain logic** lives in `lib/domain/*` as pure functions with no Next/DB imports (`computeLoanLimit`, `calcPlatformFee`, `attendanceStatusToFineType`, the MGR schedule-generation algorithm). Unit-tested without a DB, imported everywhere the rule applies — one function per business rule, one place it can be wrong.

### Database & multi-tenancy: RLS as defense-in-depth, not the sole mechanism

App-level scoping alone (the original `group_memberships` check in middleware) is what let 8 of the 9 bugs ship — a route can always forget to filter by `group_id`. With a fresh DB:

- Every tenant-scoped table: `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` (force is required since the app connects as one Postgres role, not per-tenant credentials).
- Policy: `USING (group_id = NULLIF(current_setting('app.current_group_id', true), '')::int OR ...)`.
- A `withTenant(groupId, fn)` Drizzle transaction wrapper runs `SET LOCAL app.current_group_id = $1` as the first statement of every transaction; every Server Action/Route Handler touching tenant data goes through it. `withUser(userId, fn)` is the equivalent for "my own data across every tenant I belong to" reads (session loading, seeding) that aren't scoped to one group.
- The query layer **still** writes explicit `WHERE group_id = ...` — RLS is the fail-safe net. Forgetting `withTenant` means RLS returns zero rows (safe failure), not another tenant's data.
- `groups` table gets its own policies: anonymous `SELECT` where `is_public = true` (encodes the public-discovery business rule declaratively instead of "no auth on this route"), plus a member's own groups regardless of visibility.
- Super-admin queries run through a separate elevated path (`withPlatformAdmin`) that sets `app.is_platform_admin` instead of granting `BYPASSRLS` to the app's role.

**This last point was true in design from Phase 0 but not in practice until Phase 7.** Neon's project-default/owner role (`neondb_owner`, what `DATABASE_URL` points at) has `BYPASSRLS` — a Postgres attribute, not something this schema's migrations control — which silently exempted the app from every policy above regardless of `FORCE`, for every table, for the entire project up to that point. The fix (see the Phase 7 build-order entry below for the full writeup) was a second, least-privilege role — `chama_app`, no bypass — that the running app actually connects as via `APP_DATABASE_URL`; `DATABASE_URL`/the owner role is now used only for migrations. `tests/rls.test.ts` asserts the connected role isn't bypass-capable as its first check, specifically so this can't silently regress.

### Auth: DB-backed session cookie

- Login creates a `sessions` row (`id`, `user_id`, `active_group_id`, `expires_at`); one httpOnly/Secure/SameSite=Lax cookie holds the opaque session id.
- **DB-backed, not stateless JWT, deliberately**: `group_memberships.status` can flip to `suspended` and must take effect immediately — a stateless JWT can't be revoked without a blocklist.
- `active_group_id` lives server-side on the session row — the direct replacement for the `X-Group-Id` header, not tamperable client-side.
- `getSession()` (wrapped in React `cache()`) reads the cookie once per request, loads `{ user, activeGroupId, activeMembership, memberships }` — every Server Component/Action/Route Handler uses this instead of trusting a client header. See `lib/auth/session.ts`.
- `switchGroup(groupId)` Server Action validates the target membership is `active`, updates `sessions.active_group_id` — no client-side header juggling.
- Real enforcement happens in `requireSession()`/`requireRole()`/`requirePlatformAdmin()` at the top of each protected surface — same "coarse gate + real enforcement" pattern as RLS.

### How each of the 9 bugs is prevented by design

| # | Bug | Design fix |
|---|---|---|
| 1 | `mgr.js` queried nonexistent `members.status`/`members.member_id` | Drizzle `schema.ts` is the only place columns are defined — a phantom-column reference is a compile error |
| 2 | `loans.js /statement` queried nonexistent `contributions.payment_date`/`month_label` | Same mechanism — statement query generated against the real schema |
| 3 | Attendance fines inserted `type='absent'/'late'` but CHECK only allowed `absence`/`lateness` | One `attendanceStatusToFineType` map in `lib/domain/fines.ts`; the Postgres enum is generated from the same TS enum via Drizzle `pgEnum` — TS and DB constraint can't diverge |
| 4 | `welfare.js GET /fund` CROSS JOIN returned 0 rows when no disbursed claims existed | Rewritten as one aggregate query with `FILTER (WHERE status = 'disbursed')`, no join against an empty subquery; test asserts an empty group returns zeros, not zero rows |
| 5 | `payments.js` hardcoded 5% instead of reading `mgr_fee_pct` | One `calcPlatformFee(amount, group.mgrFeePct)` in `lib/domain/payments.ts` |
| 6 | `users.js` mutated `users.role` while authz checked `group_memberships.role` | **Structural fix**: the rewritten `users` table has no `role` column at all — role exists only on `group_memberships`. Nothing left to drift from. |
| 7 | `migrate.js` only ran migration 001; masked by `server.js` re-running all 4 on every boot | No boot-time migration runner exists on serverless. `drizzle-kit migrate` runs once as a required CI/build step — a partial migration fails the deploy loudly |
| 8 | `seed.js` never created `group_memberships`, so seeded accounts couldn't log in | `scripts/seed.ts` does group → user → membership as one transaction; regression-tested by `tests/seed-membership.test.ts` |
| 9 | `loan_max_multiplier` (3x, configurable) vs hardcoded `2x`/`1x` in route logic | One `computeLoanLimit(member, group)` in `lib/domain/loans.ts`, reading `group.loanMaxMultiplier`, used by both staff-approval and self-service paths |

The standing rule behind 5/6/9: one domain function per business rule, imported everywhere it's needed, always reading the group's actual config row.

### Cron replacement (Vercel Cron)

`app/api/cron/contribution-dues/route.ts` and `app/api/cron/loan-overdue/route.ts`, declared in `vercel.json`'s `crons` array. Vercel Cron is UTC-only, Nairobi is UTC+3 year-round (no DST) — 08:00/08:15 EAT become `0 5 * * *` / `15 5 * * *` UTC.

- **Auth**: verify `Authorization: Bearer $CRON_SECRET` (Vercel attaches this automatically when `CRON_SECRET` is set).
- **Idempotency**: `pg_try_advisory_lock(hashtext('cron:contribution-dues'))` at the top — if not acquired, return 200 immediately (another invocation in flight; serverless cron is at-least-once and can double-fire).
- **Fine-grained lock**: wrap each row's select→insert-fine→update-due→update-balance sequence in one transaction with `SELECT ... FOR UPDATE` on the row — fixes a TOCTOU gap present in the original implementation.
- A `cron_runs` audit table (`job_name`, `started_at`, `finished_at`, `rows_affected`, `status`) — gives a queryable answer to "did today's enforcement run," which ephemeral serverless logs don't.

### Payments & super-admin

**Payments go through IntaSend, not raw Safaricom Daraja** (changed from the original Daraja-based plan at the user's request, after pulling IntaSend's actual API details rather than assuming). It's a gateway layer over M-Pesa that removes the need to manage a Daraja app, OAuth token, and certificate directly.

(A UMSPay integration existed briefly as a second, selectable provider — added, fully built, and verified end-to-end — but was removed at the user's request in favor of IntaSend only. `lib/payments/intasend.ts` is called directly again; there's no provider dispatcher.)

- Base URLs: sandbox `https://sandbox.intasend.com/api/`, live `https://payment.intasend.com/api/` — selected by `INTASEND_ENV`.
- Auth: `Authorization: Bearer <secret key>` (`ISSecretKey_test_...` / `ISSecretKey_live_...`, backend-only — **not** the publishable key, `ISPubKey_...`, which IntaSend issues for client-side use and which this Bearer-auth server call rejects). `POST {base}/v1/payment/mpesa-stk-push/` with `{ amount, phone_number, api_ref }`.
- Webhook (`POST /api/payments/callback`, public): a flat JSON body (`invoice_id`, `state`: PENDING/COMPLETE/FAILED, `api_ref`, `net_amount`, `mpesa_reference` when available, and a `challenge` field) rather than a computed HMAC signature — verification is `isValidIntasendChallenge()` (`lib/domain/payments.ts`): a plain equality check against `INTASEND_WEBHOOK_CHALLENGE`, a static shared secret configured once in the IntaSend dashboard's webhook settings.

The webhook route logs every attempt — verified or not — to `payment_webhook_events` (an unverified attempt is itself worth a permanent record) before touching `platform_payments`, and updates it idempotently keyed on IntaSend's `invoice_id`.

No OAuth token to fetch/cache (that complexity was specific to calling Daraja directly) — one credential-bearing request per STK push.

**Super-admin**: no shared-secret header. A genuinely-global `platformRole: 'owner' | 'support' | null` column on `users` — the one place a global role flag is correct, since platform admin isn't scoped to any group (distinct from the per-group role that fixes bug 6). Super-admin routes live under `app/super-admin/...` (a literal URL segment, not a `(super-admin)` route group — see the repo-structure sketch above), gated by `requirePlatformAdmin()` reading the same session cookie as everyone else — one auth mechanism, real audit trail. Built in Phase 6: `/super-admin/groups` (list every tenant + create new groups with an initial admin) and `/super-admin/stats` (cross-tenant metrics via `withPlatformAdmin`).

### Design system

Tailwind + shadcn/ui, built on Base UI primitives (not Radix) — this specific shadcn install uses a `render` prop for composition (`<Trigger render={<Button />} />`), not Radix's `asChild` + `Slot` pattern. MGR's 3 tabs and Settings' 5 tabs use shadcn `Tabs`; the MGR agreement modal uses a shadcn `Dialog`. The `App.jsx`/`Layout.jsx` nav-guard duplication from the original app is fixed by construction: one `lib/nav-config.ts` array (`{ href, label, icon, roles, groupTypes }`) plus a pure `getVisibleNavItems()` filter, consumed by both the sidebar and each page's own role/group-type check.

### Phased build order

- **Phase 0 — Foundations.** ✅ Done. Scaffold, Tailwind+shadcn, Neon + branching, Drizzle schema for `groups`/`users`/`members`/`group_memberships`/`sessions` + RLS on `members`/`groups`, session auth, seed script (bug 8 fixed from day one, regression-tested).
- **Phase 1 — Core tenant CRUD.** ✅ Done. Rules, members (+ contribution recording, + create-login-for-member so member self-service has an account to sign in with), manual fines, meetings+attendance (fixed fine-type mapping — bug 3 verified fixed end-to-end), dashboard aggregate, unified settings (merged the two overlapping routers into one write path). `announcements` has a schema/RLS policy but no UI yet — deferred, not part of any phase's critical path so far. *Demoable: day-to-day recordkeeping.*
- **Phase 2 — Loans.** ✅ Done. `computeLoanLimit` (bug 9 fixed — reads `group.loanMaxMultiplier` instead of a hardcoded 2x/1x, verified via both the staff-direct and self-service+review paths), loan CRUD, repayments, self-service apply/cancel, staff review, member statement (bug 2 fixed — verified end-to-end with real contribution/loan/repayment/fine data rendering in one merged timeline). *Demoable: full loan lifecycle.*
- **Phase 3 — Welfare + Projects.** ✅ Done. Claims + fund-summary query (bug 4 fixed — two independent `COALESCE(SUM(...),0)` aggregates instead of a CROSS JOIN, verified against the exact zero-disbursed-claims edge case that broke the original), projects + contributions. Also found and fixed a real, pervasive UI bug while verifying this phase: Base UI's `Select.Value` shows the raw `value` string unless the `Select.Root` gets an `items={{value: label}}` map — every `<Select>` in the app up to this point was silently displaying raw values/IDs (e.g. a member picker showing "2" instead of "Bob Otieno") instead of labels; fixed across all 8 affected components. The seeded demo group's type was changed from `chama` to `hybrid` for testing (unlocks loans/welfare/projects/MGR at once) and left that way as a fuller demo. *Demoable: welfare/selfhelp/hybrid types fully functional.*
- **Phase 4 — MGR.** ✅ Done. Config, turns, schedule generation (`lib/domain/mgr.ts`, 11 Vitest unit tests, no DB) with slot claim/auto-assign/cycles/4-field agreement gate. Bug 1 fixed and verified end-to-end: generated a real 3-member schedule (3 cycles, correct payout math), signed the agreement, auto-assigned all slots — the exact `POST /generate` flow that 500'd on every call in the original. Found and fixed one gap in the original design while building this: nothing in the original ever transitioned a cycle from `planned` to `active` after the first (seed-bootstrapped) one, which would have permanently stuck the agreement gate on cycle 1 — `closeCycleAction` now activates the next planned cycle automatically. Also tightened `mgr_agreements` to be scoped per (user, cycle) instead of the original's per (user, group), since financial terms can differ between cycles.
- **Phase 5 — Payments + Cron.** ✅ Done (mostly — a real IntaSend secret key is still needed from the user to prove out a live STK push; everything up to that boundary is built and verified). IntaSend payments (see "Payments & super-admin" above) + webhook callback, `calcPlatformFee` fix (bug 5, verified against real data: Ksh 150 = Ksh 3,000 payout × 5% `mgrFeePct`, not a hardcoded literal), Vercel Cron with advisory-lock + audit table. Also added `contribution_dues` (never built in any earlier phase, and never actually populated by any code path in the original app either — the cron generates each period's due rows itself now, so the enforcement half has real data to act on instead of being permanently dead code). Real bugs caught while verifying, all fixed:
  1. `date + $1` with a plain numeric parameter is type-ambiguous to Postgres — needed an explicit `::integer` cast in the overdue-dues query.
  2. `new Date(y, m, d)` (separate numeric args) builds a local-time `Date`, but `.toISOString().split("T")[0]` always converts to UTC — in Africa/Nairobi (UTC+3) this silently shifted every generated due date back by one day. Fixed with manual local-component formatting instead.
  3. `isValidIntasendChallenge` was originally written inside `lib/payments/intasend.ts`, which imports `"server-only"` — a guard that throws when imported outside Next.js's bundler, so this pure, easily-unit-testable check was silently never actually tested. Moved to `lib/domain/payments.ts` (no server-only guard, matches where every other pure business-rule function already lives).
  4. `drizzle-kit generate`'s rename-vs-drop+add disambiguation needs an interactive TTY prompt this environment doesn't have — hit while trying to rename `payment_webhook_events.challenge_valid` to something provider-neutral (back when a second provider existed). Rather than fight the tooling (a botched manual attempt at forcing it through left the migration journal and snapshot files briefly inconsistent, causing `drizzle-kit migrate` to hang with no error), the rename was abandoned — the column keeps its original name with a comment explaining its meaning.

  A second payment provider (UMSPay) was added shortly after this phase, fully built and verified end-to-end (dual-provider dispatch, its own webhook route, its own tests), then removed again at the user's request in favor of IntaSend only — see the Phase 6 entry below for that revert and the schema bug it caught on the way out.

  Verified end-to-end: cron auth (401 without the header), advisory-lock idempotency (re-running produces 0 rows, no double-fining), the full audit trail (cron_runs correctly captured both a real failure and the fix), webhook challenge verification (both valid and invalid cases, both logged), and both providers' platform-fee trigger failure paths (IntaSend: clean "INTASEND_SECRET_KEY is not set"; UMSPay: clean "UMSPAY_API_KEY / UMSPAY_EMAIL is not set" — each surfaced to the admin, payment record correctly marked `failed` with the right `provider`, no crash) — the only thing not yet proven is a real STK push actually reaching a phone, which needs live sandbox credentials for either provider. *Demoable: fee collection and automated enforcement, once IntaSend or UMSPay credentials are supplied.*
- **Phase 6 — Multi-tenancy polish + Super-admin.** ✅ Done. Public discovery (`/discover`, `/discover/[id]`) reading `groups` anonymously via the `groups_public_read` RLS policy (safe-columns-only select, no staff-only fields exposed), join-request flow (`group_memberships` insert with `status: 'pending'`, re-request supported after a rejection, `maxMembers` cap enforced), pending-members approval (`/pending-members`, admin/treasurer-gated — approving creates the member's `members` financial-profile row in the same transaction if one doesn't already exist), and a `platformRole`-gated super-admin console at `/super-admin` (`groups` list + create-group-with-initial-admin form using `withPlatformAdmin`, `stats` cross-tenant metrics). Login/register gained a `?next=` redirect (open-redirect-guarded — only same-origin relative paths accepted) so a visitor can discover a group, register, and land back on the join-request form in one flow. Group-switcher UI was already built in Phase 0 (`GroupSwitcher` in `dashboard-shell.tsx`) — this phase just added a link into it for platform admins.

  Real bugs caught while verifying, all fixed:
  1. **`members.userId` had a bare column-level `.unique()` constraint** — meaning a user could only ever have a financial-profile row in *one group on the entire platform*, silently contradicting the "a user belongs to multiple groups" multi-tenancy premise every other table in this schema was built around. Latent since Phase 0; nothing before Phase 6 exercised a single user joining two groups. Caught live: super-admin tried to make Carol (already a member of "My Chama") the admin of a second group, and the `members` insert threw `duplicate key value violates unique constraint "members_user_id_unique"`. Fixed by dropping the global unique constraint and replacing it with a composite `unique(user_id, group_id)` (migration `0015_phase6_members_composite_unique.sql`) — a user now gets one `members` row per group, which is what the table's own doc comment always claimed.
  2. **`Button` composed with `render={<Link .../>}` triggers a real Base UI accessibility issue**, not just a console warning: Base UI's `Button` defaults `nativeButton` to `true`, and when the rendered element isn't an actual `<button>`, it stamps `role="button"` onto whatever is — including an anchor tag that navigates via `href`, overriding the anchor's correct implicit `role="link"`. Passing `nativeButton={false}` silences the warning but keeps the wrong role. The actual fix: for plain navigation styled as a button, don't use Base UI's Button-as-trigger composition at all (that mechanism is for interactive triggers — dialogs, menus, sheets) — use the exported `buttonVariants()` class-name function directly on a plain `<Link>` instead, so it keeps its native `role="link"` semantics. Applied across all 5 new Link-styled-as-button usages this phase introduced.
  3. Zod's `.default()` on a `.transform()`-piped schema applies to the *pre-transform* input type, not the post-transform output — `z.enum(["true","false"]).transform(v => v === "true").default("true")` fails to typecheck because `.default()` there expects a `boolean`, not a `"true"` string. Fixed by moving `.default()` before `.transform()` in the pipe (`lib/validation/groups.ts`'s `boolString` helper, used for the create-group form's Select-driven `isPublic`/`requireApproval` fields).
  4. `useSearchParams()` in the login/register client pages (for reading `?next=`) needs a `<Suspense>` boundary or `next build` fails prerendering with "should be wrapped in a suspense boundary" — split each page into an outer default export wrapping an inner form component.

  Verified end-to-end via Playwright + direct DB checks: anonymous discovery lists the public group; register-with-`next` lands back on the join-request form; a join request appears in `/pending-members` and approving it both activates the membership and creates the `members` row; the same flow's rejection path (unregistered admin email) is cleanly rejected by `createGroupAction`; and — the scenario that caught bug 1 — creating a second group with an already-a-member user as its admin now succeeds and that user ends up with two independent `members` rows, one per group. *Demoable: platform-wide operability without DB console access.*

  **Post-Phase-6: UMSPay removed.** At the user's request, the UMSPay integration (added after Phase 5, verified working) was fully removed in favor of IntaSend only — `lib/payments/umspay.ts`, the provider dispatcher (`lib/payments/index.ts`), `app/api/payments/callback/umspay/route.ts`, the `payment_provider` enum, and `platform_payments.provider` column are all gone (migration `0016_drop_payment_provider.sql`); the IntaSend webhook route moved back to its pre-dual-provider path, `app/api/payments/callback/route.ts`. `PAYMENT_PROVIDER` and all `UMSPAY_*` env vars were removed from `.env.local`/`.env.example`. The user first supplied an IntaSend *publishable* key (`ISPubKey_live_...`) rather than the *secret* key the server-side Bearer-auth STK push call actually needs — flagged rather than silently misused, since a publishable key would just 401 — then supplied the real secret key (`ISSecretKey_live_...`). With `INTASEND_ENV=live` and a real MGR slot, a live "Charge platform fee" was triggered through the actual UI: the request correctly reached IntaSend's live API and got a real, structured rejection back — `"Your business is not eligible to transact"` — which the app handled exactly as designed (payment row marked `failed`, clean error surfaced, no crash, no charge). This is IntaSend's own account-verification gate (new live accounts need business/KYC approval before M-Pesa collections work), not a bug in this app; blocked on the user completing that in IntaSend's dashboard.
- **Phase 7 — Hardening.** ✅ RLS policy test suite done; MGR load test / accessibility pass / PWA parity not yet started. What shipped here turned into the single most consequential finding of the whole rewrite — not a UI bug, but that **RLS had never actually been enforced, for any table, for the entire project up to this point**:

  1. **`neondb_owner` — the only role the app ever connected as through Phase 6 — has `BYPASSRLS`.** Neon grants this to a project's default/owner role. Postgres exempts any role with BYPASSRLS from RLS entirely, regardless of `ENABLE`/`FORCE ROW LEVEL SECURITY` or how carefully the policies are written. Confirmed empirically: querying `members` with `app.current_group_id` set to a value that matched nothing still returned real rows. Every "RLS as defense-in-depth" claim made in this document from Phase 0 onward was true of the *policies*, not of what was actually enforced — the app-level `WHERE group_id = ...` filters were, in practice, the *only* thing preventing cross-tenant access this whole time, with zero fail-safe behind them. This is exactly the class of gap a real hardening pass exists to catch, and it was only findable by actually testing against a role that doesn't bypass RLS — which nothing before this phase did.

     **Fix**: created a second, least-privilege Postgres role, `chama_app` (`NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`, granted `SELECT, INSERT, UPDATE, DELETE` on all tables + `USAGE, SELECT` on all sequences, plus `ALTER DEFAULT PRIVILEGES` so future migrations extend the same grants automatically). The running app now connects as `chama_app` via a new `APP_DATABASE_URL` env var (`lib/db/client.ts` throws a clear error if it's unset rather than silently falling back to the bypass-capable owner role); `DATABASE_URL` (the owner role) is now used *only* by `drizzle-kit generate`/`migrate`, since only the owner can run DDL (`CREATE TABLE`, `CREATE POLICY`, etc). `tests/rls.test.ts`'s first assertion checks `pg_roles.rolbypassrls` directly and fails loudly if the connected role ever regresses back to bypass-capable — otherwise every other assertion in the suite would pass vacuously without anyone noticing.

  2. **`groups` had `ENABLE ROW LEVEL SECURITY` but was missing `FORCE ROW LEVEL SECURITY`** — every other RLS-protected table has both (see 0001_rls_policies.sql). FORCE only matters for a table's *owner*, so once `chama_app` (a non-owner role) was in place this specific gap was actually moot for it — but it's a real inconsistency in the original migration, fixed anyway (`0017_phase7_groups_rls_hardening.sql`) for correctness against any future role that might own the tables.

  3. **Every RLS policy in the schema (21 of them, written across Phases 0-5) casts `current_setting('app.current_group_id', true)` straight to `::int`, with no guard against an empty string.** On a *pooled* connection — exactly how `lib/db/client.ts` connects, one `Pool` reused across many requests — once any transaction has set `app.current_group_id` via `withTenant()`/`withPlatformAdmin()`, a **later** transaction on that same connection that never sets it sees `current_setting(..., true)` return `''` (empty string), not `NULL`. Confirmed empirically, not assumed from documentation — this is a known custom-GUC quirk once a parameter has been touched in a session. `''::int` throws a hard Postgres error (`22P02`), so the exact scenario RLS is supposed to fail *safely* against — a query that reaches an RLS-protected table without going through `withTenant`/`withPlatformAdmin`/`withUser` at all — would 500 instead of gracefully returning zero rows, on any connection that had prior tenant traffic. Fixed for all 21 policies with `NULLIF(current_setting(...), '')::int` (`0018_phase7_rls_null_guard.sql`). Like #1, this could never have surfaced before switching off the bypass-capable role, since nothing ever reached real policy evaluation at all.

  4. **Turning RLS on for real immediately broke session loading for private groups** — a genuinely new gap exposed only by fixing #1-#3, not a pre-existing bug: `getSession()` (`lib/auth/session.ts`) reads a user's own `group_memberships` (joined with each membership's `group`) and their own `members` rows, across *every* group they belong to — not scoped to any single tenant, so `withTenant` doesn't fit (the same reasoning that already kept `group_memberships` itself outside RLS entirely, see 0001_rls_policies.sql). Added a new `withUser(userId, fn)` wrapper (`lib/db/rls.ts`) plus two new additive, `FOR SELECT`-only policies: `groups_own_membership_read` (`0017_...sql`) and `members_own_row_read` (`0019_phase7_members_own_row_read.sql`) — "a user can always see groups/member-rows they actually belong to," mirroring the existing "my own data" carve-out for `group_memberships`. `getSession()` now wraps its `group_memberships`/`members` queries in `withUser`. Verified end-to-end via Playwright as a member-role user (Carol): her loan limit, active loan, and financial profile all still resolved correctly through the real (now-enforced) RLS.

  5. `scripts/seed.ts` had the same unwrapped-query problem as #4 in miniature — its "does a group already exist" check and its group-creation transaction both ran with no RLS context, which only ever worked because the demo group happens to be `isPublic: true` (covered by `groups_public_read`) and the codebase never triggered the create-path with the bypass off. Fixed by wrapping both in `withPlatformAdmin` — bootstrapping a brand-new tenant is inherently a platform-level operation, not scoped to an existing tenant, the same reasoning the super-admin console's `createGroupAction` already uses.

  A codebase-wide audit (every `db.*` call site outside the three wrapper functions, checked against every RLS-protected table) found only the `groups`-table call sites above as genuinely reachable without a wrapper; everything else already went through `withTenant`/`withPlatformAdmin` correctly, which is why nothing else broke when the bypass was removed.

  `tests/rls.test.ts` (18 new test cases across 8 `describe` blocks, 62 total tests project-wide) now exercises all of this for real: same-tenant visibility, cross-tenant invisibility on SELECT/UPDATE/DELETE, the "no RLS context set at all" fail-safe, the platform-admin cross-tenant bypass, both new `withUser` policies, and a direct reproduction of the NULLIF empty-string bug against a raw pooled connection. Verified end-to-end via Playwright as both an admin and a member-role user across every major page — zero console/page errors, all real data rendering correctly through the now-actually-enforced policies.

  MGR generation load test, accessibility pass, and PWA parity remain unstarted.

  **Post-Phase-7: MGR fraud prevention.** The app can't stop money moving outside it (MGR payouts are cash/M-Pesa handed directly between members, never through this app), so "prevent fraud" here means: make every claim/reassignment/paid-marking permanently attributable, not silently reversible. Concrete vectors found in the actual `mgr/actions.ts` code before this: `adminUpdateSlotAction` could reassign any slot to any member and mark it paid with zero audit trail (a rogue or compromised admin session could silently redirect a payout to themselves and no one could ever prove it); there was no record of *who* clicked "Mark paid" or *when*; and there was nothing capturing evidence the payout itself actually happened.

  Shipped: `mgr_slot_events`, a genuinely append-only audit table — not just an app convention, but enforced at the database level (`0021_phase7_mgr_slot_events_rls.sql` defines only `SELECT`/`INSERT` policies, no `UPDATE`/`DELETE` at all, so under RLS with FORCE those commands are denied outright for any role without `BYPASSRLS`, which `chama_app` deliberately doesn't have — verified live: both an `UPDATE` and a `DELETE` attempt against an existing event row affected zero rows). `claimSlotAction`, `adminUpdateSlotAction`, and `autoAssignAction` now each log an event (actor, role snapshot, action, before/after status and member, optional note) via a shared `logSlotEvent` helper. Also added `mgr_slots.payout_reference` — an optional field (M-Pesa code or a note) captured when marking a slot paid, the one piece of evidence the app can realistically hold onto that a payout happened; the "Mark paid" button became a dialog that prompts for it and states plainly that the action is permanent. A staff-only "Activity log" panel on the MGR page's Admin tab surfaces the full history.

  Recommended but *not* implemented (real design tradeoffs, not clear-cut): gating slot claims/payouts on the member having actually made their MGR contributions for that cycle (a free-rider check — deferred since some groups run more informally than a strict block would allow); requiring the platform fee to be charged before a slot can be marked paid (closes a revenue-leakage vector but changes the fee-flow's UX); a maker-checker control requiring two staff members to confirm a "paid" marking.

  **Post-Phase-7: role-based in-app guide.** `/guide` — a page that renders exactly the nav sections the viewer's role and this group's type actually unlock (reusing `getVisibleNavItems`, the same function the sidebar itself filters through, so the guide can't drift out of sync with what's really in the menu), each with a 1-2 sentence explanation now carried on `NavItem.guide` in `lib/nav-config.ts`. Includes a role/group-type summary card and a short "applies everywhere" section (group-switching, requesting to join another group, the MGR agreement gate). Verified as both an admin (10 sections, including Settings/Loans/Pending members) and a member (6 sections, correctly excluding all staff-only ones) — the two views render meaningfully different content, not just a role label.

  **Post-Phase-7: governance/KYC foundation.** A compliance audit against a 7-point concept (member identity reuse, group registration requiring filled offices, officials' KYC, member KYC, group documents, ongoing compliance tracking, membership approval) found the join-request workflow genuinely implemented, and almost everything else missing or dead: `group_memberships.role` only ever became `"admin"` (once, at group creation) or the default `"member"` — no code path assigned Treasurer or Secretary at all; `users.idNumber` existed but was never written by any form; `members.idNumber` existed but the Add Member form didn't even render an input for it; no ID images, photos, signatures, or addresses were captured anywhere, and there was no file upload capability in the app at all; `groups.active` defaulted `true` regardless of whether any officials beyond the founding admin existed; a second group's join-approval never carried forward a member's identity fields from their first group.

  Built (the foundational piece — group documents/bank details and compliance-obligation-with-reminders tracking are a deliberately separate follow-up, since reminders need a notification-channel decision this app doesn't have yet):
  - **Officials & registration-completeness**: `updateMemberRoleAction` (`app/(dashboard)/members/actions.ts`, admin-only, refuses to leave a group with zero active admins) plus a Role column on the Members page. `lib/domain/officials.ts`'s `computeRegistrationComplete` (pure, unit-tested) recomputes `groups.registrationComplete` after every role change — true once a group has at least one active admin, treasurer, *and* secretary. Enforced as a **grace period**, not a hard block at creation: a group can still be created with just its founding admin, but stays invisible to `/discover` and can't approve new join requests (`approveMembershipAction` now checks and rejects with a clear error) until the other two offices are filled — mirrored into `groups_public_read`'s RLS policy (`0023_officials_groups_public_read_gate.sql`) as defense-in-depth, not just an app-level filter. A dashboard banner tells staff what's missing.
  - **KYC capture + cross-group reuse**: `members` gained `idType`/`idDocumentUrl`/`photoUrl`/`signatureUrl`/`address`/`kycCompletedAt`. Fields live on `members`, not `users` — a members row is the canonical "real person in this group" even before they have a login. `lib/domain/officials.ts`'s `requiredKycFields(role)` drives both the completeness check and which fields the self-service `/profile` page shows (office holders additionally need address + signature). File uploads go through `@vercel/blob` (`app/api/upload/route.ts` — a thin, no-business-logic primitive — plus a reusable `FileUpload` component that renders a hidden input holding the resulting URL, so any plain form picks it up like a text field). Cross-group reuse is real in both directions: `updateMyKycAction` propagates a saved profile to every other group the same user belongs to (`withPlatformAdmin`, scoped strictly to the caller's own `userId` throughout so the cross-tenant reach can't touch anyone else's data); `approveMembershipAction` and the super-admin's `createGroupAction` both look up existing KYC for a user before creating their new group's `members` row, pre-filling it instead of leaving it blank.
  - **Rules inherently applied**: `groupMemberships.rulesAcceptedAt`, stamped automatically (not a new opt-in step, deliberately unlike the MGR agreement gate) everywhere a membership goes active — `approveMembershipAction`, the founding admin's insert in `createGroupAction`, and `createLoginForMemberAction`. Surfaced read-only on the Rules page ("you accepted these on {date}") and as a compliance-visibility badge on the Members page for staff.

  Verified end-to-end via Playwright against the real demo data: assigned Carol Kamau as Treasurer and Bob Otieno as Secretary on the live Members page, confirmed `registrationComplete` flipped true in the database, the dashboard banner disappeared, and `/discover` started showing "My Chama" again; registered a fresh user, requested to join, approved it as admin, and confirmed `rulesAcceptedAt` was stamped and visible; filled Carol's KYC via `/profile` (confirmed via direct DB read, since `defaultValue`-based inputs don't show up in a `textContent` check) and confirmed the officials-only fields (address/signature) only appear for her Treasurer role. Also directly verified `groups` has no DELETE policy at all (only SELECT/INSERT/UPDATE) — an unrelated pre-existing gap noticed while cleaning up test fixtures, not exploitable today since nothing in the app deletes a group, left as-is rather than expanding scope. Full suite: 73/73 tests (11 new for `lib/domain/officials.ts`), lint, typecheck, and production build all clean.

  Not yet done: `BLOB_READ_WRITE_TOKEN` still needs provisioning (create a Blob store in the Vercel dashboard and link it to the project) before uploads actually work in any environment — the upload route and UI are wired and ready, just unverified against a live store. Group documents (constitution/bylaws, signed registration application, stamp reference, bank/mobile-money details) and compliance-obligation tracking (annual returns, AGM/financial-account due dates, reminders) remain a separate follow-up plan.

This ordering builds the hardest, historically-buggiest surfaces (MGR, payments) *after* the schema/auth/RLS/domain-layer patterns are proven on simpler CRUD.

### Verification

- **Each phase**: manually click through that phase's "demoable" slice listed above, in both a staff role and a member role, across at least two group types (e.g. chama + welfare) to confirm feature gating works. Use the `run` skill (Playwright-driven, headless Chromium) since no browser is available directly.
- **Domain logic**: Vitest unit tests for every function in `lib/domain/*` (loan limit, platform fee, fine-type mapping, MGR schedule generation) — run via `npm test`, no DB required for pure functions; the seed/membership test does hit the real dev DB.
- **Phase 5**: exercise the Daraja **sandbox** (not production) for STK push + callback before wiring real credentials.
- **Phase 7**: RLS test suite — authenticate as tenant A, attempt to read/write tenant B's rows directly via Drizzle, assert every attempt returns zero rows/fails.
- **Pre-launch**: deploy to a Vercel preview environment, smoke-test each role × group-type combination end-to-end (register, join a group, record a contribution, apply for a loan, claim an MGR slot, submit a welfare claim) before promoting to production.
