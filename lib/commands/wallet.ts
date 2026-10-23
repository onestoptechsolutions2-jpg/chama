import "server-only";
import { randomUUID } from "crypto";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { withTenant } from "@/lib/db/rls";
import { groups, groupWithdrawals, incomingPayments, members } from "@/lib/db/schema";
import { can } from "@/lib/auth/permissions";
import { PAYMENT_PURPOSES, type PaymentPurpose } from "@/lib/domain/payment-matching";
import {
  approvalError,
  destinationError,
  requestError,
  toIntasendPayout,
  type PayoutDestination,
} from "@/lib/domain/group-wallet";
import { createGroupWallet, getWallet, groupWalletsEnabled, sendFromWallet, stkPushToWallet } from "@/lib/payments/intasend";
import { announce, loadGroup, type RecordedContribution } from "./contributions";
import { applyToMember } from "./payments";
import { defineCommand, done, fail } from "./types";

const purpose = z.enum(PAYMENT_PURPOSES as [PaymentPurpose, ...PaymentPurpose[]]);

/** Turns on the group's IntaSend wallet (once). */
export const enableWallet = defineCommand({
  name: "wallet.enable",
  description: "Create the group's IntaSend wallet.",
  permission: "settings.manage",
  input: z.object({}),
  run: async (tx, actor) => {
    if (!groupWalletsEnabled()) return fail("Group wallets aren't switched on for this platform");
    const group = await loadGroup(tx, actor.groupId);
    if (!group) return fail("Group not found", 404);
    if (group.intasendWalletId) return done({ walletId: group.intasendWalletId });
    const { wallet_id } = await createGroupWallet(`GROUP-${group.id}`);
    await tx.update(groups).set({ intasendWalletId: wallet_id, updatedAt: new Date() }).where(eq(groups.id, group.id));
    return done({ walletId: wallet_id });
  },
});

/**
 * An M-Pesa prompt on a member's phone, paying into the group wallet. Members
 * prompt themselves; the treasurer can prompt anyone. The pending payment row
 * already names the member and purpose, so when IntaSend confirms it there is
 * nothing to match.
 */
export const promptPayment = defineCommand({
  name: "collections.prompt",
  description: "Send an M-Pesa payment prompt to a member's phone (money goes to the group wallet).",
  permission: "group.view",
  input: z.object({ memberId: z.coerce.number().int().positive(), purpose, amount: z.coerce.number().min(10, "At least Ksh 10") }),
  run: async (tx, actor, input) => {
    if (!groupWalletsEnabled()) return fail("M-Pesa prompts aren't switched on");
    if (input.memberId !== actor.memberId && !can(actor, "money.record")) return fail("You can only pay for yourself", 403);
    if (input.purpose === "loan" && !actor.products.loans) return fail("Loans are switched off for this group");
    const group = await loadGroup(tx, actor.groupId);
    if (!group?.intasendWalletId) return fail("This group's M-Pesa wallet isn't set up yet");
    const member = await tx.query.members.findFirst({ where: and(eq(members.id, input.memberId), eq(members.groupId, actor.groupId)) });
    if (!member?.active) return fail("Member not found", 404);
    if (!member.phone) return fail(`${member.name} has no phone number`);
    const [row] = await tx
      .insert(incomingPayments)
      .values({
        groupId: actor.groupId,
        source: "intasend",
        externalId: `prompt:${randomUUID()}`,
        amount: String(input.amount),
        payerPhone: member.phone,
        payerName: member.name,
        accountRef: `${member.memberNumber ?? member.id} ${input.purpose}`,
        receivedAt: new Date(),
        status: "pending",
        memberId: member.id,
        appliedAs: input.purpose,
        matchedBy: actor.userId,
      })
      .returning({ id: incomingPayments.id });
    return done({ paymentId: row.id, phone: member.phone, walletId: group.intasendWalletId, amount: input.amount, groupName: group.name });
  },
  afterCommit: async (actor, input, data) => {
    let set: Partial<typeof incomingPayments.$inferInsert>;
    try {
      const res = await stkPushToWallet({
        walletId: data.walletId,
        amount: data.amount,
        phoneNumber: data.phone,
        apiRef: `chama-${actor.groupId}-${data.paymentId}`,
        narrative: data.groupName.slice(0, 22),
      });
      set = { externalId: res.invoice.invoice_id };
    } catch (e) {
      set = { status: "failed", raw: { error: e instanceof Error ? e.message : String(e) } };
    }
    await withTenant(actor.groupId, (tx) => tx.update(incomingPayments).set(set).where(eq(incomingPayments.id, data.paymentId)));
  },
});

