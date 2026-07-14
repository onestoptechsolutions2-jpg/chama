"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { rules } from "@/lib/db/schema";
import { createRuleSchema } from "@/lib/validation/rules";

export type RuleActionState = { error: string } | null;

export async function createRuleAction(
  _prev: RuleActionState,
  formData: FormData,
): Promise<RuleActionState> {
  const session = await requireRole("admin");

  const parsed = createRuleSchema.safeParse({
    category: formData.get("category"),
    title: formData.get("title"),
    description: formData.get("description"),
    penaltyAmount: formData.get("penaltyAmount"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { category, title, description, penaltyAmount } = parsed.data;
  const groupId = session.activeMembership.groupId;

  await withTenant(groupId, async (tx) => {
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(rules)
      .where(eq(rules.groupId, groupId));

    await tx.insert(rules).values({
      groupId,
      ruleNumber: String(count + 1).padStart(2, "0"),
      category,
      title: title || null,
      description,
      penaltyAmount: penaltyAmount !== undefined ? String(penaltyAmount) : null,
    });
  });

  revalidatePath("/rules");
  return null;
}

export async function deactivateRuleAction(ruleId: number): Promise<void> {
  const session = await requireRole("admin");
  const groupId = session.activeMembership.groupId;

  await withTenant(groupId, async (tx) => {
    await tx
      .update(rules)
      .set({ active: false, updatedAt: new Date() })
      .where(and(eq(rules.id, ruleId), eq(rules.groupId, groupId)));
  });

  revalidatePath("/rules");
}
