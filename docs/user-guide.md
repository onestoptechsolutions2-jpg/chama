# User guide

What Chama Platform does, written for the people who actually use it — a
group's members and staff (admin/treasurer/secretary), not developers. The
app also has a role-aware in-app version of this at **Guide** in the
sidebar, which only ever shows the sections your own role and group
actually unlock — this document covers everything, across every role and
group type, in one place.

## Getting started

**If you're joining an existing group**: go to **Discover** (`/discover`)
to browse public groups — filter by name/type, open one to see its
description and meeting schedule. If it's accepting requests, hit **Request
to join** — you'll need an account first (the page walks you straight into
registration and back to the join form). Your request sits **pending**
until a group admin or treasurer approves it; you'll see a notification
when they do (or don't).

**If you're starting a new group**: register, then from your (empty)
dashboard choose **Create your group**. You become the group's admin
immediately, but the group starts **private** and stays that way — invisible
on Discover and unable to approve new join requests — until it has a
Treasurer and a Secretary assigned in addition to you, its founding admin.
Add members (Members page → Add member) and assign roles there to clear
that requirement.

**Belonging to more than one group**: your **Profile** page (`/dashboard/profile`)
lists every group you're an active member of, which one is currently
active, and lets you switch with one click — the same switcher is always
available from the sidebar too. Your KYC details (ID, photo, phone) are
filled in once and reused automatically everywhere else you're a member.

## Home (Dashboard)

Your group's current numbers at a glance: member count, capital, security,
personal savings, and (if welfare is on) the welfare fund total. Staff also
see a registration-incomplete banner if officials are still missing, and
the group's top 1-2 open recommendations (see **Insights** below) so
anything that needs attention shows up here without a separate trip.

## Insights

What's coming up and what's worth a closer look, computed live from the
group's own records — not a static report.

- **Next MGR payout** (if MGR is on) — who's due to receive it, when, and
  whether the rotation is running on the schedule the group configured
  (a slower- or faster-than-usual pace gets flagged).
- **Recommendations** — plain-language nudges: a group whose registration
  is incomplete, capital that's drifted from its configured target, loans
  outstanding that exceed the capital pool, welfare reserves running low,
  members worth a check-in.
- **Group performance** (staff only) — contributions by month, top member
  balances, loan and fine exposure by status, with a CSV export for
  reconciliation.
- **Members worth a check-in** (staff only) — anyone with pending fines,
  overdue dues, an overdue loan, or recent meeting absences, each reason
  labeled plainly.

## Members (staff)

The roster and each member's financial profile — capital, security,
personal savings, fines. Admins and treasurers can add members directly
(they don't need a login to exist in the roster — a financial profile can
be created for someone and a login added for them later), record
contributions, and change a member's role (subject to always keeping at
least one active admin in the group). A member's role here is what
`registrationComplete` and every permission check actually reads — not
anything on their personal account.

## Pending members (admin/treasurer)

Join requests from people who found the group via Discover. Approving one
activates the membership and creates their financial-profile row
automatically (pre-filled from KYC they've already completed in another
group, if any); rejecting just declines the request — they can re-request
later with a fresh message. Blocked entirely until the group's own
registration is complete (see **Getting started** above).

## Fines

Every fine issued to a member — lateness, absence, rule violations, loan
defaults — and whether it's been paid. Meetings auto-generate attendance
fines; this is where staff record manual ones and mark any of them paid.

## Meetings

Schedule meetings and record attendance. Marking someone absent or late
automatically creates the matching fine at the amount the group has
configured in Settings — no separate trip to Fines needed.

## Loans

**As a member**: apply for a loan up to your current limit (shown on the
page — a multiple of your total savings, configurable per group), track
your active loan's balance and due date, or cancel a pending application
before staff review it. If the group requires guarantors, pick them on
your application — each named guarantor gets a request they have to
explicitly accept before your application can be approved; you can also
see who's asked you to guarantee *their* loan and respond there.

**As staff (admin/treasurer)**: approve or reject applications, disburse
and track active loans directly, record repayments. A member's loan limit
is enforced automatically on both paths — staff can't approve past it
either. The approve dialog shows accepted-vs-required guarantor count and
won't let you confirm until the group's minimum is met.

## Merry-Go-Round (MGR)

The rotating-payout schedule — everyone contributes each cycle, one member
(or several, depending on config) receives the pooled amount. You'll be
asked to sign a one-time legal agreement before you can claim a slot in
the active cycle. Members claim open slots themselves, or staff can
auto-assign/reassign. Staff mark a slot **paid** once the actual payout has
happened outside the app (MGR payouts are cash/M-Pesa handed directly
between members, never routed through the platform) — that action is
permanently logged against the staff member's account and can't be edited
or deleted later, specifically so payouts stay accountable even though the
money itself moves outside the app's view.

