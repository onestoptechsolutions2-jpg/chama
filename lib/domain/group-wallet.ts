/**
 * Group wallets on IntaSend (an aggregator / licensed payment provider): each
 * group gets its own wallet under the platform's IntaSend account. Members
 * pay into it by M-Pesa prompt, and every payment arrives already tagged with
 * the member and its purpose — so it is recorded with no matching at all.
 *
 * Money leaves a group wallet only one way: to the group's OWN bank account,
 * paybill or till (its payout destination, set by the group's admin), after
 * one official requests and a DIFFERENT official approves. These are the pure
 * rules; lib/commands/wallet.ts applies them.
 */
export type PayoutDestination =
  | { kind: "bank"; bankCode: string; account: string; name: string }
  | { kind: "paybill"; paybill: string; accountRef: string; name: string }
  | { kind: "till"; till: string; name: string };

export function destinationError(d: PayoutDestination): string | null {
  if (!d.name.trim()) return "Enter the account name";
  if (d.kind === "bank") {
    if (!/^\d{1,4}$/.test(d.bankCode)) return "Choose the bank";
    if (!/^\d{6,20}$/.test(d.account)) return "Enter the bank account number (digits only)";
  } else if (d.kind === "paybill") {
    if (!/^\d{5,7}$/.test(d.paybill)) return "A paybill number is 5–7 digits";
    if (!d.accountRef.trim()) return "Enter the paybill account number";
  } else if (!/^\d{5,7}$/.test(d.till)) return "A till number is 5–7 digits";
  return null;
}

export function describeDestination(d: PayoutDestination): string {
  if (d.kind === "bank") return `Bank (code ${d.bankCode}) account ${d.account} — ${d.name}`;
  if (d.kind === "paybill") return `Paybill ${d.paybill}, account ${d.accountRef} — ${d.name}`;
  return `Till ${d.till} — ${d.name}`;
}

/** IntaSend send-money request for one payout (PESALINK for banks, MPESA-B2B for paybill/till). */
export function toIntasendPayout(d: PayoutDestination, amount: number, narrative: string) {
  const base = { name: d.name, amount: Math.round(amount * 100) / 100, narrative: narrative.slice(0, 22) };
  if (d.kind === "bank") return { provider: "PESALINK", transaction: { ...base, account: d.account, bank_code: d.bankCode } };
  if (d.kind === "paybill") {
    return { provider: "MPESA-B2B", transaction: { ...base, account: d.paybill, account_type: "PayBill", account_reference: d.accountRef } };
  }
  return { provider: "MPESA-B2B", transaction: { ...base, account: d.till, account_type: "TillNumber" } };
}

export const MIN_WITHDRAWAL = 100; // IntaSend's minimum bank payout

export type WithdrawalLike = { status: string; requestedBy: number | null; amount: number };

/** Maker–checker for money leaving the group. */
export function approvalError(w: WithdrawalLike, approverUserId: number | null, availableBalance: number): string | null {
  if (w.status !== "requested") return "This withdrawal is not waiting for approval";
  if (approverUserId === null) return "A person must approve withdrawals";
  if (w.requestedBy === approverUserId) return "Another official must approve a withdrawal you requested";
  if (w.amount > availableBalance) return `The wallet has only Ksh ${Math.floor(availableBalance).toLocaleString("en-KE")} available`;
  return null;
}

export function requestError(amount: number, availableBalance: number, destination: PayoutDestination | null): string | null {
  if (!destination) return "The admin must set where withdrawals go (the group's bank account or paybill) first";
  if (amount < MIN_WITHDRAWAL) return `The smallest withdrawal is Ksh ${MIN_WITHDRAWAL}`;
  if (amount > availableBalance) return `The wallet has only Ksh ${Math.floor(availableBalance).toLocaleString("en-KE")} available`;
  return null;
}