/** IntaSend says a prompted payment completed or failed (from the webhook). */
export const confirmPrompt = defineCommand({
  name: "collections.confirm",
  description: "Record a prompted M-Pesa payment that IntaSend confirmed.",
  permission: "money.record",
  input: z.object({ paymentId: z.coerce.number().int().positive(), state: z.enum(["COMPLETE", "FAILED"]) }),
  run: async (tx, actor, input) => {
    const [p] = await tx
      .select()
      .from(incomingPayments)
      .where(and(eq(incomingPayments.id, input.paymentId), eq(incomingPayments.groupId, actor.groupId)))
      .for("update");
    if (!p || p.source !== "intasend") return fail("Payment not found", 404);
    if (p.status !== "pending") return done({ receipts: [] as RecordedContribution[] }); // IntaSend resends; once is enough
    if (input.state === "FAILED") {
      await tx.update(incomingPayments).set({ status: "failed" }).where(eq(incomingPayments.id, p.id));
      return done({ receipts: [] as RecordedContribution[] });
    }
    const group = await loadGroup(tx, actor.groupId);
    if (!group || !p.memberId || !p.appliedAs) return fail("Payment is missing its member");
    const applied = await applyToMember(tx, actor, group, p.memberId, p.appliedAs as PaymentPurpose, Number(p.amount), p.externalId);
    if (!applied.ok) {
      // Money arrived but can't be applied (e.g. loan already cleared): leave it for the treasurer.
      await tx.update(incomingPayments).set({ status: "unmatched" }).where(eq(incomingPayments.id, p.id));
      return done({ receipts: [] as RecordedContribution[] });
    }
    await tx
      .update(incomingPayments)
      .set({
        status: "matched",
        contributionId: applied.data.kind === "contribution" ? applied.data.contribution.contributionId : null,
        loanId: applied.data.kind === "loan" ? applied.data.loanId : null,
      })
      .where(eq(incomingPayments.id, p.id));
    return done({ receipts: applied.data.kind === "contribution" ? [applied.data.contribution] : [] });
  },
  afterCommit: (actor, _input, data) => announce(actor, data.receipts),
});

const destinationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("bank"), bankCode: z.string().trim(), account: z.string().trim(), name: z.string().trim() }),
  z.object({ kind: z.literal("paybill"), paybill: z.string().trim(), accountRef: z.string().trim(), name: z.string().trim() }),
  z.object({ kind: z.literal("till"), till: z.string().trim(), name: z.string().trim() }),
]);

/** The group's own account — the only place wallet money can be sent. Admin only; never support. */
export const setPayoutDestination = defineCommand({
  name: "wallet.setDestination",
  description: "Set the group's own bank account, paybill or till for withdrawals.",
  permission: "money.payoutDestination",
  input: destinationSchema,
  run: async (tx, actor, input) => {
    const err = destinationError(input);
    if (err) return fail(err);
    const open = await tx.query.groupWithdrawals.findFirst({
      where: and(eq(groupWithdrawals.groupId, actor.groupId), inArray(groupWithdrawals.status, ["requested", "approved"])),
    });
    if (open) return fail("Finish or cancel the withdrawal in progress before changing where money goes");
    await tx.update(groups).set({ payoutDestination: input, updatedAt: new Date() }).where(eq(groups.id, actor.groupId));
    return done({ destination: input });
  },
});

async function walletBalance(walletId: string | null): Promise<number> {
  if (!walletId) return 0;
  return (await getWallet(walletId)).available_balance;
}

