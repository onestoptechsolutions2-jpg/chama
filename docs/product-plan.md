# Product plan — lean v1

Decisions so far (Oct 2026):

- **Who:** women's table-banking groups, boda-boda SACCO-style groups,
  welfare/funeral groups and employee welfare schemes.
- **Where the money sits:** the group's own M-Pesa paybill/till, its bank
  account, or both — or (optional, switched off by default) a **group wallet**
  on IntaSend, see §6.
- **Who pays:** groups, through a subscription.

## 1. Positioning

> The simplest way for a group to run its money — cash, M-Pesa and bank in
> one record — and the path to getting registered, banked and financed.

We sit **on top of** wherever the group keeps its money, not instead of
it. Safaricom and the banks give a group an account; we give it the rules,
the records and the trust.

## 2. The market (checked Oct 2026)

| Product | What it is | Price | Gap we fill |
|---|---|---|---|
| **Chamasoft** | Online bookkeeping for chamas: invoices, statements, loans, fines, projects, e-wallet | Free tier; KSh 1,000/month, KSh 10,000/year (600 SMS included) | General-purpose and treasurer-heavy; no segment templates; does not lead groups to registration or a bank |
| **M-Pesa Chama Account** (Safaricom) | A collection account up to KSh 100M; free to the group, members pay the send fee; portal statement | Free to the group | Needs a **registration certificate, KRA PIN and mandate** to open. Collects money but has no loans, MGR, welfare or share-out rules |
| **Bank chama products** (Equity EazzyChama, KCB Mobi Chama, Bank of Africa e-Chama, Standard Bank Chama app) | A group bank account with statements, multi-approval withdrawals, group loans | Bank fees | Locked to one bank; need registration documents; nothing for the group's internal loans, MGR or welfare |

Prices and features above come from public pages and press, some of them
dated (EazzyChama coverage is from 2016–17). Re-check before quoting them.

**What follows from this:**

1. **Don't compete with the money accounts. Connect to them.** The group's
   M-Pesa Chama account, paybill or bank account is where money lands; we
   read the payments and match them to members automatically.
2. **Registration is the bottleneck.** Safaricom and every bank want a
   registration certificate. Many small groups don't have one. Helping them
   produce the constitution, officials list, minutes and member register for
   registration is a real, paid service, and it hands us a customer that
   then needs a bank account.
3. **Beat Chamasoft on simplicity and price, not features.** Each segment
   gets a ready template, so a group is running in 10 minutes, and the
   price for small groups sits below KSh 1,000/month.

## 3. The four segments

| | Women's table banking | Boda-boda SACCO-style | Welfare / funeral | Employee welfare |
|---|---|---|---|---|
| Typical size | 10–30 | 30–300 | 20–200 | 50–2,000 |
| Rhythm | Weekly meeting | **Daily** small payments (KSh 50–200) | Monthly | **Monthly payroll check-off** |
| Money in | Shares + loan repayments + fines | Paybill, account = member no. or plate | Fixed monthly + per-event levy | Payroll deduction file |
| Money out | Loans from the pool; **year-end share-out** | Bike loans/asset finance, accident and welfare support | Benefit payouts by a **benefit table** (member, spouse, parent, child) | Same as welfare, approved by a committee/HR |
| Must-have screen | Meeting-day recorder + share-out calculator | Daily defaulter list + paybill auto-matching | Claim with documents + benefit table | Check-off file import + claims |
| Who runs it | Treasurer + secretary | Chairman + treasurer, often low-tech | Secretary | HR or a staff committee |
| Who pays | The group | The group | The group | **The employer** (per member per month) |

## 4. What exists today vs. what v1 needs

