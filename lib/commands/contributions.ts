import "server-only";
import { z } from "zod";
import { and, eq, sql, inArray, asc } from "drizzle-orm";
import type { Tx } from "@/lib/db/rls";
import { contributions, groups, members, mgrRotations, contributionDues } from "@/lib/db/schema";
import { CONTRIBUTION_BALANCE_FIELD, validateContributionAmount } from "@/lib/domain/contributions";
import { computeContributionAllocation, splitAcrossReserves } from "@/lib/domain/welfare-policy";
import { getOrCreateWelfarePolicy, allocateContributionToWelfareFund } from "@/app/(dashboard)/dashboard/welfare/welfare-data";
import { dispatchWebhookEvent } from "@/lib/webhooks/dispatch";
import { sendContributionReceipts } from "@/lib/notify/receipts";
import { DUE_SAVINGS_TYPES, allocateToDues } from "@/lib/domain/contribution-dues";
import { defineCommand, done, fail, type Actor, type CommandResult } from "./types";

export const CONTRIBUTION_TYPES = ["capital", "security", "personal_savings", "welfare", "mgr", "project", "other"] as const;

export const entrySchema = z.object({
  memberId: z.coerce.number().int().positive(),
  type: z.enum(CONTRIBUTION_TYPES),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  reference: z.string().trim().max(100).optional().transform((v) => v || undefined),
  notes: z.string().trim().max(500).optional().transform((v) => v || undefined),
});

export type RecordedContribution = {
  contributionId: number;
  memberId: number;
  memberName: string;
  memberPhone: string | null;
  type: (typeof CONTRIBUTION_TYPES)[number];
  amount: number;
  reference: string | null;
};

/**
 * Money in for one member: the row, then either their balance column
 * (atomic increment) or, for welfare, the group's welfare fund split by
 * policy. Shared by every door — UI, meeting recorder, API, M-Pesa.
 */
export async function applyContribution(
  tx: Tx,
  actor: Actor,
  group: typeof groups.$inferSelect,
  entry: z.infer<typeof entrySchema>,
): Promise<CommandResult<RecordedContribution>> {
  const member = await tx.query.members.findFirst({
    where: and(eq(members.id, entry.memberId), eq(members.groupId, actor.groupId)),
  });
  if (!member) return fail("Member not found in this group", 404);
  if (!member.active) return fail(`${member.name} has been removed from the group`);

  const amountError = validateContributionAmount(entry.type, entry.amount, Number(group.minPersonalSavingsIncrement));
  if (amountError) return fail(amountError);

  // MGR money counts towards the rotation running now (who has paid in).
  const mgrRotation =
    entry.type === "mgr"
      ? await tx.query.mgrRotations.findFirst({
          where: and(eq(mgrRotations.groupId, actor.groupId), eq(mgrRotations.status, "active")),
          columns: { id: true },
        })
      : undefined;

  const [row] = await tx
    .insert(contributions)
    .values({
      groupId: actor.groupId,
      memberId: member.id,
      amount: String(entry.amount),
      type: entry.type,
      status: "paid",
      reference: entry.reference ?? null,
      notes: entry.notes ?? null,
      recordedBy: actor.userId,
      mgrRotationId: mgrRotation?.id ?? null,
    })
    .returning({ id: contributions.id });

  // Savings pay off the member's open monthly dues, oldest first, so the
  // daily dues job never fines (or reminds) someone who has paid.
  if ((DUE_SAVINGS_TYPES as readonly string[]).includes(entry.type)) {
    const open = await tx
      .select({ id: contributionDues.id, amountDue: contributionDues.amountDue, amountPaid: contributionDues.amountPaid })
      .from(contributionDues)
      .where(and(eq(contributionDues.groupId, actor.groupId), eq(contributionDues.memberId, member.id), inArray(contributionDues.status, ["pending", "overdue"])))
      .orderBy(asc(contributionDues.dueDate))
      .for("update");
    const applied = allocateToDues(
      entry.amount,
      open.map((d) => ({ id: d.id, amountDue: Number(d.amountDue), amountPaid: Number(d.amountPaid) })),
    );
    for (const a of applied) {
      await tx
        .update(contributionDues)
        .set({ amountPaid: String(a.amountPaid), ...(a.paid ? { status: "paid" as const } : {}), updatedAt: new Date() })
        .where(eq(contributionDues.id, a.id));
    }
  }

  if (entry.type === "welfare") {
    const policy = await getOrCreateWelfarePolicy(tx, actor.groupId);
    const routed = computeContributionAllocation({
      method: policy.fundingMethod,
      contributionAmount: entry.amount,
      fixedAmount: policy.fundingFixedAmount ? Number(policy.fundingFixedAmount) : null,
      pct: policy.fundingPct ? Number(policy.fundingPct) : null,
    });
    if (routed > 0) {
      const split = splitAcrossReserves(routed, {
        emergencyPct: Number(policy.emergencyAllocationPct),
        longTermPct: Number(policy.longTermAllocationPct),
        advancePct: Number(policy.advanceAllocationPct),
      });
      await allocateContributionToWelfareFund(tx, actor.groupId, row.id, routed, split);
    }
  } else if (entry.type in CONTRIBUTION_BALANCE_FIELD) {
    const field = CONTRIBUTION_BALANCE_FIELD[entry.type as keyof typeof CONTRIBUTION_BALANCE_FIELD];
    await tx
      .update(members)
      .set({ [field]: sql`${members[field]} + ${entry.amount}`, updatedAt: new Date() })
      .where(eq(members.id, member.id));
  }

  return done({
    contributionId: row.id,
    memberId: member.id,
    memberName: member.name,
    memberPhone: member.phone,
    type: entry.type,
    amount: entry.amount,
    reference: entry.reference ?? null,
  });
}

export async function loadGroup(tx: Tx, groupId: number) {
  return tx.query.groups.findFirst({ where: eq(groups.id, groupId) });
}

export async function announce(actor: Actor, recorded: RecordedContribution[]) {
  for (const c of recorded) {
    void dispatchWebhookEvent(actor.groupId, "contribution.recorded", {
      contributionId: c.contributionId,
      memberId: c.memberId,
      type: c.type,
      amount: c.amount,
    });
  }
  await sendContributionReceipts(actor.groupId, actor.groupName, recorded);
}

export const recordContribution = defineCommand({
  name: "contributions.record",
  description: "Record money a member paid in (capital, security, savings, welfare, MGR, project, other).",
  permission: "money.record",
  input: entrySchema,
  run: async (tx, actor, input) => {
    const group = await loadGroup(tx, actor.groupId);
    if (!group) return fail("Group not found", 404);
    return applyContribution(tx, actor, group, input);
  },
  afterCommit: (actor, _input, data) => announce(actor, [data]),
});

/**
 * A whole meeting's collections in one go — all or nothing, so a typo on
 * row 14 doesn't leave rows 1–13 half-recorded.
 */
export const recordContributionBatch = defineCommand({
  name: "contributions.recordBatch",
  description: "Record several members' payments at once (meeting day).",
  permission: "money.record",
  input: z.object({
    entries: z.array(entrySchema).min(1, "Enter at least one amount").max(500),
  }),
  run: async (tx, actor, input) => {
    const group = await loadGroup(tx, actor.groupId);
    if (!group) return fail("Group not found", 404);
    const recorded: RecordedContribution[] = [];
    for (const entry of input.entries) {
      const one = await applyContribution(tx, actor, group, entry);
      if (!one.ok) return one;
      recorded.push(one.data);
    }
    return done(recorded);
  },
  afterCommit: (actor, _input, data) => announce(actor, data),
});
