"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNotNull } from "drizzle-orm";
import { withPlatformAdmin } from "@/lib/db/rls";
import { groups, groupMemberships, members, users, rules } from "@/lib/db/schema";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { createGroupSchema } from "@/lib/validation/groups";
import { updateLoanSettingsSchema } from "@/lib/validation/settings";
import { isKycComplete } from "@/lib/domain/officials";
import { visibleRuleTemplates } from "@/lib/domain/rule-templates";

export type CreateGroupState = { error: string } | null;

/**
 * The new-group setup wizard's single finishing action — creates the group,
 * its founding admin, its selected vehicles (and loan terms, if Table
 * Banking is one of them), and whichever starter rule templates were
 * picked, all in one transaction. Same reasoning as
 * app/(dashboard)/settings/actions.ts's activateProductAction: a group
 * shouldn't be able to exist half-configured because the wizard dialog was
 * closed partway through.
 */
export async function createGroupAction(
  _prev: CreateGroupState,
  formData: FormData,
): Promise<CreateGroupState> {
  const session = await requirePlatformAdmin();
  const parsed = createGroupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { name, type, description, isPublic, requireApproval, maxMembers, adminEmail } =
    parsed.data;

  const selectedProducts = {
    loans: formData.get("loansEnabled") === "on",
    mgr: formData.get("mgrEnabled") === "on",
    welfare: formData.get("welfareEnabled") === "on",
    projects: formData.get("projectsEnabled") === "on",
  };

  const loanSettingsParsed = selectedProducts.loans
    ? updateLoanSettingsSchema.safeParse({
        loanInterestRate: formData.get("loanInterestRate") ?? undefined,
        loanMaxMultiplier: formData.get("loanMaxMultiplier") ?? undefined,
        loanRepaymentMonths: formData.get("loanRepaymentMonths") ?? undefined,
        loanLatePenalty: formData.get("loanLatePenalty") ?? undefined,
        loanMinGuarantors: formData.get("loanMinGuarantors") ?? undefined,
      })
    : null;
  if (loanSettingsParsed && !loanSettingsParsed.success) {
    return { error: loanSettingsParsed.error.issues[0]?.message ?? "Invalid loan settings" };
  }
  const loanSettings = loanSettingsParsed?.success ? loanSettingsParsed.data : null;

  // Cross-checked against the selected vehicles server-side (defense in
  // depth, same as activateProductAction) — visibleRuleTemplates is the
  // one place "which templates does this set of vehicles unlock" is
  // defined, so a template id that doesn't belong to an enabled category
  // is silently dropped rather than trusted from the client.
  const requestedTemplateIds = new Set(formData.getAll("templateIds").map(String));
  const templatesToAdd = visibleRuleTemplates(selectedProducts).filter((t) =>
    requestedTemplateIds.has(t.id),
  );

  const result = await withPlatformAdmin(async (tx): Promise<{ error: string } | { ok: true }> => {
    const admin = await tx.query.users.findFirst({ where: eq(users.email, adminEmail) });
    if (!admin) {
      return { error: "No account with that email exists yet — ask them to register first" };
    }

    const [group] = await tx
      .insert(groups)
      .values({
        name,
        type,
        description: description || null,
        isPublic,
        requireApproval,
        maxMembers: maxMembers ?? null,
        loansEnabled: selectedProducts.loans,
        mgrEnabled: selectedProducts.mgr,
        welfareEnabled: selectedProducts.welfare,
        projectsEnabled: selectedProducts.projects,
        ...(loanSettings
          ? {
              loanInterestRate:
                loanSettings.loanInterestRate !== undefined
                  ? String(loanSettings.loanInterestRate)
                  : undefined,
              loanMaxMultiplier:
                loanSettings.loanMaxMultiplier !== undefined
                  ? String(loanSettings.loanMaxMultiplier)
                  : undefined,
              loanRepaymentMonths: loanSettings.loanRepaymentMonths,
              loanLatePenalty:
                loanSettings.loanLatePenalty !== undefined
                  ? String(loanSettings.loanLatePenalty)
                  : undefined,
              loanMinGuarantors: loanSettings.loanMinGuarantors,
            }
          : {}),
      })
      .returning();

    let ruleNumber = 1;
    for (const template of templatesToAdd) {
      await tx.insert(rules).values({
        groupId: group.id,
        ruleNumber: String(ruleNumber).padStart(2, "0"),
        category: template.category,
        title: template.title,
        description: template.description,
        penaltyAmount:
          template.suggestedPenaltyAmount !== undefined
            ? String(template.suggestedPenaltyAmount)
            : null,
      });
      ruleNumber++;
    }

    await tx.insert(groupMemberships).values({
      userId: admin.id,
      groupId: group.id,
      role: "admin",
      status: "active",
      reviewedBy: session.user.id,
      reviewedAt: new Date(),
      // Same automatic acceptance as approveMembershipAction — the
      // founding admin is bound by the group's rules from the moment
      // their membership exists, same as anyone else who joins.
      rulesAcceptedAt: new Date(),
    });

    // Cross-group KYC reuse (this admin may already have KYC on file from
    // another group) — already inside withPlatformAdmin, no separate call
    // needed. See lib/db/schema.ts's members KYC comment.
    const existingKyc = await tx.query.members.findFirst({
      where: and(eq(members.userId, admin.id), isNotNull(members.kycCompletedAt)),
      orderBy: (m, { desc }) => [desc(m.updatedAt)],
    });
    const kycFields = {
      idType: existingKyc?.idType ?? null,
      idNumber: existingKyc?.idNumber ?? null,
      idDocumentUrl: existingKyc?.idDocumentUrl ?? null,
      photoUrl: existingKyc?.photoUrl ?? null,
      signatureUrl: existingKyc?.signatureUrl ?? null,
      address: existingKyc?.address ?? null,
    };

    await tx.insert(members).values({
      groupId: group.id,
      userId: admin.id,
      name: admin.name,
      phone: existingKyc?.phone ?? admin.phone,
      email: admin.email,
      ...kycFields,
      // The founding admin holds the admin office, which requires the
      // full field set (see lib/domain/officials.ts).
      kycCompletedAt: isKycComplete("admin", kycFields) ? new Date() : null,
    });

    return { ok: true };
  });

  if ("error" in result) return result;

  revalidatePath("/super-admin/groups");
  return null;
}
