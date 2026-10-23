import "server-only";
import { eq, inArray } from "drizzle-orm";
import { withTenant } from "@/lib/db/rls";
import { members } from "@/lib/db/schema";
import { sendSms } from "@/lib/notify/sms";
import { createStatementToken } from "@/lib/statement-link";
import { buildReceiptSms } from "@/lib/domain/receipts";

type Recorded = { memberId: number; memberName: string; memberPhone: string | null; type: string; amount: number; reference: string | null };

/**
 * One SMS per member after money is recorded for them: what came in, their
 * savings now, and their no-password statement link. Skips members with no
 * phone. Never throws.
 */
export async function sendContributionReceipts(groupId: number, groupName: string, recorded: Recorded[]): Promise<void> {
  const byMember = new Map<number, Recorded[]>();
  for (const r of recorded) byMember.set(r.memberId, [...(byMember.get(r.memberId) ?? []), r]);
  const ids = [...byMember.keys()].filter((id) => byMember.get(id)!.some((r) => r.memberPhone));
  if (ids.length === 0) return;

  const rows = await withTenant(groupId, (tx) =>
    tx.query.members.findMany({ where: ids.length === 1 ? eq(members.id, ids[0]) : inArray(members.id, ids) }),
  );
  const base = process.env.PORTAL_BASE_URL?.replace(/\/$/, "");
  for (const m of rows) {
    if (!m.phone) continue;
    const token = createStatementToken(groupId, m.id);
    const message = buildReceiptSms({
      groupName,
      memberName: m.name,
      items: byMember.get(m.id)!.map((r) => ({ type: r.type, amount: r.amount })),
      reference: byMember.get(m.id)!.find((r) => r.reference)?.reference ?? null,
      savingsTotal: Number(m.capital) + Number(m.security) + Number(m.personalSavings),
      statementUrl: token && base ? `${base}/s/${token}` : null,
    });
    await sendSms(groupId, m.phone, message);
  }
}
