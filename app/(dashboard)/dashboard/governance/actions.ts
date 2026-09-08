"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { groupDocuments, complianceObligations } from "@/lib/db/schema";
import {
  uploadGroupDocumentSchema,
  createComplianceObligationSchema,
} from "@/lib/validation/governance";
import { nextOccurrence } from "@/lib/domain/governance";

export type GovernanceActionState = { error: string } | null;

export async function uploadGroupDocumentAction(
  _prev: GovernanceActionState,
  formData: FormData,
): Promise<GovernanceActionState> {
  const session = await requireRole("admin", "secretary");
  const parsed = uploadGroupDocumentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { title, category, fileUrl } = parsed.data;
  const groupId = session.activeMembership.groupId;

  await withTenant(groupId, (tx) =>
    tx.insert(groupDocuments).values({
      groupId,
      title,
      category,
      fileUrl,
      uploadedByUserId: session.user.id,
    }),
  );

  revalidatePath("/dashboard/governance");
  return null;
}

export async function deleteGroupDocumentAction(documentId: number): Promise<void> {
  const session = await requireRole("admin", "secretary");
  const groupId = session.activeMembership.groupId;

  await withTenant(groupId, (tx) =>
    tx
      .delete(groupDocuments)
      .where(and(eq(groupDocuments.id, documentId), eq(groupDocuments.groupId, groupId))),
  );

  revalidatePath("/dashboard/governance");
}

export async function createComplianceObligationAction(
  _prev: GovernanceActionState,
  formData: FormData,
): Promise<GovernanceActionState> {
  const session = await requireRole("admin", "secretary");
  const parsed = createComplianceObligationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { type, title, dueDate, recurrenceMonths, notes } = parsed.data;
  const groupId = session.activeMembership.groupId;

  await withTenant(groupId, (tx) =>
    tx.insert(complianceObligations).values({
      groupId,
      type,
      title,
      dueDate,
      recurrenceMonths: recurrenceMonths ?? null,
      notes: notes || null,
    }),
  );

  revalidatePath("/dashboard/governance");
  return null;
}

/**
 * Marks an obligation complete and, if it recurs, creates the next
 * occurrence immediately (rather than waiting for the cron) so it's never
 * lost between "marked complete" and "cron next runs."
 */
export async function markObligationCompleteAction(obligationId: number): Promise<void> {
  const session = await requireRole("admin", "secretary");
  const groupId = session.activeMembership.groupId;

  await withTenant(groupId, async (tx) => {
    const obligation = await tx.query.complianceObligations.findFirst({
      where: and(eq(complianceObligations.id, obligationId), eq(complianceObligations.groupId, groupId)),
    });
    if (!obligation || obligation.status === "completed") return;

    await tx
      .update(complianceObligations)
      .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
      .where(eq(complianceObligations.id, obligationId));

    if (obligation.recurrenceMonths) {
      await tx.insert(complianceObligations).values({
        groupId,
        type: obligation.type,
        title: obligation.title,
        dueDate: nextOccurrence(obligation.dueDate, obligation.recurrenceMonths),
        recurrenceMonths: obligation.recurrenceMonths,
        notes: obligation.notes,
      });
    }
  });

  revalidatePath("/dashboard/governance");
}

export async function deleteComplianceObligationAction(obligationId: number): Promise<void> {
  const session = await requireRole("admin", "secretary");
  const groupId = session.activeMembership.groupId;

  await withTenant(groupId, (tx) =>
    tx
      .delete(complianceObligations)
      .where(and(eq(complianceObligations.id, obligationId), eq(complianceObligations.groupId, groupId))),
  );

  revalidatePath("/dashboard/governance");
}
