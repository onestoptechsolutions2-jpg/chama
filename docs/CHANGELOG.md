# Changelog — phase-by-phase build history

> This is the full build history of the Chama Platform rewrite, kept verbatim
> as a record of what was built, in what order, and every real bug found
> along the way (many caught by actually running the app, not just code
> review). For the current-state technical reference, see
> [`architecture.md`](./architecture.md); for what to do next, see the
> **Known gaps** section at the bottom of this file.
>
> Numbered "bug N" references throughout this file and scattered across the
> codebase's own comments (`grep -rn "docs/architecture.md" --include=*.ts`)
> point at the **original bug list** immediately below.

## Why this was a rewrite, not a patch

The original app (Node/Express + raw-SQL Postgres backend, Vite/React SPA
frontend) worked but had accumulated real, live schema-drift bugs from
writing SQL by hand against a schema that evolved across four migrations
with no compiler/ORM to catch mismatches. A deep-dive review (every backend
route file, all 18 frontend pages, all 4 migrations, read in full) surfaced
9 confirmed live bugs and several architectural inconsistencies. The
decision was a full rewrite on Next.js/Vercel rather than patching
incrementally — same feature scope "done right," not a rescope.

### The 9 original bugs — fixed by design, not ported

| # | Bug | How the rewrite makes the *class* of bug impossible, not just the instance |
|---|---|---|
| 1 | `mgr.js` queried `members.status`/`members.member_id` — neither column existed. Broke MGR turns/generate/schedule entirely. | Drizzle `schema.ts` is the only place columns are defined — a phantom-column reference is a compile error, not a 500. |
| 2 | `loans.js /statement` queried `contributions.payment_date`/`month_label` — neither existed. Broke the member statement. | Same mechanism — the statement query is generated against the real schema. |
| 3 | Attendance auto-fine inserted `fines.type = 'absent'/'late'`, but the CHECK constraint only allowed `absence`/`lateness` — every attendance submission with an absent/late member threw. | One `attendanceStatusToFineType` map (`lib/domain/fines.ts`); the Postgres enum is generated from the same TS enum via Drizzle `pgEnum`, so TS and the DB constraint can't diverge. |
| 4 | `welfare.js GET /fund` used a `CROSS JOIN` that silently returned zero rows (zeroing totals) when there were no disbursed claims yet. | Rewritten as one aggregate query with `FILTER (WHERE status = 'disbursed')` — no join against an empty subquery. Test asserts an empty group returns zeros, not zero rows. |
| 5 | `payments.js` hardcoded the 5% platform fee instead of reading `groups.mgr_fee_pct`. | One `calcPlatformFee(amount, group.mgrFeePct)` in `lib/domain/payments.ts`. |
| 6 | `users.js` mutated `users.role` directly, but authorization actually checked `group_memberships.role` — two sources of truth that could diverge. | **Structural fix**: the rewritten `users` table has no `role` column at all. Nothing left to drift from. |
| 7 | `migrate.js` only ran migration 001, silently omitting 002-004 — masked because `server.js` re-ran all four on every boot (no equivalent pattern exists in serverless). | No boot-time migration runner. `drizzle-kit migrate` runs once as a required build step — a partial migration fails the deploy loudly. |
| 8 | `seed.js` never created `group_memberships` rows for the accounts it seeded — those accounts couldn't pass the membership check. | `scripts/seed.ts` does group → user → membership as one transaction; regression-tested by `tests/seed-membership.test.ts`. |
| 9 | Loan limit formula was inconsistent: `groups.loan_max_multiplier` (configurable, default 3.0) was exposed in Settings but ignored — actual logic hardcoded limit = 2× total savings (1× after an extension). | One `computeLoanLimit(member, group)` in `lib/domain/loans.ts`, reading `group.loanMaxMultiplier`, used by both the staff-approval and self-service paths. |

The standing rule behind 5/6/9 — carried forward as the project's central
convention ever since: **one domain function per business rule, imported
everywhere it's needed, always reading the group's actual config row.**
Every later hardcoded-value bug this project found (see the final entry
below) was exactly this same class recurring.

