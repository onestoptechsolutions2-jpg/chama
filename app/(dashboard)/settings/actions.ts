"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { groups } from "@/lib/db/schema";
import { updateSettingsSchema } from "@/lib/validation/settings";

export type SettingsActionState = { error: string } | { ok: true } | null;

export async function updateSettingsAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const session = await requireRole("admin");

  const parsed = updateSettingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const values = parsed.data;
  const groupId = session.activeMembership.groupId;

  await withTenant(groupId, (tx) =>
    tx
      .update(groups)
      .set({
        ...values,
        sharePrice: values.sharePrice !== undefined ? String(values.sharePrice) : undefined,
        fineLateness: values.fineLateness !== undefined ? String(values.fineLateness) : undefined,
        fineAbsence: values.fineAbsence !== undefined ? String(values.fineAbsence) : undefined,
        fineRuleViolation:
          values.fineRuleViolation !== undefined ? String(values.fineRuleViolation) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(groups.id, groupId)),
  );

  revalidatePath("/settings");
  return { ok: true };
}

/**
 * Turning a product off only gates access (nav + requireProduct on its
 * pages/actions) — it never touches the underlying rows, so re-enabling
 * later restores full history. Separate from updateSettingsAction because
 * it's a distinct concern (entitlements, not group configuration) and
 * because a toggle affects the nav/guide on every page, not just /settings.
 */
export async function updateProductAccessAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const session = await requireRole("admin");
  const groupId = session.activeMembership.groupId;

  await withTenant(groupId, (tx) =>
    tx
      .update(groups)
      .set({
        loansEnabled: formData.get("loansEnabled") === "on",
        mgrEnabled: formData.get("mgrEnabled") === "on",
        welfareEnabled: formData.get("welfareEnabled") === "on",
        projectsEnabled: formData.get("projectsEnabled") === "on",
        updatedAt: new Date(),
      })
      .where(eq(groups.id, groupId)),
  );

  revalidatePath("/", "layout");
  return { ok: true };
}
