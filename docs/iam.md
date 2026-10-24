# Identity & access (IAM)

Who someone is, what they may do, and how every change is recorded. The
code is the source of truth — `lib/auth/permissions.ts` — and this page
mirrors it. Members see the same matrix in plain words at **Roles & access**
(`/dashboard/access`).

## 1. Identity: one person = one account

- **A phone number is a person.** Phones are stored in one canonical form
  (`254712345678`; `lib/domain/identity.ts`), so `0712 345 678`,
  `+254712345678` and `712345678` are the same account. Emails are stored
  lowercase. Unique indexes on `users(phone)`, `users(lower(email))` and
  `members(group_id, phone)` back this up.
- **One way in.** Every path that creates or finds a person goes through
  `lib/identity/people.ts` (`createUserIfNew`, `findPerson`,
  `linkOrCreateMemberRow`): register, login, Google, invites, staff "add
  member", CSV import, join approval. A person staff added by hand is
  *linked* when they later join — never a second roster row.
- **Google** links to the signed-in account, or to the account with that
  verified email; it never creates a duplicate.
- **Existing duplicates**: `/super-admin/users` lists accounts that share a
  phone or email; an owner merges them (`mergeUsersAction`). The merged-away
  account is deactivated, not deleted, so history still resolves. After a
  clean-up, `npm run db:enforce-unique-contacts` adds any unique index the
  migration had to skip.
- **Nobody sets someone else's password.** Officials join by **invite**
  (phone + role → link by SMS/WhatsApp → they sign up or sign in and join).

## 2. Two kinds of role

| Axis | Stored on | Values | Scope |
|---|---|---|---|
| Group role | `group_memberships.role` | admin (Chair), treasurer, secretary, member | one group — a person can hold a different role in each |
| Platform role | `users.platform_role` | owner, support, agent | the platform (super-admin console, support, agent) |

Products (loans, MGR, welfare, projects) are switched on per group, and a
permission tied to a product only applies when it is on.

**Platform staff never belong to a group.** An account with a platform role
can't create, join, accept an invite to, or be approved into a group, and
any memberships it had before are ignored at sign-in
(`isPlatformStaff`). Granting a platform role to someone who is in a group
is refused, and merging a member account into a staff account is refused.
Staff reach groups only through support mode — so everything they do is
time-boxed, has a reason and is in the group's Activity log. A staff member
who is also a real chama member uses a separate personal account.
`/super-admin/users` lists any staff account still recorded in a group.

## 3. Group permissions

| Permission | Admin | Treasurer | Secretary | Member | Product |
|---|:-:|:-:|:-:|:-:|---|
| `group.view` — home, rules, own money | ✓ | ✓ | ✓ | ✓ | |
| `members.view` — member list and balances | ✓ | ✓ | ✓ | | |
| `members.add` — add, import, invite members | ✓ | ✓ | | | |
| `members.approve` — join requests | ✓ | ✓ | | | |
| `members.manage` — roles, invite officials, remove, reset passwords | ✓ | | | | |
| `money.record` — contributions, meeting collections, match payments | ✓ | ✓ | | | |
| `fines.issue` | ✓ | ✓ | ✓ | | |
| `fines.settle` — mark paid / waive | ✓ | ✓ | | | |
| `meetings.manage` | ✓ | ✓ | ✓ | | |
| `loans.use` — apply, guarantee | ✓ | ✓ | ✓ | ✓ | loans |
| `loans.manage` — approve, disburse, repayments | ✓ | ✓ | | | loans |
| `mgr.use` — choose/claim turns | ✓ | ✓ | ✓ | ✓ | mgr |
| `mgr.manage` — schedule, payouts | ✓ | ✓ | | | mgr |
| `welfare.use` — ask for help, co-sign | ✓ | ✓ | ✓ | ✓ | welfare |
| `welfare.manage` — review claims, fund | ✓ | ✓ | | | welfare |
| `projects.view` | ✓ | ✓ | ✓ | ✓ | projects |
| `projects.manage` | ✓ | ✓ | | | projects |
| `shareout.view` (officials see all, members their own line) | ✓ | ✓ | ✓ | ✓ | loans |
| `governance.manage` — papers, registration pack | ✓ | | ✓ | | |
| `rules.manage` | ✓ | | | | |
| `reports.view` — staff reports, CSV | ✓ | ✓ | ✓ | | |
| `audit.view` — Activity log | ✓ | ✓ | ✓ | | |
| `settings.view` | ✓ | ✓ | ✓ | | |
| `settings.manage` — settings, products, paybill, benefit table, turn on the wallet | ✓ | | | | |
| `money.withdraw` — ask to withdraw from the group wallet | ✓ | ✓ | | | |
| `money.approveWithdrawal` — approve another official's withdrawal | ✓ | ✓ | ✓ | | |
| `money.payoutDestination` — where wallet withdrawals go | ✓ | | | | |
| `billing.view` / `billing.pay` | ✓ | ✓ | | | |
| `billing.invoice`, `platformFees.pay`, `developer.manage` | ✓ | | | | |

