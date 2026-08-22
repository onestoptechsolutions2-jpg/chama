"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { withPlatformAdmin, withUser } from "@/lib/db/rls";
import {
  groupAccountActivities,
  groups,
  groupMemberships,
  members,
  sessions,
  users,
  rules,
} from "@/lib/db/schema";
import { requirePlatformAdmin, requireSession } from "@/lib/auth/session";
import { createGroupSchema, groupTypes, onboardingGroupSchema } from "@/lib/validation/groups";
import { updateLoanSettingsSchema } from "@/lib/validation/settings";
import { isKycComplete } from "@/lib/domain/officials";
import { visibleRuleTemplates } from "@/lib/domain/rule-templates";

export type CreateGroupState = { error: string } | null;
export type UpdateGroupState = { error: string } | null;

const ONBOARDING_STAGES = [
  "lead",
  "contacted",
  "demo",
  "registration",
  "verification",
  "training",
  "active",
  "at_risk",
  "churned",
] as const;
const ACCOUNT_TIERS = ["standard", "key", "strategic"] as const;

export type AccountManagementState = { error: string } | null;

export async function createOnboardingGroupAction(
  _prev: CreateGroupState,
  formData: FormData,
): Promise<CreateGroupState> {
  const session = await requireSession();
  const parsed = onboardingGroupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid group details" };

  const { name, type, description, contactPersonPhone, contactPersonRole } = parsed.data;
  const group = await withUser(session.user.id, async (tx) => {
    const [created] = await tx
      .insert(groups)
      .values({
        name,
        type,
        description: description || null,
        isPublic: false,
        requireApproval: true,
        loansEnabled: parsed.data.loansEnabled === "on",
        mgrEnabled: parsed.data.mgrEnabled === "on",
        welfareEnabled: parsed.data.welfareEnabled === "on",
        projectsEnabled: parsed.data.projectsEnabled === "on",
        contactPersonName: session.user.name,
        contactPersonEmail: session.user.email,
        contactPersonPhone: contactPersonPhone || session.user.phone,
        contactPersonRole: contactPersonRole || "Group administrator",
        onboardingStage: "registration",
      })
      .returning();

    await tx.execute(sql`select set_config('app.current_group_id', ${String(created.id)}, true)`);
    await tx.insert(groupMemberships).values({
      userId: session.user.id,
      groupId: created.id,
      role: "admin",
      status: "active",
      rulesAcceptedAt: new Date(),
    });
    await tx.insert(members).values({
      groupId: created.id,
      userId: session.user.id,
      name: session.user.name,
      phone: session.user.phone,
      email: session.user.email,
    });
    return created;
  });

  await db.update(sessions).set({ activeGroupId: group.id }).where(eq(sessions.id, session.sessionId));
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard");
}

export async function updateGroupAccountAction(
  groupId: number,
  input: {
    contactPersonName: string;
    contactPersonRole: string;
    contactPersonPhone: string;
    contactPersonEmail: string;
    onboardingStage: string;
    accountTier: string;
    accountOwnerUserId: number | null;
    nextFollowUpAt: string;
    internalNotes: string;
    activityNote: string;
  },
): Promise<AccountManagementState> {
  const session = await requirePlatformAdmin();
  if (!ONBOARDING_STAGES.includes(input.onboardingStage as (typeof ONBOARDING_STAGES)[number])) {
    return { error: "Invalid onboarding stage" };
  }
  if (!ACCOUNT_TIERS.includes(input.accountTier as (typeof ACCOUNT_TIERS)[number])) {
    return { error: "Invalid account tier" };
  }

  const followUp = input.nextFollowUpAt ? new Date(input.nextFollowUpAt) : null;
  if (followUp && Number.isNaN(followUp.getTime())) {
    return { error: "Invalid follow-up date" };
  }

  const result = await withPlatformAdmin(async (tx) => {
    if (input.accountOwnerUserId !== null) {
      const owner = await tx.query.users.findFirst({ where: eq(users.id, input.accountOwnerUserId) });
      if (!owner?.platformRole) return { error: "Account owner must be a platform team member" };
    }

    const [updated] = await tx
      .update(groups)
      .set({
        contactPersonName: input.contactPersonName.trim() || null,
        contactPersonRole: input.contactPersonRole.trim() || null,
        contactPersonPhone: input.contactPersonPhone.trim() || null,
        contactPersonEmail: input.contactPersonEmail.trim().toLowerCase() || null,
        onboardingStage: input.onboardingStage as (typeof ONBOARDING_STAGES)[number],
        accountTier: input.accountTier as (typeof ACCOUNT_TIERS)[number],
        accountOwnerUserId: input.accountOwnerUserId,
        nextFollowUpAt: followUp,
        internalNotes: input.internalNotes.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(groups.id, groupId))
      .returning({ id: groups.id });
    if (!updated) return { error: "Group not found" };

    if (input.activityNote.trim()) {
      await tx.insert(groupAccountActivities).values({
        groupId,
        actorUserId: session.user.id,
        activityType: "account_update",
        note: input.activityNote.trim(),
        nextFollowUpAt: followUp,
      });
    }
    return null;
  });

  if (result && "error" in result) return result;
  revalidatePath("/super-admin/groups");
  return null;
}

export async function updateGroupAction(
  groupId: number,
  input: {
    name: string;
    type: string;
    description: string;
    isPublic: boolean;
    requireApproval: boolean;
    maxMembers: number | null;
  },
): Promise<UpdateGroupState> {
  await requirePlatformAdmin();
  const name = input.name.trim();
  if (!name || !groupTypes.includes(input.type as (typeof groupTypes)[number])) {
    return { error: "A valid group name and type are required" };
  }
  if (input.maxMembers !== null && (!Number.isInteger(input.maxMembers) || input.maxMembers < 1)) {
    return { error: "Maximum members must be a positive whole number" };
  }

  const result = await withPlatformAdmin(async (tx) => {
    const [updated] = await tx
      .update(groups)
      .set({
        name,
        type: input.type as (typeof groupTypes)[number],
        description: input.description.trim() || null,
        isPublic: input.isPublic,
        requireApproval: input.requireApproval,
        maxMembers: input.maxMembers,
        updatedAt: new Date(),
      })
      .where(eq(groups.id, groupId))
      .returning({ id: groups.id });
    return updated ? null : { error: "Group not found" };
  });

  if (result && "error" in result) return result;
  revalidatePath("/super-admin/groups");
  revalidatePath("/discover");
  return null;
}

export async function setGroupActiveAction(
  groupId: number,
  active: boolean,
): Promise<UpdateGroupState> {
  await requirePlatformAdmin();
  const result = await withPlatformAdmin(async (tx) => {
    const [updated] = await tx
      .update(groups)
      .set({ active, updatedAt: new Date() })
      .where(eq(groups.id, groupId))
      .returning({ id: groups.id });
    return updated ? null : { error: "Group not found" };
  });

  if (result && "error" in result) return result;
  revalidatePath("/super-admin/groups");
  revalidatePath("/discover");
  return null;
}

/**
 * The new-group setup wizard's single finishing action — creates the group,
 * its founding admin, its selected vehicles (and loan terms, if Table
 * Banking is one of them), and whichever starter rule templates were
 * picked, all in one transaction. Same reasoning as
 * app/(dashboard)/dashboard/settings/actions.ts's activateProductAction: a group
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
