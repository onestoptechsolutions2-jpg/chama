"use server";

import { revalidatePath } from "next/cache";
import { requireActiveGroup, requirePermission } from "@/lib/auth/session";
import { runCommand } from "@/lib/commands/run";
import { actorFromSession } from "@/lib/commands/actor";
import {
  approveWithdrawal,
  cancelWithdrawal,
  enableWallet,
  promptPayment,
  requestWithdrawal,
  setPayoutDestination,
} from "@/lib/commands/wallet";

type Result = { error: string } | { ok: true; message?: string };
const done = (r: { ok: true } | { ok: false; error: string }, message?: string): Result => (r.ok ? { ok: true, message } : { error: r.error });

export async function enableWalletAction(): Promise<Result> {
  const session = await requirePermission("settings.manage");
  const r = await runCommand(actorFromSession(session), enableWallet, {});
  revalidatePath("/dashboard/payments");
  return done(r, "M-Pesa wallet is on.");
}

/** Treasurer: send M-Pesa prompts to several members at once (e.g. collection day). */
export async function promptMembersAction(memberIds: number[], purpose: string, amount: number): Promise<Result> {
  const session = await requirePermission("money.record");
  const actor = actorFromSession(session);
  let sent = 0;
  const failed: string[] = [];
  for (const memberId of memberIds) {
    const r = await runCommand(actor, promptPayment, { memberId, purpose, amount });
    if (r.ok) sent++;
    else failed.push(r.error);
  }
  revalidatePath("/dashboard/payments");
  if (sent === 0) return { error: failed[0] ?? "Nothing sent" };
  return { ok: true, message: `Sent ${sent} prompt(s).${failed.length ? ` ${failed.length} not sent: ${failed[0]}` : ""}` };
}

/** A member pays for themselves: the prompt goes to their own phone. */
export async function payMyselfAction(purpose: string, amount: number): Promise<Result> {
  const session = await requireActiveGroup();
  if (!session.activeMembership.memberId) return { error: "No member record in this group" };
  const r = await runCommand(actorFromSession(session), promptPayment, { memberId: session.activeMembership.memberId, purpose, amount });
  revalidatePath("/dashboard/statement");
  return done(r, "Check your phone and enter your M-Pesa PIN.");
}

export async function setDestinationAction(destination: unknown): Promise<Result> {
  const session = await requirePermission("money.payoutDestination");
  const r = await runCommand(actorFromSession(session), setPayoutDestination, destination);
  revalidatePath("/dashboard/payments");
  return done(r, "Saved.");
}

export async function requestWithdrawalAction(amount: number, narrative: string): Promise<Result> {
  const session = await requirePermission("money.withdraw");
  const r = await runCommand(actorFromSession(session), requestWithdrawal, { amount, narrative });
  revalidatePath("/dashboard/payments");
  return done(r, "Requested. Another official must approve it.");
}

export async function approveWithdrawalAction(withdrawalId: number): Promise<Result> {
  const session = await requirePermission("money.approveWithdrawal");
  const r = await runCommand(actorFromSession(session), approveWithdrawal, { withdrawalId });
  revalidatePath("/dashboard/payments");
  return done(r, "Approved — the money is on its way to the group's account.");
}

export async function cancelWithdrawalAction(withdrawalId: number): Promise<Result> {
  const session = await requirePermission("money.withdraw");
  const r = await runCommand(actorFromSession(session), cancelWithdrawal, { withdrawalId });
  revalidatePath("/dashboard/payments");
  return done(r, "Cancelled.");
}
