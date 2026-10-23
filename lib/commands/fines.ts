import "server-only";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { fines, members } from "@/lib/db/schema";
import { createFineSchema } from "@/lib/validation/fines";
import { selfDealingError } from "@/lib/auth/permissions";
import { defineCommand, done, fail } from "./types";

export const issueFine = defineCommand({
  name: "fines.issue",
  description: "Fine a member (lateness, absence, rule breach, other).",
  permission: "fines.issue",
  input: createFineSchema,
  run: async (tx, actor, input) => {
    const member = await tx.query.members.findFirst({
      where: and(eq(members.id, input.memberId), eq(members.groupId, actor.groupId)),
    });
    if (!member) return fail("Member not found in this group", 404);
    const [fine] = await tx
      .insert(fines)
      .values({
        groupId: actor.groupId,
        memberId: member.id,
        type: input.type,
        amount: String(input.amount),
        reason: input.reason || null,
        recordedBy: actor.userId,
      })
      .returning({ id: fines.id });
    await tx
      .update(members)
      .set({ totalFines: sql`${members.totalFines} + ${input.amount}`, updatedAt: new Date() })
      .where(eq(members.id, member.id));
    return done({ fineId: fine.id });
  },
});

/** Marks a pending fine paid or waived and takes it off the member's total. Nobody waives their own fine. */
export const settleFine = defineCommand({
  name: "fines.settle",
  description: "Mark a pending fine paid, or waive it.",
  permission: "fines.settle",
  input: z.object({ fineId: z.coerce.number().int().positive(), status: z.enum(["paid", "waived"]) }),
  run: async (tx, actor, input) => {
    const fine = await tx.query.fines.findFirst({
      where: and(eq(fines.id, input.fineId), eq(fines.groupId, actor.groupId)),
    });
    if (!fine) return fail("Fine not found", 404);
    if (fine.status !== "pending") return fail("This fine is already settled");
    if (input.status === "waived") {
      const self = selfDealingError(actor.memberId, fine.memberId, "waive a fine");
      if (self) return fail(self, 403);
    }
    await tx.update(fines).set({ status: input.status, updatedAt: new Date() }).where(eq(fines.id, fine.id));
    await tx
      .update(members)
      .set({ totalFines: sql`${members.totalFines} - ${fine.amount}`, updatedAt: new Date() })
      .where(eq(members.id, fine.memberId));
    return done({ fineId: fine.id });
  },
});
