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

**If someone invited you**: open the link from your SMS or WhatsApp. Create
your account with the same phone number (or sign in if you already have
one) and tap **Join the group**. If you sign up first, the invite waits for
you on your Home page.

**If you're starting a new group**: register with your phone number, then
choose **Start a group** and pick what kind of group you are — **women's
table banking**, **boda-boda group**, **welfare / funeral group**,
**employee welfare**, or **something else**. That sets up the right money
rules and a starter rule book; you can change anything later in Settings.
You become the group's Chair (admin). The group stays **private** and can't
approve join requests until it also has a Treasurer and a Secretary:
**invite** them from Members → Add Member (type their phone and pick the
role). **Next steps** on your Home page walks you through the rest.

**Your phone number is your account.** One phone, one account — "0712…" and
"+254712…" are the same number. You never need a second account for a
second group.

**Signing in**: use your email or phone and password — or, if your group's
platform has it switched on, **Continue with Google**. After 5 wrong
passwords sign-in pauses for 15 minutes. If you forget your password, ask
your group admin: on the Members page they can set you a new one (Members →
your name → More details → *Forgot password*) and tell you in person. You
are signed out on every phone when they do.

**On a phone**: a bar at the bottom of the screen always shows your main
places (Home and the three most useful for your role) plus **Menu**, which
opens the full list. The menu is grouped under Main, Money, Group and
Account.

**Belonging to more than one group**: your **Profile** page (`/dashboard/profile`)
lists every group you're an active member of, which one is currently
active, and lets you switch with one click — the same switcher is always
available from the sidebar too. Your KYC details (ID, photo, phone) are
filled in once and reused automatically everywhere else you're a member.

## Home (Dashboard)

**Next steps** at the top lists what needs doing, for you, right now — a new
group's setup (invite officials, add members, connect M-Pesa, write rules,
first collection), work waiting for officials (payments to match, join or
loan requests, overdue loans), and your own reminders (a loan due, someone
asking you to guarantee, a Mzunguko turn to choose, fines, finishing your
profile). Each item has a button that takes you to the right page. It
follows fixed rules — the same records always give the same list.

A few big buttons for the everyday jobs (staff: Add Money, Meetings, Loans,
Fines; members: My Money, Ask for Loan, Get Help, Mzunguko), one line with
the member count and the total saved together, the oldest unpaid fines, and
the next meeting. Staff also see a banner if the group still needs a
Treasurer and a Secretary. Recommendations and charts live under
**Advice & Reports** (see **Insights** below).

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
personal savings, fines — with each member's **member number** (the account
they type when paying by M-Pesa). **Add Member** takes a name, phone and
role: tick *Invite them to log in* (or choose an office) and they get a link
by SMS/WhatsApp to join with their own account — you never set their
password. Members who will never log in can still be added without an
invite; they get SMS receipts. Treasurers can invite members; only the
admin can invite officials or change roles (there is always at least one
admin). A rows without a login has a **Send invite** button. Pending
invites are listed under *Waiting to join*. Adding the same phone twice is
refused, and a CSV import skips people already on the list.

Admins also have, under **More details** on each member:

- **Forgot password** — set a new password and tell the member in person.
  It cannot be used on admins, on yourself, or on someone who belongs to
  another group too (they must reset their own).
- **Remove from group** — they can no longer open this group; their savings
  history stays; any Mzunguko turn they hadn't been paid for becomes open
  again. Refused while they still have a loan to repay, and for admins
  (change their role first) or yourself.

Removed people appear under **Removed members** at the bottom of the page,
each with a **Bring back** button that restores their login and their place
in the Mzunguko queue (turns that were freed stay open).

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

## Merry-Go-Round (MGR) — Mzunguko

The rotating-payout schedule — everyone contributes each cycle, one member
(or several, depending on config) receives the pooled amount. You'll be
asked to sign a one-time agreement before you can claim a turn in the
active cycle. Staff mark a turn **paid** once the money has actually moved
outside the app (MGR payouts are cash/M-Pesa between members, never routed
through the platform) — that is permanently logged and a paid turn can no
longer be reassigned or un-paid, so payouts stay accountable.

**Every member**

- The top of the Schedule tab shows progress: *Cycle 3 of 12 · 7 of 10
  turns paid*.
- On the **Turns** tab, *Which turn would you like?* lets you pick up to
  three cycles, best first. Choices are honoured fairly when turns are
  given out, and you can change them until the group's deadline (if one is
  set). You can also claim an open turn yourself.
- You get a notification the day before a cycle (contribution due) and the
  day before your own turn.

**Admin and treasurer** (Admin tab)

1. **Cycle configuration** — frequency, recipients per cycle, start date,
   *Members can choose turns until*, contribution per cycle. Dates are
   counted from the start date and a 31st-of-the-month start lands on the
   last day of shorter months.
2. **Generate / rebuild schedule** — builds cycles from each member's turn
   count. Turns already claimed or paid are kept; only open ones are
   redrawn. Run it again after members join.
3. **Fill open slots** — three ways: *by members' choices* (everyone's
   first choice before anyone's second; clashes settled by random order;
   nobody gets more turns than they have; the rest drawn at random),
   *by random draw*, or *in order*. Every assignment is written to the
   activity log with how it was decided.
4. **Reshuffle turns not yet paid** — redraws only the turns the system
   handed out. Turns members chose, and anything paid, never move.
5. **Cycles close themselves** once every turn in the active cycle is paid
   or skipped, and the next cycle opens (officials are notified). A cycle
   can't be closed by hand while any turn is still owed.