**Maker–checker** (`selfDealingError`): nobody creates, approves or records
repayment of their own loan, marks their own merry-go-round payout paid,
waives their own fine, or approves their own welfare claim, or approves a wallet withdrawal
they asked for — another official must.

## 4. Platform permissions

| Permission | Owner | Support | Agent |
|---|:-:|:-:|:-:|
| `platform.console` — super-admin | ✓ | ✓ | |
| `platform.groups.manage` | ✓ | ✓ | |
| `platform.users.manage` — reset passwords | ✓ | ✓ | |
| `platform.roles.grant`, `platform.users.merge` | ✓ | | |
| `support.view` — open a group as a member, read-only | ✓ | ✓ | |
| `support.act` — make changes for them | ✓ | ✓ | |
| `support.money` — loans/MGR/welfare management in support mode | ✓ | | |
| `agent.run` — internal command endpoint | ✓ | | ✓ |

## 5. Enforcement — one call everywhere

- Pages, Server Actions and payment routes call
  `requirePermission("<permission>")` (or `requirePlatformPermission`). It
  redirects to `/login` when signed out and `/dashboard` when not allowed.
- The menu uses the same permission (`lib/nav-config.ts` `permission`), so
  the menu and the page can't disagree.
- Row-level security underneath every query still isolates groups (see
  `architecture.md`), so a bug in a check fails safe.

## 6. Doors and the audit log

Every change made through `lib/commands` runs `runCommand(actor, command,
input)`: permission check → input validation → the rule in the group's
transaction (all-or-nothing) → an **append-only** row in `group_audit_log`
→ webhooks/SMS after commit. The *actor* records the door:

| `via` | Who | How it's authenticated |
|---|---|---|
| `ui` | a signed-in person | session cookie |
| `api` | a group's integration | per-group API key (one write: contributions) |
| `mpesa` | Safaricom C2B | secret per-group URL token |
| `support` | platform staff in support mode | session + support session |
| `agent` | the backend agent | `AGENT_API_TOKEN` + agent account |
| `cron` | scheduled jobs | `CRON_SECRET` |

Officials read it at **Activity** (`/dashboard/activity`).

## 7. Support mode ("act as")

Staff start at the **Support console** (`/super-admin/support`, their home
page): every group with its waiting work — payments to match, join, loan and
welfare requests, overdue loans, unaccepted invites, unfinished setup — and
an **Open** button (reason + view-only or work on it). It opens the group as
its admin, so every function of the group is available, within the rules
below. *Add 30 min* in the banner extends the session (logged). The same
form, plus "see it as a particular member", is on `/super-admin/groups/<id>`.

From either place: a reason (shown to
the group), as the group admin or as one member, view-only or act, for 30
minutes. The group is shown exactly as that member sees it. A red banner is
on every page. The group's admins are notified. In support mode:

- view-only blocks every write;
- never: API keys, paying the platform, member passwords, personal KYC,
  where wallet withdrawals go;
- loans/MGR/welfare management and wallet withdrawals: platform owners only;
- maker–checker applies to the member being acted as;
- every write attempt — allowed or refused — is in the group's Activity log.

## 8. Partners (funeral funds)

A partner (Family Compass) authenticates with its own token
(`PARTNER_API_TOKENS`) and can only create and read **its own** funeral
funds. It never acts inside a group: the committee join by invite with their
own logins and hold the group roles; withdrawals still need two officials;
the payout account can be set by the partner only at creation, before any
money arrives. Platform staff can't be committee members.

## 9. The agent — fixed rules, no AI

The agent is deterministic: a set of playbooks (`lib/domain/agent-playbooks.ts`)
— plain rules that read the group's records and return a plan. The same
records always give the same plan. `lib/agent/run.ts` carries a plan out
through the normal commands as `via: agent`, with the playbook as the
reason, so the permission matrix, maker–checker and audit log apply and it
never moves money out. It runs daily (cron), from the Support console's
**Run agent** (staff with `agent.run`; preview first), or via
`POST /api/internal/agent` (`AGENT_API_TOKEN`), which can trigger playbooks
only — never arbitrary commands. Next steps on Home is the same idea for
people: fixed rules that list what to do.