- **Phase 0 — Foundations.** ✅ Done. Scaffold, Tailwind+shadcn, Neon + branching, Drizzle schema for `groups`/`users`/`members`/`group_memberships`/`sessions` + RLS on `members`/`groups`, session auth, seed script (bug 8 fixed from day one, regression-tested).
- **Phase 1 — Core tenant CRUD.** ✅ Done. Rules, members (+ contribution recording, + create-login-for-member so member self-service has an account to sign in with), manual fines, meetings+attendance (fixed fine-type mapping — bug 3 verified fixed end-to-end), dashboard aggregate, unified settings (merged the two overlapping routers into one write path). `announcements` has a schema/RLS policy but no UI yet — deferred, not part of any phase's critical path so far. *Demoable: day-to-day recordkeeping.*
- **Phase 2 — Loans.** ✅ Done. `computeLoanLimit` (bug 9 fixed — reads `group.loanMaxMultiplier` instead of a hardcoded 2x/1x, verified via both the staff-direct and self-service+review paths), loan CRUD, repayments, self-service apply/cancel, staff review, member statement (bug 2 fixed — verified end-to-end with real contribution/loan/repayment/fine data rendering in one merged timeline). *Demoable: full loan lifecycle.*
- **Phase 3 — Welfare + Projects.** ✅ Done. Claims + fund-summary query (bug 4 fixed — two independent `COALESCE(SUM(...),0)` aggregates instead of a CROSS JOIN, verified against the exact zero-disbursed-claims edge case that broke the original), projects + contributions. Also found and fixed a real, pervasive UI bug while verifying this phase: Base UI's `Select.Value` shows the raw `value` string unless the `Select.Root` gets an `items={{value: label}}` map — every `<Select>` in the app up to this point was silently displaying raw values/IDs (e.g. a member picker showing "2" instead of "Bob Otieno") instead of labels; fixed across all 8 affected components. The seeded demo group's type was changed from `chama` to `hybrid` for testing (unlocks loans/welfare/projects/MGR at once) and left that way as a fuller demo. *Demoable: welfare/selfhelp/hybrid types fully functional.*
- **Phase 4 — MGR.** ✅ Done. Config, turns, schedule generation (`lib/domain/mgr.ts`, 11 Vitest unit tests, no DB) with slot claim/auto-assign/cycles/4-field agreement gate. Bug 1 fixed and verified end-to-end: generated a real 3-member schedule (3 cycles, correct payout math), signed the agreement, auto-assigned all slots — the exact `POST /generate` flow that 500'd on every call in the original. Found and fixed one gap in the original design while building this: nothing in the original ever transitioned a cycle from `planned` to `active` after the first (seed-bootstrapped) one, which would have permanently stuck the agreement gate on cycle 1 — `closeCycleAction` now activates the next planned cycle automatically. Also tightened `mgr_agreements` to be scoped per (user, cycle) instead of the original's per (user, group), since financial terms can differ between cycles.
- **Phase 5 — Payments + Cron.** ✅ Done (mostly — a real IntaSend secret key is still needed from the user to prove out a live STK push; everything up to that boundary is built and verified). IntaSend payments (see [`api.md`](./api.md) for the current shape) + webhook callback, `calcPlatformFee` fix (bug 5, verified against real data: Ksh 150 = Ksh 3,000 payout × 5% `mgrFeePct`, not a hardcoded literal), Vercel Cron with advisory-lock + audit table. Also added `contribution_dues` (never built in any earlier phase, and never actually populated by any code path in the original app either — the cron generates each period's due rows itself now, so the enforcement half has real data to act on instead of being permanently dead code). Real bugs caught while verifying, all fixed:
  1. `date + $1` with a plain numeric parameter is type-ambiguous to Postgres — needed an explicit `::integer` cast in the overdue-dues query.
  2. `new Date(y, m, d)` (separate numeric args) builds a local-time `Date`, but `.toISOString().split("T")[0]` always converts to UTC — in Africa/Nairobi (UTC+3) this silently shifted every generated due date back by one day. Fixed with manual local-component formatting instead. **This exact bug class recurred twice more later** (Post-Capital-Position and the subscription-billing phase) — see the developer guide's gotchas list.
  3. `isValidIntasendChallenge` was originally written inside `lib/payments/intasend.ts`, which imports `"server-only"` — a guard that throws when imported outside Next.js's bundler, so this pure, easily-unit-testable check was silently never actually tested. Moved to `lib/domain/payments.ts` (no server-only guard, matches where every other pure business-rule function already lives).
  4. `drizzle-kit generate`'s rename-vs-drop+add disambiguation needs an interactive TTY prompt this environment doesn't have — hit while trying to rename `payment_webhook_events.challenge_valid` to something provider-neutral (back when a second provider existed). Rather than fight the tooling (a botched manual attempt at forcing it through left the migration journal and snapshot files briefly inconsistent, causing `drizzle-kit migrate` to hang with no error), the rename was abandoned — the column keeps its original name with a comment explaining its meaning.

  A second payment provider (UMSPay) was added shortly after this phase, fully built and verified end-to-end (dual-provider dispatch, its own webhook route, its own tests), then removed again at the user's request in favor of IntaSend only — see the Phase 6 entry below for that revert and the schema bug it caught on the way out.

  Verified end-to-end: cron auth (401 without the header), advisory-lock idempotency (re-running produces 0 rows, no double-fining), the full audit trail (cron_runs correctly captured both a real failure and the fix), webhook challenge verification (both valid and invalid cases, both logged), and both providers' platform-fee trigger failure paths (IntaSend: clean "INTASEND_SECRET_KEY is not set"; UMSPay: clean "UMSPAY_API_KEY / UMSPAY_EMAIL is not set" — each surfaced to the admin, payment record correctly marked `failed` with the right `provider`, no crash) — the only thing not yet proven is a real STK push actually reaching a phone, which needs live sandbox credentials for either provider. *Demoable: fee collection and automated enforcement, once IntaSend or UMSPay credentials are supplied.*
- **Phase 6 — Multi-tenancy polish + Super-admin.** ✅ Done. Public discovery (`/discover`, `/discover/[id]`) reading `groups` anonymously via the `groups_public_read` RLS policy (safe-columns-only select, no staff-only fields exposed), join-request flow (`group_memberships` insert with `status: 'pending'`, re-request supported after a rejection, `maxMembers` cap enforced), pending-members approval (`/dashboard/pending-members`, admin/treasurer-gated — approving creates the member's `members` financial-profile row in the same transaction if one doesn't already exist), and a `platformRole`-gated super-admin console at `/super-admin` (`groups` list + create-group-with-initial-admin form using `withPlatformAdmin`, `stats` cross-tenant metrics). Login/register gained a `?next=` redirect (open-redirect-guarded — only same-origin relative paths accepted) so a visitor can discover a group, register, and land back on the join-request form in one flow. Group-switcher UI was already built in Phase 0 (`GroupSwitcher` in `dashboard-shell.tsx`) — this phase just added a link into it for platform admins.

  Real bugs caught while verifying, all fixed:
  1. **`members.userId` had a bare column-level `.unique()` constraint** — meaning a user could only ever have a financial-profile row in *one group on the entire platform*, silently contradicting the "a user belongs to multiple groups" multi-tenancy premise every other table in this schema was built around. Latent since Phase 0; nothing before Phase 6 exercised a single user joining two groups. Caught live: super-admin tried to make Carol (already a member of "My Chama") the admin of a second group, and the `members` insert threw `duplicate key value violates unique constraint "members_user_id_unique"`. Fixed by dropping the global unique constraint and replacing it with a composite `unique(user_id, group_id)` (migration `0015_phase6_members_composite_unique.sql`) — a user now gets one `members` row per group, which is what the table's own doc comment always claimed.
  2. **`Button` composed with `render={<Link .../>}` triggers a real Base UI accessibility issue**, not just a console warning: Base UI's `Button` defaults `nativeButton` to `true`, and when the rendered element isn't an actual `<button>`, it stamps `role="button"` onto whatever is — including an anchor tag that navigates via `href`, overriding the anchor's correct implicit `role="link"`. Passing `nativeButton={false}` silences the warning but keeps the wrong role. The actual fix: for plain navigation styled as a button, don't use Base UI's Button-as-trigger composition at all (that mechanism is for interactive triggers — dialogs, menus, sheets) — use the exported `buttonVariants()` class-name function directly on a plain `<Link>` instead, so it keeps its native `role="link"` semantics. Applied across all 5 new Link-styled-as-button usages this phase introduced.
  3. Zod's `.default()` on a `.transform()`-piped schema applies to the *pre-transform* input type, not the post-transform output — `z.enum(["true","false"]).transform(v => v === "true").default("true")` fails to typecheck because `.default()` there expects a `boolean`, not a `"true"` string. Fixed by moving `.default()` before `.transform()` in the pipe (`lib/validation/groups.ts`'s `boolString` helper, used for the create-group form's Select-driven `isPublic`/`requireApproval` fields).
  4. `useSearchParams()` in the login/register client pages (for reading `?next=`) needs a `<Suspense>` boundary or `next build` fails prerendering with "should be wrapped in a suspense boundary" — split each page into an outer default export wrapping an inner form component.

  Verified end-to-end via Playwright + direct DB checks: anonymous discovery lists the public group; register-with-`next` lands back on the join-request form; a join request appears in `/dashboard/pending-members` and approving it both activates the membership and creates the `members` row; the same flow's rejection path (unregistered admin email) is cleanly rejected by `createGroupAction`; and — the scenario that caught bug 1 — creating a second group with an already-a-member user as its admin now succeeds and that user ends up with two independent `members` rows, one per group. *Demoable: platform-wide operability without DB console access.*

  **Post-Phase-6: UMSPay removed.** At the user's request, the UMSPay integration (added after Phase 5, verified working) was fully removed in favor of IntaSend only — `lib/payments/umspay.ts`, the provider dispatcher, `app/api/payments/callback/umspay/route.ts`, the `payment_provider` enum, and `platform_payments.provider` column are all gone; the IntaSend webhook route moved back to its pre-dual-provider path, `app/api/payments/callback/route.ts`. The user first supplied an IntaSend *publishable* key (`ISPubKey_live_...`) rather than the *secret* key the server-side Bearer-auth STK push call actually needs — flagged rather than silently misused, since a publishable key would just 401 — then supplied the real secret key. With `INTASEND_ENV=live` and a real MGR slot, a live "Charge platform fee" was triggered through the actual UI: the request correctly reached IntaSend's live API and got a real, structured rejection back — `"Your business is not eligible to transact"` — which the app handled exactly as designed (payment row marked `failed`, clean error surfaced, no crash, no charge). This is IntaSend's own account-verification gate (new live accounts need business/KYC approval before M-Pesa collections work), not a bug in this app; blocked on completing that in IntaSend's dashboard.
- **Phase 7 — Hardening.** ✅ RLS policy test suite done; MGR load test / accessibility pass / PWA parity not yet started. What shipped here turned into the single most consequential finding of the whole rewrite — not a UI bug, but that **RLS had never actually been enforced, for any table, for the entire project up to this point**:

  1. **`neondb_owner` — the only role the app ever connected as through Phase 6 — has `BYPASSRLS`.** Neon grants this to a project's default/owner role. Postgres exempts any role with BYPASSRLS from RLS entirely, regardless of `ENABLE`/`FORCE ROW LEVEL SECURITY` or how carefully the policies are written. Confirmed empirically: querying `members` with `app.current_group_id` set to a value that matched nothing still returned real rows. Every "RLS as defense-in-depth" claim made from Phase 0 onward was true of the *policies*, not of what was actually enforced.

     **Fix**: created a second, least-privilege Postgres role, `chama_app` (`NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`, granted `SELECT, INSERT, UPDATE, DELETE` on all tables + `USAGE, SELECT` on all sequences, plus `ALTER DEFAULT PRIVILEGES` so future migrations extend the same grants automatically). The running app now connects as `chama_app` via a new `APP_DATABASE_URL` env var; `DATABASE_URL` (the owner role) is now used *only* by `drizzle-kit generate`/`migrate`. `tests/rls.test.ts`'s first assertion checks `pg_roles.rolbypassrls` directly and fails loudly if the connected role ever regresses back to bypass-capable.

  2. **`groups` had `ENABLE ROW LEVEL SECURITY` but was missing `FORCE ROW LEVEL SECURITY`** — fixed for correctness against any future role that might own the tables.

  3. **Every RLS policy in the schema (21 of them, written across Phases 0-5) casts `current_setting('app.current_group_id', true)` straight to `::int`, with no guard against an empty string.** On a *pooled* connection, once any transaction has set `app.current_group_id`, a **later** transaction on that same connection that never sets it sees `current_setting(..., true)` return `''` (empty string), not `NULL`. `''::int` throws a hard Postgres error, so the exact scenario RLS is supposed to fail *safely* against would 500 instead. Fixed for all 21 policies with `NULLIF(current_setting(...), '')::int`.

  4. **Turning RLS on for real immediately broke session loading for private groups.** `getSession()` reads a user's own `group_memberships`/`members` rows across *every* group they belong to — not scoped to any single tenant, so `withTenant` doesn't fit. Added a new `withUser(userId, fn)` wrapper plus two additive, `FOR SELECT`-only policies (`groups_own_membership_read`, `members_own_row_read`) — "a user can always see groups/member-rows they actually belong to." **This exact bug class recurred a second time later** (see the guarantors phase below) — see the developer guide's gotchas list.

  5. `scripts/seed.ts` had the same unwrapped-query problem in miniature — fixed by wrapping both its checks in `withPlatformAdmin`.

  `tests/rls.test.ts` (18 test cases across 8 `describe` blocks) exercises all of this for real: same-tenant visibility, cross-tenant invisibility on SELECT/UPDATE/DELETE, the "no RLS context set at all" fail-safe, the platform-admin cross-tenant bypass, both new `withUser` policies, and a direct reproduction of the NULLIF empty-string bug. *Demoable: platform-wide operability without DB console access.*

  MGR generation load test, accessibility pass, and PWA parity remain unstarted.

  **Post-Phase-7: MGR fraud prevention.** The app can't stop money moving outside it (MGR payouts are cash/M-Pesa handed directly between members, never through this app), so "prevent fraud" here means: make every claim/reassignment/paid-marking permanently attributable, not silently reversible. Shipped: `mgr_slot_events`, a genuinely append-only audit table — enforced at the database level (only `SELECT`/`INSERT` RLS policies, no `UPDATE`/`DELETE` at all — verified live that both throw). `claimSlotAction`, `adminUpdateSlotAction`, and `autoAssignAction` now each log an event via a shared `logSlotEvent` helper. Also added `mgr_slots.payout_reference` (an M-Pesa code or note captured when marking a slot paid) and a staff-only "Activity log" panel on the MGR page.

  Recommended but *not* implemented (real design tradeoffs, not clear-cut): gating slot claims/payouts on the member having actually made their MGR contributions for that cycle; requiring the platform fee to be charged before a slot can be marked paid; a maker-checker control requiring two staff members to confirm a "paid" marking.

  **Post-Phase-7: role-based in-app guide.** `/dashboard/guide` — renders exactly the nav sections the viewer's role and group type actually unlock (reusing `getVisibleNavItems`), each with a 1-2 sentence explanation carried on `NavItem.guide` in `lib/nav-config.ts`.

  **Post-Phase-7: governance/KYC foundation.** A compliance audit found the join-request workflow genuinely implemented, and almost everything else missing: no code path ever assigned Treasurer/Secretary; no ID images/photos/signatures/addresses captured anywhere; no file upload capability at all; a second group's join-approval never carried forward a member's identity fields from their first group. Built:
  - **Officials & registration-completeness**: `updateMemberRoleAction` (admin-only, refuses to leave a group with zero active admins). `lib/domain/officials.ts`'s `computeRegistrationComplete` recomputes `groups.registrationComplete` after every role change — true once a group has at least one active admin, treasurer, *and* secretary. Enforced as a **grace period**: a group can be created with just its founding admin, but stays invisible to `/discover` and can't approve new join requests until the other two offices are filled.
  - **KYC capture + cross-group reuse**: `members` gained `idType`/`idDocumentUrl`/`photoUrl`/`signatureUrl`/`address`/`kycCompletedAt`. File uploads go through `@vercel/blob` (`app/api/upload/route.ts` — see [`api.md`](./api.md)). `updateMyKycAction` propagates a saved profile to every other group the same user belongs to; `approveMembershipAction` and the super-admin's `createGroupAction` pre-fill from existing KYC.
  - **Rules inherently applied**: `groupMemberships.rulesAcceptedAt`, stamped automatically everywhere a membership goes active.

  Verified end-to-end via Playwright. Full suite: 73/73 tests. Not yet done at the time: `BLOB_READ_WRITE_TOKEN` provisioning (since resolved). Group documents (constitution/bylaws, bank details) and compliance-obligation tracking (annual returns, reminders) remain a separate follow-up plan, still not built.

  This ordering built the hardest, historically-buggiest surfaces (MGR, payments) *after* the schema/auth/RLS/domain-layer patterns were proven on simpler CRUD.

- **Post-Phase-7: Capital Position.** Grew out of a strategic product-vision review (Laitor as a "community-finance operating system," not just a chama bookkeeping app) that concluded the fastest way to earn that claim wasn't new CRUD, but turning the existing ledger into an allocation view: how much of the group's pooled capital is currently out on loan versus sitting in reserve, visible to every member, plus an optional group-set target with drift alerts.

  Scoped deliberately narrow: `lib/domain/capital.ts`'s `computeCapitalPosition` treats only the **capital pool** (`sum(members.capital)`) as deployable — security and personal savings are separate, non-lendable pools. One nullable column, `groups.targetLoanDeploymentPct` — unset means no policy configured, `computeAllocationDrift` returns `null` rather than flagging drift against an invented baseline. Drift beyond ±15 points is flagged `over_deployed`/`under_deployed`. `/dashboard/capital` carries **no** `roles` restriction — visible to every member, directly answering the "member-side opacity" pain point the strategy review flagged.

  12 Vitest cases (`tests/capital.test.ts`). Verified end-to-end via Playwright. Full suite: 89/89 tests.

- **Post-Capital-Position: Subscription billing.** Follow-on from a monetization strategy review that concluded the app's only live revenue mechanism was a single, still-unverified 5% MGR fee. `lib/domain/billing.ts` — pure, unit-tested (19 Vitest cases) pricing engine: a member-count band, a vehicle band weighted by complexity, an activity band keyed to trailing-12-month gross financial flow (never account balance), and a separate itemized `computeTransactionFee` (loan disbursement 0.75%, repayment 0.5% — directional rates, not confirmed against IntaSend's actual merchant rate, flagged as an open item). `subscription_invoices` — one row per billing period, snapshotting computed inputs at generation time. `/dashboard/billing` (admin/treasurer only) shows a live computed quote and a manual "Generate invoice" action.

  Caught and fixed the exact date-shift bug class from Phase 5 (bug #2) again, reintroduced fresh in two new places. **A more consequential finding, caught the same way**: `computeGroupBillingInputs` ran six aggregate queries via `Promise.all` inside one `withTenant` transaction — the exact RLS-race bug class from Phase 7 #4, copied into seven other pages by the time it was found (Dashboard, Capital Position, Welfare, Fines, Projects, Meetings, super-admin Stats). Not a security hole — RLS correctly and silently fail-safed to zero rows — but a real correctness bug: the billing page rendered a plausible-looking empty invoice history while a real invoice sat in the database.

  Verified end-to-end via Playwright. Full suite: 108/108 tests.

- **Post-Subscription-Billing: Scale audit.** Prompted directly by the billing-page bug above — swept the same `Promise.all`-inside-one-transaction race from all seven remaining pages that had it. The fix is mechanical and preserves concurrency: each query gets its **own** `withTenant`/`withPlatformAdmin` call, and those independent calls still run concurrently via an **outer** `Promise.all`.

  *Missing indexes — measured, not assumed.* Every one of the 29 tables had 0 indexes beyond primary keys/unique constraints, for the entire life of the project. Seeded a disposable 60-group / ~2,100-member / ~42,000-contribution / ~105,000-loan dataset, ran `EXPLAIN (ANALYZE, BUFFERS)` on the query shapes every major page and both cron jobs actually use, then deleted it all. Measured results, migration `0031_scale_indexes.sql` (26 `CREATE INDEX` statements): `loans WHERE member_id = X` went from a 6.6ms full scan of 105k rows to a 0.15ms index scan (~46×) — the query behind every single loan application/approval check. `loans WHERE group_id = X` ~6× faster; the billing activity-flow query ~8× faster.

  Not addressed, flagged as follow-ups: no pagination on `loans`/`contributions`/`members` `findMany` calls; connection-pool sizing under real concurrent production load (can't be measured from a local dev-database benchmark).

- **Post-Scale-Audit: Rule templates.** A starter library of common Kenyan-chama/table-banking rules a group can pick from and amend. `lib/domain/rule-templates.ts` — pure data, 30 templates across all nine categories, gated to a group's active vehicles the same way `getVisibleNavItems` gates the nav. No new table — templates only prefill the existing "Add a rule" form. Full suite: 114/114 tests.

- **Post-Rule-Templates: Vehicle-activation wizard.** Surfaced a genuine hole: `groups.loanInterestRate`/`loanMaxMultiplier`/`loanRepaymentMonths`/`loanLatePenalty` had driven every loan computation since Phase 2, but no Settings tab ever let a group actually change them from the seeded defaults. Fixed with a standalone Loans settings tab. The wizard itself replaces Settings → Products' flat checkbox grid with per-vehicle cards, each opening a multi-step activation dialog (intro → configure → starter rules → review) as **one combined server action** fired only at the final step, so a group can't end up half-configured. Full suite: 114/114 tests.

- **Post-Wizard: Loan guarantors — and the RLS-race bug's second occurrence.** `loan_guarantors` — a self-service application creates `pending` rows against the *application*; approval re-points the same rows at the resulting *loan* rather than creating fresh ones, so the acceptance record survives the transition. Staff-direct loan creation auto-accepts (staff are already vouching directly). `lib/domain/guarantors.ts` — pure eligibility rules (can't guarantee your own loan, must be active, no defaulted loan of your own, a configurable concurrent-guarantee cap — see [`architecture.md`](./architecture.md) for the current shape).

  **Found by the exact same RLS-race bug class this project had already hit once (Phase 7 #4) — this time in `getSession()` itself**, the single most-executed function in the app. It ran its `groupMemberships`/`members` lookups via `Promise.all` inside one `withUser` transaction; concurrent queries against one transaction can silently drop the transaction-local `SET LOCAL` context, so a genuine member's `activeMembership.memberId` came back null. Fixed the same way — two independent `withUser` calls. Verified end-to-end with three real accounts against live data. Full suite: 126/126 tests.

- **Post-Guarantors: New-group setup wizard.** Runs the vehicle-activation wizard's exact steps once, at group birth, instead of leaving the founding admin to separately discover Settings' six tabs. Extended `createGroupAction` rather than adding a parallel path — one combined transaction. Full suite: 126/126 tests.

- **Post-Wizard: Welfare policy & ledger rebuild ("Phase 8").** The original welfare implementation (Phase 3) was a single running balance derived from collected-minus-disbursed — enough to demo, not enough to run a real welfare fund against a written policy. Rebuilt into a proper multi-reserve ledger system: three named reserves per group (`welfare_funds`), each fed by a configurable funding rule; tiered approval (single staff / two co-signing officials / all three, by amount); a member eligibility gate (tenure, claim cap, cooldown); welfare advances (a loan-like short-term draw with its own fee); an append-only `welfare_ledger`; and a generic `notifications` table (welfare's `buildWelfareNotification` was its first producer). See [`architecture.md`](./architecture.md) for the current data model and [`user-guide.md`](./user-guide.md) for how it works day to day.

- **Post-Phase-8: first real customer — GreatMinds.** Seeded and backfilled a real table-banking chama's actual round-1 MGR history from their WhatsApp group log, rather than synthetic demo data.

- **Post-Phase-8: Insights.** `lib/domain/insights.ts` + `/dashboard/insights` — turns the group's existing ledger and MGR schedule into plain-language judgments: what's next and is the rotation on pace, per-member risk flags, and rule-based recommendations (registration incomplete, missing offices, capital drift, overextended, welfare strain).

- **Post-Insights: internal group account management.** `groups` gained a CRM layer (contact person, onboarding stage, account tier/owner, follow-up date, internal notes) plus an append-only `group_account_activities` log; `platform_user_audit_logs` mirrors this for platform-role grants themselves. Surfaced on `/super-admin/groups` and `/super-admin/users`.

- **Post-Account-Management: self-service group creation.** `groups_self_service_insert`, a new RLS policy, lets an authenticated active user create their own group directly (`/dashboard/onboarding`) instead of every tenant requiring a super-admin. Group created private with approval required; founding membership created in the same transaction.

- **Post-Self-Service: public marketing site.** `app/page.tsx` — previously the authenticated dashboard's own home page — rebuilt as a full public marketing site, since `/`'s actual audience is now anonymous visitors, not signed-in members.

- **Session: `/dashboard` route-prefix migration, mobile-first nav, and the analytics rebuild.** Found and fixed a real gap the public-site change above left behind: every authenticated page was still bare-rooted (e.g. `/members`), and every session-guard redirect still pointed at `/`, which was now the marketing site. Fixed by moving every authenticated route under a literal `dashboard/` segment (`/dashboard/*`, one shared layout, no duplication) and retargeting every redirect. Same pass: a validated `--viz-*` data-viz design-token system (`components/feature/charts.tsx`); Reports merged into Insights; a mobile bottom tab bar (`NavItem.primary`, capped at 4 tabs + "More"); and `/super-admin/groups/[id]`, a dedicated per-tenant profile page replacing the crowded single edit-dialog.

- **Post-Analytics-Rebuild: brand retheme.** `app/globals.css`'s design tokens rebuilt from the marketing site's own palette (cream/forest/terracotta/lime) instead of the generic shadcn grayscale scaffold — a single-file change, since every dashboard surface already reads tokens through Tailwind semantic classes rather than hardcoded colors.

- **Post-Retheme: subscription-payment reconciliation bug.** `/api/payments/subscription-invoice` let an admin retrigger an M-Pesa STK push for a still-pending invoice, leaving the previous attempt's row permanently `pending` if its own webhook never resolved — silently inflating super-admin's "payment pending" total forever. Fixed by marking any still-pending payment already linked to the invoice `failed` before inserting the new attempt.

- **Post-Reconciliation-Fix: recommendations on dashboard home, and a first reader for `notifications`.** `generateRecommendations` had been fully built but rendered only on `/dashboard/insights`, a page nobody's prompted to click; the `notifications` table had been populated by welfare events since Phase 8 with no page anywhere that ever read a row back out. Fixed both: the dashboard home now surfaces the top 1-2 recommendations, and a notification bell + `/dashboard/notifications` reads/marks-read a user's own notifications.

- **Session: pipeline audit, notifications extended, hardcoded-values sweep.** A deep-dive of the discovery-to-active-group pipeline (landing → discover → register/join → staff approval, and the self-service group-creation path) caught two real bugs by actually running the app end-to-end, not just reading code: a stale "Go to dashboard" link still pointing at `/` (the marketing site, post-migration), and — the more serious one — **self-service group creation was completely broken**, 100% reproducible. `INSERT ... RETURNING` under `FORCE ROW LEVEL SECURITY` also requires the new row to satisfy a SELECT policy, and at the exact moment `createOnboardingGroupAction` inserted the group, none of `groups`' three SELECT policies matched yet (not public, no `app.current_group_id` set under the `withUser` context this action uses, and the founding membership row didn't exist yet either). The super-admin wizard never hit this because it runs under `withPlatformAdmin`, which satisfies a different policy branch. Fixed via `lastval()` (a session-local sequence read, not subject to RLS) instead of `.returning()`.

  Same session: extended `notifications` beyond welfare to join requests and loan applications/guarantors (the first non-welfare feature to use the table, via a new shared `lib/db/notifications.ts` insert/fan-out helper); unit-tested four previously-untested `lib/domain/*` modules (`loans`, `fines`, `contributions`, `notifications`) and removed a confirmed-dead `@deprecated` fallback in `computeCapitalPosition`; smoke-tested the app end-to-end with Playwright (no project run skill existed yet) and caught two more real bugs — a Server Component passing a plain function prop into a Client Component (`/dashboard/capital` 500ing), and the exact `Promise.all`-inside-one-transaction RLS race recurring a *third* time, in the brand-new `/super-admin/groups/[id]` page this session had just shipped.

  Finally, a sweep for hardcoded values that should read group config (the same shape as bugs #5/#9) found three real instances in newer code, each contradicting its own module's doc comment that group config should already win: a platform-wide concurrent-loan-guarantee cap, and hardcoded loan/personal-savings minimums baked into Zod schemas instead of `groups` columns. All three are now `groups` settings (`loanMaxConcurrentGuarantees`, `minLoanAmount`, `minPersonalSavingsIncrement`), defaulted to their prior hardcoded values so no existing group's behavior changed.

  Verified: `tsc --noEmit`, `eslint`, a full `next build`, and the full test suite all clean at each step.

- **Session: documentation restructured, then a genuinely public developer API + outbound webhooks.** [`api.md`](./api.md), [`user-guide.md`](./user-guide.md), [`developer-guide.md`](./developer-guide.md), and this file split out of what had been one unwieldy doc — audience-appropriate references instead of one file trying to serve end users, integrators, and contributors at once. Every internal route documented in `api.md` was then re-verified live (not just read), confirming the session-gated/shared-secret/cron auth model actually matched the code.

  That internal API was explicitly session-gated only — nothing existed for a third-party developer to call from outside a browser session. Built one: `/api/v1/*`, bearer-token-authenticated against a new per-group `api_keys` table (SHA-256 hash stored, plaintext shown once), scoped read + one safe write (`POST /api/v1/contributions` — money in only, never a disbursement/approval) after confirming the intended scope directly rather than guessing on a financial app. Paired with outbound webhooks (`webhook_endpoints` + append-only `webhook_deliveries`, HMAC-SHA256-signed, single-attempt no-retry-queue delivery — this app has no background job runner) firing on `contribution.recorded`, `loan.approved`, `loan.rejected`, `member.joined`, `mgr.slot.paid`. Managed at a new `/dashboard/developer` page (group admin only). Welfare-request submission was deliberately left out of v1 — its tiered-approval/eligibility logic (`lib/domain/welfare-approval.ts`) was judged too easy to get subtly wrong by re-implementing outside the existing Server Action, so it stayed read-only; see `api.md`.

  Verified: `tsc --noEmit`, `eslint`, the full test suite, and a full `next build` all clean.

- **Session: welfare suite expansion — standard taxonomy, a policy wizard, API/webhook coverage, and a new governance module.** Requested as "the whole welfare suite" and narrowed to four concrete work streams:

  1. **Taxonomy.** `welfare_claim_type` grew from 7 to 10 categories — added `benevolence`, `wedding`, `calamity` (via `ALTER TYPE ... ADD VALUE`; `education` already covered academics, not duplicated).
  2. **Wizard-guided policy setup.** `lib/validation/welfare-policy.ts`'s `updateWelfarePolicySchema` had existed since Phase 8 with no action or UI ever calling it — groups were permanently stuck on hardcoded defaults. Fixed with a new `WelfarePolicyWizard` (mirrors `VehicleActivationWizard`'s dialog + step-index + single-combined-submit pattern) at a new Settings → Welfare tab.
  3. **API + webhook coverage.** 4 new webhook event types — `welfare.request.submitted/approved/rejected/disbursed` — fired from `submitWelfareRequestAction`, `reviewWelfareRequestAction`, and `respondToWelfareApprovalAction`, always after their transaction commits, matching the established pattern. `.approved` and `.disbursed` fire together for a disbursing decision, since this domain has no separate "approved but not yet paid" moment. The public API's welfare route stayed read-only, consistent with its existing documented rationale (see the Known Gap below) — a new `GET /api/v1/welfare/policy` endpoint was added instead, so integrators can read real limits without guessing.
  4. **Governance module (new).** Closes the "Governance/KYC follow-up" gap below: `group_documents` (constitution, bank details, registration certificate, minutes — reusing `/api/upload`, generalized with an optional `folder` field so it isn't hardcoded to `kyc/`) and `compliance_obligations` (AGM/annual-returns/custom deadlines, `upcoming`/`due`/`overdue`/`completed`, optional recurrence). A new daily `compliance-reminders` cron flips status and notifies admin+secretary via the existing generic `notifications` table — the "notification-channel decision" the old gap was blocked on, resolved by reusing what already existed rather than building a new channel. New `/dashboard/governance` page, admin/secretary-gated, not tied to any financial product.

  Same session: the public marketing landing page (`app/page.tsx`) was rewritten around a clear problem/solution structure — four concrete pain points of running a chama by hand, mapped to four solution dimensions (See it / Automate it / Trust it / Extend it) — replacing three looser, overlapping sections.

  Verified: `tsc --noEmit`, `eslint`, the full test suite (239 tests, including all 40 live-DB RLS tests), and a full `next build` all clean.

- **Session: a real `/dashboard` bug, found by smoke-testing the session above and fixed immediately after.** The dashboard home page reliably threw an unhandled RLS-violation error — `new row violates row-level security policy for table "welfare_funds"` — for any welfare-enabled group whose `welfare_funds` row had never been created. Root cause: `activateProductAction`'s own doc comment claimed activation-time creation was "written explicitly" elsewhere, but for welfare specifically it never actually was — every group activated via the Settings wizard (not group-creation) was silently depending on `getOrCreateWelfareFund`'s lazy get-or-create fail-safe. That fail-safe was being raced by `/dashboard`'s own `Promise.all` of 6 concurrent `withTenant` transactions (one of them this exact insert) on every single page load — reliably reproducible, confirmed via a standalone repro script that the identical insert succeeds cleanly outside that concurrent context.

  Fixed two ways: (1) `activateProductAction` now actually calls `getOrCreateWelfarePolicy`/`getOrCreateWelfareFund` when activating welfare, inside its own single transaction, closing the real gap — no group activated this way again will ever depend on the lazy fallback; (2) `/dashboard/page.tsx` no longer calls the insert-capable `getOrCreateWelfareFund` at all — it does a plain `SELECT`, and a group with no row yet just doesn't show the welfare-fund metric card, rather than racing 5 sibling transactions to create one on a page hit by every request. A new migration (`0045_welfare_fund_backfill.sql`) re-runs Phase 8's original backfill for any group that slipped through since.

  Verified: `tsc --noEmit`, `eslint`, the full test suite, and a full `next build` all clean; live-reproduced the bug, applied the fix, then reloaded `/dashboard` repeatedly against a real welfare-enabled group with no prior fund row — confirmed clean with the metric now rendering.

- **Session: simpler dashboard, sign-in security, and a much fuller Mzunguko (MGR) cycle lifecycle.** Started as "rebuild it simply" and widened into an architecture/security review of the whole app.

  1. **Dashboard UI.** `dashboard-shell.tsx` rebuilt around one sidebar component used for both desktop and the mobile drawer, plus a persistent bottom bar on phones (Home + three role-relevant tabs + Menu). The menu is grouped under *Main / Money / Group / Account* headings (`section` on each `nav-config.ts` item, replacing the old `advanced`/`primary` flags). The home page runs one tenant transaction instead of five and drops the insights teaser and per-fund metric cards in favour of one "N members · Ksh X saved together" line. A TailAdmin-inspired look (brand blue `#465fff`, 290px sidebar) is applied to the dashboard only, via a `:root:has(.tailadmin)` token override in `globals.css`, so the public site keeps its own palette while portalled dialogs still pick the tokens up.
  2. **Sign-in and security.** Optional **Continue with Google** (`/api/auth/google`, `/api/auth/google/callback`; hidden until `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are set; links to an existing account by Google-verified email, else creates one; new column `users.google_id`). Per-account **login lockout** (5 wrong passwords → 15 minutes; `users.failed_logins`, `users.locked_until`). Minimum password raised to 8. **Admin-assisted password reset** for members (narrowly scoped — cannot reset admins, platform users, yourself, or anyone who belongs to another group). Uploads restricted to JPG/PNG/WebP/PDF (SVG no longer accepted). Baseline security headers in `next.config.ts` (HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy). The IntaSend webhook challenge is now compared in constant time. A shared `startSessionForUser` replaces duplicated "pick the first active group" logic.
  3. **Members lifecycle.** **Remove from group** (admin; blocked for yourself, admins, and anyone with an unpaid loan; suspends their membership, drops them from the MGR queue, frees any turn they hadn't been paid for) and **Bring back** (undoes it). `deactivateMemberAction` previously existed with no UI and, when it ran, left the member in the auto-assign queue — both fixed.
  4. **MGR cycle lifecycle.** Drift-free cycle dates (counted from the start date, month-end clamped — repeatedly adding a month used to turn 31 Jan into 3 Mar); a cycle can only be closed when it is the active one and every slot is paid or skipped (previously any cycle could be closed, even with money owed, and two cycles could end up active); cycles **auto-close and open the next** once the last slot is settled; **paid turns are immutable** (could previously be re-assigned or un-paid); a **random draw** within each round; a **reshuffle** of system-assigned unpaid turns (member-chosen turns are never touched); **archive finished rotation** and **start new rotation** (cycles use the existing `closed` status; a new rotation continues numbering after the archived ones and only counts turns above that base — `rotationBase` in `mgr/actions.ts`); a rotation progress summary; members can list up to three **preferred cycles** and the admin fills fairly by choice (`assignByPreferences`: everyone's first choice before anyone's second, random order within a choice, never over a member's turn allowance) with an optional **choices deadline**; and a daily `mgr-reminders` cron (contribution due tomorrow / your turn is tomorrow, de-duplicated per cycle).
  5. **New columns** (migrations `0046`–`0049`): `users.google_id`, `users.failed_logins`, `users.locked_until`, `mgr_member_turns.preferred_cycles`, `groups.mgr_choices_close_date`.

  A real lint rule worth knowing: `react-hooks/purity` flags `Date.now()` in render, including in Server Components. Use `nairobiToday()` from `lib/domain/mgr.ts` (it takes `new Date()` inside a helper, which the rule does not flag).

  Verified: `tsc --noEmit`, `eslint`, and the full test suite (252 tests) clean at each step.

## Merry-go-round rotations (Oct 2026)

- A **rotation** (one full round in which every member gets their turns) is
  now stored (`mgr_rotations`) instead of inferred from cycle numbers. Each
  keeps a copy of the settings it was planned with, so later changes never
  rewrite history; cycles and turns belong to one rotation, and turns are
  counted per rotation.
- **End date is automatic**: members × turns ÷ recipients per cycle gives the
  number of cycles, spaced by the frequency from the start date; recomputed
  whenever the plan changes. The settings form previews it.
- **Start date is adjustable**: before the first payout it moves the whole
  rotation; after, it moves the next payout and everything after it
  (completed cycles keep their dates). Officials are notified.
- **Archives itself** when the last turn is paid or skipped, and officials
  are told the suggested start of the next one (one period after the end).
  Past rotations show their dates, turns paid and total paid out.
- Migration 0062 backfills existing data: earlier archived cycles become one
  archived rotation, the live cycles the current one; no slot or its history
  is deleted.

## Funeral funds with Family Compass (Oct 2026)

- Partner API (`/api/partner/v1/funds`) for Family Compass: a funeral
  programme order creates a short-lived fund group; mourners give by M-Pesa
  prompt from Family Compass or Chama's public page (`/f/<token>`), without
  joining. Gifts record themselves; the partner gets signed webhooks with
  totals per family branch. The committee see the fund on Home; payouts use
  the wallet's two-official withdrawal to the family's nominated account
  (now also a personal M-Pesa number, IntaSend B2C).
- After the burial a fund converts into a family welfare chama, members
  invited from the family tree.
- Approved bereavement claims (with the claimant's consent) are referred to
  Family Compass; the claimant gets the programme link by SMS and the group
  earns the referral commission.
- Every outbound webhook now carries `eventId` and `X-Chama-Timestamp` with
  `X-Chama-Signature-256` over `"<timestamp>.<body>"` (old header kept).
- Migrations 0060–0061 (`funeral_funds`, `fund_gifts`,
  `welfare_requests.partner_contact_ok`, three webhook events).

## Group wallets on IntaSend (Oct 2026)

- Optional wallet per group under the platform's IntaSend account
  (`GROUP_WALLETS_ENABLED`, off by default). Members pay by M-Pesa prompt —
  from Payments (treasurer) or My Money (themselves) — and the payment is on
  their record as soon as IntaSend confirms it: no account numbers, no
  matching.
- Withdrawals only to the group's own bank (PesaLink), paybill or till; one
  official asks, a different official approves, checked against the live
  wallet balance. Only the admin sets the destination (never support), and
  it can't change while a withdrawal is open.
- This reverses the "never hold members' money" rule for groups that opt
  in: needs IntaSend's approval and a lawyer's view before it is switched on.
- New: `group_withdrawals`, `groups.intasend_wallet_id`,
  `groups.payout_destination` (migration 0059); permissions
  `money.withdraw`, `money.approveWithdrawal`, `money.payoutDestination`.

## Staff separation, deterministic agent, mobile (Oct 2026)

- Platform staff never belong to a group; they work on groups from the
  Support console (`/super-admin/support`) through time-boxed, audited
  support sessions.
- The agent is fixed rules, not an AI model: playbooks
  (`rematch-payments`, `loan-reminders`) plan from the group's records and
  run through the normal commands; daily cron, Support console *Run agent*,
  or `POST /api/internal/agent` (playbooks only). The earlier
  `/api/internal/commands` endpoint, which accepted arbitrary commands, is
  removed.
- One-screen landing page; every page measured and fixed at 375px.

## Lean v1: IAM, identity, payments and the assistant (Oct 2026)

Driven by `docs/audit-2026-10.md` and `docs/product-plan.md` (segments:
women's table banking, boda-boda, welfare/funeral, employee welfare; money
in the group's own paybill/till or bank; groups pay a subscription).

- **IAM** — one permission matrix (`lib/auth/permissions.ts`, documented in
  `iam.md`) for group and platform roles; every page/action/route and the
  menu use it. New `agent` platform role. Maker–checker on loans, repayments,
  MGR payouts and fine waivers.
- **Identity** — one person = one phone (canonical `2547…`), one
  find-or-create path (`lib/identity/people.ts`), Google links instead of
  duplicating, join approval links hand-added roster rows, CSV import skips
  existing people, unique indexes (added only where no duplicates remain),
  owner merge tool with a "Possible duplicates" list.
- **Invites** replace admin-typed passwords and work before registration is
  complete — this fixes the new-group dead end (no way to get a Treasurer
  and Secretary in).
- **Commands + audit log** — `lib/commands` runs a rule the same way for UI,
  API, M-Pesa, support and the agent, with an append-only
  `group_audit_log` and an Activity page. Fixed the API contribution drift
  (skipped the welfare fund; lost-update balance write).
- **Meeting-day recorder**, **SMS receipts** (Africa's Talking, optional)
  and a **no-password statement link**.
- **Segment templates** at Start a group.
- **Payment matching** — the group's own paybill/till via Daraja C2B,
  bank statement and payroll check-off CSVs; member numbers; an inbox for
  the rest.
- **Share-out calculator** and a **welfare benefit table**.
- **Plans** — Free / Group / Large group / Employer, with SMS allowances;
  Developer and Wallet parked from the menu.
- **Registration pack** — printable constitution, officials, register, minutes.
- **Support "act as"** — time-boxed, reasoned, view-only by default,
  audited, admins notified. **Agent endpoint** — dry-run by default, never
  moves money out.
- **Next steps** — deterministic assistant on Home.
- Fixes: `/discover` was static (new groups invisible until a deploy);
  Nairobi dates on Home, loans and welfare; `npm ci` lockfile; a secretary
  was shown "Add Money"; officials couldn't find "My Loan".
- Found by an end-to-end run on a local Postgres: M-Pesa callbacks and the
  agent read `groups` outside a tenant context, so RLS hid it — fixed.

## Contribution dues fixed, SMS reminders (Oct 2026)

- **Bug fixed:** monthly contribution dues were never marked paid when
  savings came in, so five days after each due date the daily job fined
  every member — including those who had paid. Savings (shares or personal
  savings) recorded by any door now pay off the member's oldest open dues
  (`allocateToDues`, `lib/commands/contributions.ts`). Migration 0066 marks
  still-pending dues paid where that month's savings cover them. Fines
  already issued this way are not reversed automatically — officials should
  review fines titled "Missed contribution due …" and waive the ones for
  members who had paid.
- **SMS reminders** from the same daily job: on the due date and three days
  later (with the fine date), only to members who still owe, never the same
  message twice a day, within each plan's SMS allowance.

## Share-out recorded (Oct 2026)

- The year-end share-out is now an action, not only a preview: one official
  prepares it (`shareout.prepare`, a draft with every member's line), a
  different one confirms (`shareout.confirm`, maker–checker). Confirming
  re-reads the records (refuses if anything changed), settles each member's
  open loans (oldest due first) and whole unpaid fines from their share,
  records take-home and still-owed per member, and lowers savings by what was
  paid out. Optional *members keep their shares*. Past share-outs are listed;
  the next period starts the day after. New permission `shareout.manage`
  (chair, treasurer; platform owners only in support mode). Migration 0065
  (`share_outs`, `share_out_lines`).

## Security: shared rate limits, sessions, CSP, private KYC (Oct 2026)

- **Shared rate limits** in Postgres (`rate_limits`, `lib/auth/rate-limit.ts`;
  no extra service): sign-in per IP (30 / 15 min) and per account tried
  (10 / 15 min, on top of the existing 5-try lock), registration per IP
  (10 / hour), and the public funeral-fund giving form per IP (20 / 10 min).
- **Sessions**: *Sign out everywhere* on My Profile ends every session of
  the account; a super-admin password reset now signs the person out
  everywhere (a group admin's reset already did); a daily
  `/api/cron/housekeeping` deletes expired sessions and stale rate counters.
- **Content-Security-Policy** on every page: scripts, styles, fonts and
  requests only from the app; no plugins, no framing, no `<base>` or
  form-action hijacking. Inline scripts are still allowed (Next's bootstrap
  needs them without a per-request nonce), so it blocks foreign scripts
  rather than all injection.
- **Private KYC documents** when `BLOB_PRIVATE_READ_WRITE_TOKEN` (a second,
  private Blob store) is set: ID scans, photos and signatures upload there
  and are served by `/api/files/…` only to the uploader, the member, or
  officials (members.view) of a group whose record holds the file.
  `npm run files:move-kyc-private` moves existing ones.

## Merry-go-round: who has paid in (Oct 2026)

- MGR contributions are tagged with the rotation they were paid into
  (`contributions.mgr_rotation_id`, set when recorded; migration 0063 tags
  recent ones to the live rotation).
- Each member's standing — paid in vs. their share (contribution × their
  multiplier) for every cycle so far — shows on the Turns tab (officials see
  everyone, members themselves).
- New group setting **Only pay out to members who are up to date**
  (`groups.mgr_require_up_to_date`, off by default): a turn can't be marked
  paid while its member owes for that cycle or earlier ones; the refusal
  says how much.
- The meeting collection sheet has a Merry-go-round column when MGR is on.

## Group-wallet payouts confirmed (Oct 2026)

- A withdrawal is "sent" when IntaSend accepts it and now moves to **paid**
  or **failed** when IntaSend reports the result: its send-money event
  (`/api/payments/payout-callback`, challenge-verified and logged) or, as a
  backstop, a daily status lookup (`/api/cron/payouts-check`) and a
  *Check now* button. Codes per IntaSend's status reference: `TS100` paid,
  `TF…` failed, a `BF…` batch failed, anything else still in progress.
  Officials are notified either way; a failed payout's money stays in the
  wallet.
- Confirmed from IntaSend's SDK: M-Pesa number payouts use provider
  `MPESA-B2C`.

## Known gaps

Current as of the last update to this file, roughly in order of priority.

**Needs the owner (outside the code)**
- **Wallets and funeral funds are off** (`GROUP_WALLETS_ENABLED`) until
  IntaSend confirms a wallet per group in writing and a Kenyan lawyer
  reviews the platform holding group money (funeral funds especially) —
  including SASRA/CBK applicability, notably for registered boda-boda SACCOs.
- **IntaSend live payments** are blocked on IntaSend finishing the account's
  business/KYC verification in their dashboard.
- **Prices and fees are untested decisions** — the plans and transaction-fee
  percentages in `lib/domain/billing.ts` are directional, not checked against
  IntaSend's merchant rate; whether funeral funds carry a fee is undecided.
- **Partner settings** — `PARTNER_API_TOKENS`, `FAMILY_COMPASS_REFERRAL_URL`
  and `_SECRET` in production; a shared test URL/token for Family Compass.

**Money correctness**
- **Wallet calls are untested against IntaSend's sandbox** (built from the
  SDK and docs, exercised against a stand-in): wallet creation, STK push to a
  wallet, send-money, status lookups and both webhooks.
- **Outbound webhook delivery has no retry queue** — single attempt, logged
  regardless of outcome (`lib/webhooks/dispatch.ts`); subscribers should use
  the API (e.g. `GET /funds/{id}`) as their backstop.
- **M-Pesa C2B needs setup per group** (Daraja app on the group's own
  shortcode, or its provider forwarding notifications). Safaricom masks the
  payer's phone, so matching relies on the account number. Not tested against
  Safaricom's sandbox.
- **MGR platform fee before payout** — the 5% fee is charged after a turn is
  marked paid, not required before. (Paid-in gating is a group setting;
  maker–checker on "mark paid" is built.)

**Security and hygiene**
- **KYC documents stay public until the private store is connected** — set
  `BLOB_PRIVATE_READ_WRITE_TOKEN` (a private Blob store created in Vercel),
  then run `npm run files:move-kyc-private`. Governance documents stay public.
- **CSP allows inline scripts** (Next's bootstrap); a nonce-based policy
  would need per-request middleware.
- **Unique contact indexes may be pending.** Migration 0051 skips any unique
  index whose data still has duplicates; merge them at /super-admin/users,
  then run `npm run db:enforce-unique-contacts`.
- **Scale** — no pagination on large `findMany` calls; connection-pool sizing
  under real load never measured.
- **`groups` has no DELETE policy** — low priority; nothing deletes a group.

**Product**
- **SMS** covers invites, receipts, loan reminders (the agent) and
  contribution-due reminders; there is no phone-based password reset (OTP)
  and no way to buy extra SMS. Reminders can't be switched off per group yet
  (they stay within the plan's SMS allowance).
- **Only some actions are commands.** Contributions, meeting collections,
  fines, loan repayments, payment matching and the wallet run through
  `lib/commands` (audited with inputs, reachable by the agent and API). Loan
  approval/disbursement, MGR, welfare, meetings, settings and member
  management still keep their logic in Server Actions — in support mode those
  are audited at permission level, not with their inputs.
- **Guided setup** — MGR first-time setup and member KYC completion
  (`/dashboard/profile`) lack the wizard treatment.
- **`announcements`** has a schema and RLS policy, no UI.
- **Public API v1 write scope is intentionally minimal** — one write
  (`POST /api/v1/contributions`); more needs explicit confirmation.
- **Governance has no public API or webhook coverage** (a deliberate
  exclusion).
