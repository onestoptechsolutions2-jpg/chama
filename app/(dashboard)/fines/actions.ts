"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { fines, members } from "@/lib/db/schema";
import { createFineSchema } from "@/lib/validation/fines";

export type FineActionState = { error: string } | null;

export async function createFineAction(
  _prev: FineActionState,
  formData: FormData,
): Promise<FineActionState> {
  const session = await requireRole("admin", "treasurer", "secretary");

  const parsed = createFineSchema.safeParse({
    memberId: formData.get("memberId"),
    type: formData.get("type"),
    amount: formData.get("amount"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { memberId, type, amount, reason } = parsed.data;
  const groupId = session.activeMembership.groupId;

  await withTenant(groupId, async (tx) => {
    await tx.insert(fines).values({
      groupId,
      memberId,
      type,
      amount: String(amount),
      reason: reason || null,
      recordedBy: session.user.id,
    });

    await tx
      .update(members)
      .set({
        totalFines: sql`${members.totalFines} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(and(eq(members.id, memberId), eq(members.groupId, groupId)));
  });

  revalidatePath("/fines");
  return null;
}

/** Marks a pending fine paid or waived, and reverses its charge off the member's total. */
export async function resolveFineAction(
  fineId: number,
  status: "paid" | "waived",
): Promise<void> {
  const session = await requireRole("admin", "treasurer");
  const groupId = session.activeMembership.groupId;

  await withTenant(groupId, async (tx) => {
    const fine = await tx.query.fines.findFirst({
      where: and(eq(fines.id, fineId), eq(fines.groupId, groupId)),
    });
    if (!fine || fine.status !== "pending") return;

    await tx
      .update(fines)
      .set({ status, updatedAt: new Date() })
      .where(eq(fines.id, fineId));

    await tx
      .update(members)
      .set({
        totalFines: sql`${members.totalFines} - ${fine.amount}`,
        updatedAt: new Date(),
      })
      .where(eq(members.id, fine.memberId));
  });

  revalidatePath("/fines");
}
