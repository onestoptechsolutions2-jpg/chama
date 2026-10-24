import "server-only";
import { and, eq, inArray, lt } from "drizzle-orm";
import { withPlatformAdmin, withTenant } from "@/lib/db/rls";
import { groupWithdrawals } from "@/lib/db/schema";
import { payoutOutcome, type PayoutOutcome } from "@/lib/domain/group-wallet";
import { getPayoutStatus } from "@/lib/payments/intasend";
import { insertNotification, listActiveStaffUserIds } from "@/lib/db/notifications";

/**
 * A withdrawal is "sent" once IntaSend accepts it; this records what finally
 * happened — "paid" or "failed" — from IntaSend's send-money event (pushed
 * to /api/payments/payout-callback) or, as a backstop, a status lookup.
 * Idempotent: only a "sent" withdrawal moves. A failed payout's money stays
 * in (or returns to) the group wallet; the officials are told either way.
 */
export async function settlePayout(trackingId: string, payload?: Parameters<typeof payoutOutcome>[0]): Promise<PayoutOutcome | null> {
  const w = await withPlatformAdmin((tx) => tx.query.groupWithdrawals.findFirst({ where: eq(groupWithdrawals.trackingId, trackingId) }));
  if (!w) return null;
  if (w.status !== "sent") return w.status === "paid" ? { state: "paid" } : w.status === "failed" ? { state: "failed", reason: w.error ?? "" } : { state: "pending" };
  const outcome = payoutOutcome(payload ?? (await getPayoutStatus(trackingId)));
  if (outcome.state === "pending") return outcome;

  const moved = await withTenant(w.groupId, async (tx) => {
    const [row] = await tx
      .update(groupWithdrawals)
      .set(outcome.state === "paid" ? { status: "paid", updatedAt: new Date() } : { status: "failed", error: outcome.reason.slice(0, 500), updatedAt: new Date() })
      .where(and(eq(groupWithdrawals.id, w.id), eq(groupWithdrawals.status, "sent")))
      .returning({ id: groupWithdrawals.id });
    if (!row) return false;
    const amount = `Ksh ${Math.round(Number(w.amount)).toLocaleString("en-KE")}`;
    const template =
      outcome.state === "paid"
        ? { category: "success" as const, title: "Withdrawal paid", body: `${amount} reached the group's account (${w.narrative}).` }
        : {
            category: "action_required" as const,
            title: "Withdrawal failed",
            body: `${amount} (${w.narrative}) did not go through: ${outcome.reason}. The money is still in the group wallet; check the account and ask again.`,
          };
    for (const userId of await listActiveStaffUserIds(tx, w.groupId, ["admin", "treasurer", "secretary"])) {
      await insertNotification(tx, { groupId: w.groupId, userId, template, link: "/dashboard/payments", sourceType: "group_withdrawal", sourceId: w.id });
    }
    return true;
  });
  return moved ? outcome : null;
}

/** Daily backstop for missed events: re-check payouts still "sent" after 15 minutes. Returns how many settled. */
export async function checkPendingPayouts(): Promise<number> {
  const pending = await withPlatformAdmin((tx) =>
    tx
      .select({ trackingId: groupWithdrawals.trackingId })
      .from(groupWithdrawals)
      .where(and(inArray(groupWithdrawals.status, ["sent"]), lt(groupWithdrawals.updatedAt, new Date(Date.now() - 15 * 60_000)))),
  );
  let settled = 0;
  for (const p of pending) {
    if (!p.trackingId) continue;
    try {
      const r = await settlePayout(p.trackingId);
      if (r && r.state !== "pending") settled++;
    } catch (e) {
      console.error(`[payouts] ${p.trackingId}`, e);
    }
  }
  return settled;
}
