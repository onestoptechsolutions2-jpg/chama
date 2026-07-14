"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { requireActiveGroup, requireRole } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { welfareClaims } from "@/lib/db/schema";
import { submitClaimSchema, reviewClaimSchema } from "@/lib/validation/welfare";

export type WelfareActionState = { error: string } | null;

export async function submitClaimAction(
  _prev: WelfareActionState,
  formData: FormData,
): Promise<WelfareActionState> {
  const session = await requireActiveGroup();
  const memberId = session.activeMembership.memberId;
  if (!memberId) return { error: "No member profile linked to your account" };

  const parsed = submitClaimSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { claimType, amountRequested, beneficiaryName, beneficiaryRel, description } =
    parsed.data;
  const groupId = session.activeMembership.groupId;

  await withTenant(groupId, (tx) =>
    tx.insert(welfareClaims).values({
      groupId,
      memberId,
      claimType,
      amountRequested: String(amountRequested),
      beneficiaryName: beneficiaryName || null,
      beneficiaryRel: beneficiaryRel || null,
      description: description || null,
    }),
  );

  revalidatePath("/welfare");
  return null;
}

export async function reviewClaimAction(
  claimId: number,
  formData: FormData,
): Promise<WelfareActionState> {
  const session = await requireRole("admin", "treasurer");
  const parsed = reviewClaimSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { decision, amountApproved, rejectionReason } = parsed.data;
  const groupId = session.activeMembership.groupId;

  await withTenant(groupId, async (tx) => {
    const claim = await tx.query.welfareClaims.findFirst({
      where: eq(welfareClaims.id, claimId),
    });
    if (!claim || claim.groupId !== groupId) return;

    await tx
      .update(welfareClaims)
      .set({
        status: decision,
        reviewedBy: session.user.id,
        reviewedAt: new Date(),
        amountApproved:
          decision === "approved" || decision === "disbursed"
            ? String(amountApproved ?? claim.amountApproved ?? claim.amountRequested)
            : claim.amountApproved,
        rejectionReason: decision === "rejected" ? rejectionReason || null : claim.rejectionReason,
        disbursedAt: decision === "disbursed" ? new Date() : claim.disbursedAt,
        updatedAt: new Date(),
      })
      .where(eq(welfareClaims.id, claimId));
  });

  revalidatePath("/welfare");
  return null;
}
