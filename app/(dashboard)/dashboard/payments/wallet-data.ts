import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { withTenant } from "@/lib/db/rls";
import { db } from "@/lib/db/client";
import { groups, groupWithdrawals, members, users } from "@/lib/db/schema";
import { getWallet } from "@/lib/payments/intasend";
import type { PayoutDestination } from "@/lib/domain/group-wallet";
import type { WalletWithdrawal } from "@/components/feature/group-wallet-panel";

/** Everything the Payments page's wallet section shows. The balance comes live from IntaSend. */
export async function loadWallet(groupId: number) {
  const { group, withdrawals, roster } = await withTenant(groupId, async (tx) => ({
    group: await tx.query.groups.findFirst({ where: eq(groups.id, groupId), columns: { intasendWalletId: true, payoutDestination: true } }),
    withdrawals: await tx.query.groupWithdrawals.findMany({
      where: eq(groupWithdrawals.groupId, groupId),
      orderBy: [desc(groupWithdrawals.createdAt)],
      limit: 20,
    }),
    roster: await tx
      .select({ id: members.id, name: members.name, memberNumber: members.memberNumber, phone: members.phone })
      .from(members)
      .where(and(eq(members.groupId, groupId), eq(members.active, true)))
      .orderBy(members.name),
  }));
  const ids = [...new Set(withdrawals.flatMap((w) => [w.requestedBy, w.approvedBy]).filter((x): x is number => x !== null))];
  const names = new Map(
    (ids.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids)) : []).map((u) => [u.id, u.name]),
  );
  let balance: number | null = null;
  if (group?.intasendWalletId) {
    try {
      balance = (await getWallet(group.intasendWalletId)).available_balance;
    } catch {
      balance = null;
    }
  }
  return {
    walletId: group?.intasendWalletId ?? null,
    balance,
    destination: (group?.payoutDestination as PayoutDestination | null) ?? null,
    withdrawals: withdrawals.map(
      (w): WalletWithdrawal => ({
        id: w.id,
        amount: Number(w.amount),
        status: w.status,
        narrative: w.narrative,
        requestedById: w.requestedBy,
        requestedBy: w.requestedBy ? names.get(w.requestedBy) ?? null : null,
        approvedBy: w.approvedBy ? names.get(w.approvedBy) ?? null : null,
        createdAt: w.createdAt.toISOString(),
        error: w.error,
      }),
    ),
    roster: roster.map((m) => ({ id: m.id, name: m.name, memberNumber: m.memberNumber, hasPhone: Boolean(m.phone) })),
  };
}