| Need | Today | v1 work |
|---|---|---|
| Members by phone, no duplicates | Email-first; duplicates possible (see `audit-2026-10.md`) | Phone-first identity, invites, merge tool |
| Record cash at a meeting | Per-member dialogs on the Members page | **Meeting-day recorder**: one list, tap amounts, save |
| Capture M-Pesa payments | ❌ Not captured. STK push is only used to bill groups for the platform | **Paybill/till C2B integration** (Safaricom Daraja confirmation URL on the group's own paybill, or via IntaSend); auto-match by account number, then phone; an "unmatched" inbox |
| Capture bank deposits | ❌ | Bank statement CSV import with the same matching |
| Payroll check-off | ❌ | Check-off CSV import (employee no., amount) |
| Internal loans with guarantors | ✅ Built | Keep; block self-approval |
| Merry-go-round | ✅ Built (rich) | Keep; hide advanced options behind "More" |
| Welfare | ✅ Built (tiered reserves, advances, approvals) | Add a simple **benefit table** mode for funeral/employee schemes; keep the advanced mode hidden |
| Year-end share-out | ❌ (`sharesPerMember` is stored but unused) | **Share-out calculator**: interest earned shared in proportion to savings × months, printable |
| Member statements | ✅ In-app | **SMS/WhatsApp receipt after each payment** + statement link with no password |
| Registration pack | Governance documents + KYC exist | Generate constitution, officials list, member register and minutes as PDFs for the Department of Social Development / bank / Safaricom |
| Assistant | Recommendations on Insights | "Next steps" on Home, from rules |
| Support onboarding | Read-only super-admin | "Act as" with audit (see audit, section 5) |
| Projects, developer API, webhooks, governance module, prepaid wallet, insights charts | Built | **Hide for v1.** Keep the code |

## 5. Pricing (to test, in KSh)

| Plan | For | Price | Includes |
|---|---|---|---|
| **Free** | Up to 10 members | 0 | Ledger, meeting recorder, in-app statements |
| **Group** | Up to 50 members | 400/month or 4,000/year | Paybill/bank matching, loans, MGR, welfare, share-out, 200 SMS/month |
| **Large group** | Up to 300 members | 900/month or 9,000/year | Everything + 600 SMS/month |
| **Employer welfare** | Any size | 30/member/month, paid by the employer | Check-off import, claims, HR reports |
| **Registration pack** | One-off | 1,500–3,000 | Documents ready to submit, plus a support call |
| SMS top-ups | Any plan | At cost + margin | — |

Undercuts Chamasoft's KSh 1,000/month for the common 10–50 member group.
Billing already exists (`lib/domain/billing.ts`, subscription invoices via
STK push), so this means simplifying it, not building it.

Later revenue, once there is volume: bank/SACCO referral fees for groups
that graduate, micro-insurance commission through welfare groups. Neither
is in v1.

## 6. Rules we keep

- **Don't hold members' money unless the group chooses the wallet.** By
  default money stays in the group's own paybill or bank account. The
  optional **group wallet** (Oct 2026) changes this: each group gets its own
  wallet under the platform's IntaSend account, members pay it by M-Pesa
  prompt and every payment records itself. Money leaves only to the
  group's own bank/paybill/till, set by its admin, after one official asks
  and a different one approves. It is off until `GROUP_WALLETS_ENABLED=true`
  and must not be switched on before IntaSend approves the use and a lawyer
  confirms the custody model. Saccos that raise share capital through digital platforms
  fall under SASRA's non-deposit-taking regulations (LN 82/2020), and a
  pending 2025 amendment bill tightens licensing. Get a Kenyan lawyer's
  view before launch, especially for boda-boda SACCO-style groups that may
  already be registered co-operatives.
- **A phone number is a person.** One account per phone.
- **Members don't need to log in.** SMS/WhatsApp is the main member
  channel; the app is for officials.
- **Templates over settings.** A group picks a template; settings are
  for changes, not setup.

## 7. Build order (each step shippable)

1. **Quick fixes + phone-first identity + invites** (audit sections 3 and
   8). Without this, nothing else is trustworthy.
2. **Meeting-day recorder + SMS receipt.** The first moment a treasurer
   feels the value.
3. **Segment templates** (four) that set up the pots, rules and menu.
4. **Paybill/till auto-matching**, then bank CSV import, then the
   check-off import.
5. **Share-out calculator** and **welfare benefit table**.
6. **Simple pricing** (the four plans above) on the existing billing code.
7. **Registration pack** PDFs.
8. **Support "act as"** and the **Next steps** assistant.

## 8. Open questions

- Which paybill route: each group registers its own Daraja app (more
  setup, no middleman), or one IntaSend account per group (simpler, but
  IntaSend fees)? Needs a test with one real paybill.
- SMS provider: Africa's Talking is the usual choice in Kenya; WhatsApp
  costs more per message but is free for the member to receive.
- Do boda-boda groups want daily STK prompts, or do they prefer paying
  the paybill themselves?
- Employer welfare: who signs the contract — HR, or the welfare
  committee?