6. **When the whole rotation is done** — *Archive finished rotation* moves
   it under **Past rotations**, or *Start new rotation (random order /
   same order)* archives it, builds a fresh schedule and fills it in one
   step. Archived turns no longer count against anyone's allowance.

A member who is removed from the group drops out of the draw and their
unpaid turns become open again.

## Record Money (admin/treasurer)

Meeting day on one screen: a line per member with **Shares**, **Savings**,
**Welfare** and **Loan** (for members with a loan). *Fill usual amounts*
puts in the share price and welfare amount for everyone; change what's
different and tap **Save all**. Everything is saved together — if one line
is wrong, nothing is saved, so you can fix it. Every member with a phone
gets an SMS receipt with their new savings and a link to their statement.
You can't enter a repayment on your own loan — another official does.

## Payments (admin/treasurer)

Members pay the group's **own** M-Pesa paybill or till, typing their member
number as the account — `12` for shares, or `12 welfare`, `12 loan`,
`12 savings`. Those payments are recorded and receipted automatically. Ones
we can't tell (wrong account number) wait under **Needs matching**: pick the
member and what it's for. **Not ours** sets a payment aside. You can also
import a **bank statement** or a **payroll check-off** file (CSV); uploading
the same file twice is safe. The admin sets the paybill number and gets the
two links to register with Safaricom under *M-Pesa setup*.

## Share-out (when loans are on)

The year-end share-out: each member's savings plus their share of what the
group earned (loan interest, fines paid, other income you type in, less
expenses), less any loan or fines they still owe. Share by **savings × time
saved** (money saved in January earns more than money saved in November) or
by savings at the end. Officials see everyone; members see their own line.
It's a preview from the records — print it for the meeting, pay outside the
app.

## Activity (officials)

Every recorded change — payments, fines, repayments, matching — with who did
it and how: in the app, by M-Pesa, through the API, or by platform support
on your behalf (with their reason). It can't be edited or deleted.

## Roles & access

What each role can do in your group, in plain words, and who holds each
office. Nobody approves, pays out, waives or repays money for themselves —
another official must.

## Welfare

Submit and review welfare requests — medical, bereavement, emergency,
education, maternity, disability, benevolence, wedding, calamity, or other
— against the group's welfare fund. The fund is split into three reserves
— **emergency**, **long-term**, and **advance** — each fed by
contributions according to the group's configured funding rule. Larger
requests need more staff to sign off: small ones are a single staff
decision, mid-size ones need two officials, and the largest need all three
— the exact thresholds, reserve split, and per-request caps are all set
per group at Settings → Welfare. You can also request a **welfare
advance** — a short-term draw against the fund with its own fee, similar
in shape to a loan.

**Benefit table**: funeral and employee-welfare groups usually pay fixed
amounts — "member dies: Ksh 50,000; spouse: 30,000…". The admin sets this
table on the Welfare page; members then pick *what happened* and the amount
is fixed by the table. Funeral and employee-welfare groups start with a
ready table to edit.

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
the closest thing to a bank statement for your standing in the group. It also shows how to pay by M-Pesa (paybill and your
account number). Members who don't log in get the same statement from the
link in their SMS receipt — no password, only their own record, valid for
90 days.

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

Your plan, by active members: **Free** up to 10 members; **Group** up to 50
(Ksh 400 a month, or 4,000 a year); **Large group** up to 300 (Ksh 900 a
month, or 9,000 a year); **Employee welfare** Ksh 30 per member per month,
paid by the employer. Every plan has every feature, with a monthly SMS
allowance. Generate this period's invoice and pay it from the prepaid Wallet
or by M-Pesa.

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
- **Welfare** — only shown once Welfare is active. Funding method, how the
  fund splits across its three reserves, per-request caps, and the
  approval-tier thresholds — a guided "Edit policy" wizard walks through
  all of it. Changing these doesn't alter requests already submitted.
- **Capital policy** — an optional target loan-deployment percentage, for
  the drift alerts on Capital Position.

## Governance (admin/secretary)

**Registration pack** (button at the top): your constitution — written from
your own settings and rules — the officials list, the member register and
resolution minutes naming the account signatories, ready to print and sign
or save as PDF, for registration, a bank account or an M-Pesa Chama account.

Basic administrative housekeeping, not tied to any financial product —
available to every group regardless of which vehicles are active.

- **Documents** — upload the group's constitution, bank details,
  registration certificate, meeting minutes, or anything else worth
  keeping on record, each tagged with a category.
- **Compliance obligations** — track dates like an AGM or annual returns
  filing. Optionally set a recurrence (e.g. every 12 months) — marking one
  complete automatically creates the next occurrence. Officials get a
  notification as a due date approaches and again if it's missed.

## Developer (admin)

Only needed if you're connecting an outside system — an accounting tool, a
custom dashboard, an SMS gateway — to this group's data. Skip this section
otherwise.

- **API keys** — generate a bearer token your integration sends as
  `Authorization: Bearer <key>` on every request. Shown once at creation;
  copy it immediately, since it can't be viewed again (revoke and generate
  a new one if it's lost). Revoking is immediate and permanent.
- **Webhook endpoints** — subscribe a URL your system controls to specific
  events (a contribution being recorded, a loan being approved, a new
  member joining, and more). A signing secret is shown once at creation so
  your endpoint can verify each delivery really came from here. Pause or
  delete an endpoint any time; the last 20 delivery attempts (success/fail,
  response code) are visible on the same page.

Full request/response shapes, all available events, and the signature
verification recipe are in `docs/api.md`.

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
to guarantee their loan, a guarantor you asked responds, and (admin/
secretary) a compliance obligation is coming up or overdue. Click a
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