## Welfare

Submit and review welfare requests (medical, bereavement, emergency, and
similar categories your group's policy defines) against the group's
welfare fund. The fund is split into three reserves — **emergency**,
**long-term**, and **advance** — each fed by contributions according to the
group's configured funding rule. Larger requests need more staff to sign
off: small ones are a single staff decision, mid-size ones need two
officials, and the largest need all three — the exact thresholds are set
per group. You can also request a **welfare advance** — a short-term draw
against the fund with its own fee, similar in shape to a loan.

## Projects

Table-banking style projects the group is funding together — track each
project's target vs. collected amount and who's contributed.

## Capital Position

How the group's pooled capital is currently allocated — how much is out on
loan versus sitting in reserve, plus the security, personal savings,
welfare, and projects funds tracked alongside it (shown for visibility,
not folded into the loan-deployment math — security is a collateral
deposit and personal savings is individually-owned money the group merely
holds, neither is meant to be lent out). **Visible to every member, not
just staff** — the point is being able to see the group's money is being
used sensibly without having to ask. Admins can set a target
loan-deployment percentage in Settings to get drift alerts here if actual
deployment strays too far from it.

## Statement

One merged timeline of your own contributions, fines, and loan activity —
the closest thing to a bank statement for your standing in the group.

## Rules

The group's bylaws, each optionally tied to a penalty amount that gets
referenced when a fine is issued. Staff can browse a library of common,
Kenyan-chama-standard starter rules and add one as-is or amend it before
saving — only offered for categories the group's active vehicles actually
use (a welfare-category template isn't offered to a group with welfare
switched off). You'll see the date you accepted the group's rules on this
page — accepted automatically the moment your membership went active, not
a separate step you have to complete.

## Wallet (admin/treasurer)

A prepaid balance for the platform's own fees **only** — never member
savings, contributions, or loan funds, which are tracked separately and
reconciled via M-Pesa directly. Top it up once and platform fees (the MGR
payout fee, a loan's disbursement fee, a subscription invoice) get
deducted instantly with no phone prompt each time, instead of triggering a
fresh M-Pesa push per event.

## Billing (admin/treasurer)

What the group owes the platform — computed live from member count, which
vehicles (Table Banking, Welfare, Investment) are active, and real
financial activity over the last 12 months, not a flat fee. Generate this
period's invoice and charge it, either instantly from the prepaid Wallet
or via a fresh M-Pesa prompt.

## Settings (admin)

The group's configurable business rules, organized into tabs:

- **General** — name, description, meeting day/time/venue.
- **Contributions** — share price, shares per member, which day of the
  month contributions are due, the minimum personal-savings top-up amount.
- **Fines** — lateness, absence, and rule-violation amounts.
- **Loans** — interest rate, loan-limit multiplier, repayment period, late
  penalty, how many guarantors are required (0 opts out entirely), the
  minimum loan amount, and how many loans a member may guarantee at once.
- **Products** — turn Loans/MGR/Welfare/Projects on or off. Turning one off
  only hides it — the underlying data isn't touched, so re-enabling later
  restores full history. Activating a vehicle for the first time walks
  through a short setup wizard (configure its terms if relevant, pick
  starter rules) instead of just flipping a switch.
- **Capital policy** — an optional target loan-deployment percentage, for
  the drift alerts on Capital Position.

## My Profile

Your own KYC details — ID type/number, ID document, photo, phone, and (for
admins/treasurers/secretaries specifically) address and signature. Filled
in once, it's reused automatically for every other group you belong to,
not re-collected each time you join somewhere new.

## Notifications

A bell icon (sidebar on desktop, header on mobile) with an unread count.
You're notified when: someone requests to join your group (staff), your
own join request is approved or declined, a new loan application comes in
(staff), your loan application is approved or rejected, someone asks you
to guarantee their loan, and a guarantor you asked responds. Click a
notification to jump to the relevant page and mark it read, or **Mark all
read** to clear the list.

## Super-admin (platform team only)

A separate console at `/super-admin`, gated by a platform-wide role
independent of any group membership — for people operating the platform
itself, not a group's own staff.

- **Groups** — every tenant on the platform, with onboarding stage,
  account tier, subscription/payment status. Click into a group's name for
  its full profile: contact details, officials checklist, capital
  position, the same performance charts members see on their own Insights
  page, recent invoices, and a timeline of account activity. Create new
  groups here too, with the same guided setup a self-service founder gets.
- **Users** — manage who else has platform-level access.
- **Stats** — cross-tenant totals and recent automated-enforcement (cron)
  activity.
- **Integrations** — whether IntaSend, Vercel Cron, file storage, and the
  portal URL are configured, plus a log of recent inbound payment webhook
  events — useful for tracing a payment that didn't seem to register.