export const requestWithdrawal = defineCommand({
  name: "wallet.requestWithdrawal",
  description: "Ask to move money from the group wallet to the group's own account (another official approves).",
  permission: "money.withdraw",
  movesMoney: true,
  input: z.object({ amount: z.coerce.number().positive(), narrative: z.string().trim().max(60).optional() }),
  run: async (tx, actor, input) => {
    if (!groupWalletsEnabled()) return fail("Group wallets aren't switched on");
    const group = await loadGroup(tx, actor.groupId);
    if (!group?.intasendWalletId) return fail("This group has no wallet");
    const destination = (group.payoutDestination as PayoutDestination | null) ?? null;
    const err = requestError(input.amount, await walletBalance(group.intasendWalletId), destination);
    if (err) return fail(err);
    const [w] = await tx
      .insert(groupWithdrawals)
      .values({
        groupId: actor.groupId,
        amount: String(input.amount),
        destination: destination!,
        narrative: input.narrative || `${group.name} withdrawal`,
        requestedBy: actor.userId,
      })
      .returning({ id: groupWithdrawals.id });
    return done({ withdrawalId: w.id });
  },
});

export const approveWithdrawal = defineCommand({
  name: "wallet.approveWithdrawal",
  description: "Approve another official's withdrawal; IntaSend then pays the group's own account.",
  permission: "money.approveWithdrawal",
  movesMoney: true,
  input: z.object({ withdrawalId: z.coerce.number().int().positive() }),
  run: async (tx, actor, input) => {
    const [w] = await tx
      .select()
      .from(groupWithdrawals)
      .where(and(eq(groupWithdrawals.id, input.withdrawalId), eq(groupWithdrawals.groupId, actor.groupId)))
      .for("update");
    if (!w) return fail("Withdrawal not found", 404);
    const group = await loadGroup(tx, actor.groupId);
    if (!group?.intasendWalletId) return fail("This group has no wallet");
    const err = approvalError({ status: w.status, requestedBy: w.requestedBy, amount: Number(w.amount) }, actor.userId, await walletBalance(group.intasendWalletId));
    if (err) return fail(err, 403);
    await tx.update(groupWithdrawals).set({ status: "approved", approvedBy: actor.userId, updatedAt: new Date() }).where(eq(groupWithdrawals.id, w.id));
    return done({ withdrawalId: w.id, walletId: group.intasendWalletId, amount: Number(w.amount), destination: w.destination as PayoutDestination, narrative: w.narrative });
  },
  afterCommit: async (actor, _input, data) => {
    const payout = toIntasendPayout(data.destination, data.amount, data.narrative);
    let set: Partial<typeof groupWithdrawals.$inferInsert>;
    try {
      const res = await sendFromWallet({ walletId: data.walletId, provider: payout.provider, transaction: payout.transaction });
      set = { status: "sent", trackingId: res.tracking_id };
    } catch (e) {
      set = { status: "failed", error: e instanceof Error ? e.message.slice(0, 500) : String(e) };
    }
    await withTenant(actor.groupId, (tx) =>
      tx.update(groupWithdrawals).set({ ...set, updatedAt: new Date() }).where(eq(groupWithdrawals.id, data.withdrawalId)),
    );
  },
});

export const cancelWithdrawal = defineCommand({
  name: "wallet.cancelWithdrawal",
  description: "Cancel a withdrawal that hasn't been approved.",
  permission: "money.withdraw",
  input: z.object({ withdrawalId: z.coerce.number().int().positive() }),
  run: async (tx, actor, input) => {
    const updated = await tx
      .update(groupWithdrawals)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(and(eq(groupWithdrawals.id, input.withdrawalId), eq(groupWithdrawals.groupId, actor.groupId), eq(groupWithdrawals.status, "requested")))
      .returning({ id: groupWithdrawals.id });
    return updated.length ? done({ withdrawalId: input.withdrawalId }) : fail("Only a withdrawal waiting for approval can be cancelled");
  },
});
