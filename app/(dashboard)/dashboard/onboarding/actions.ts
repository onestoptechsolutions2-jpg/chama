"use server";

import { isPlatformStaff, PLATFORM_STAFF_NO_GROUPS } from "@/lib/auth/permissions";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { withUser } from "@/lib/db/rls";
import { groupMemberships, groups, members, rules, sessions, welfarePolicies } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { onboardingGroupSchema } from "@/lib/validation/groups";
import { SEGMENTS, segmentRules } from "@/lib/domain/segments";

export type CreateGroupState = { error: string } | null;

/**
 * "Start a group": any signed-in person creates a group from one of the
 * ready-made setups (lib/domain/segments.ts) and becomes its admin. The
 * setup switches on the right products, sets the money rules, a welfare
 * contribution where relevant, and a short starter rule book.
 */
export async function createOnboardingGroupAction(_prev: CreateGroupState, formData: FormData): Promise<CreateGroupState> {
  const session = await requireSession();
  if (isPlatformStaff(session.user.platformRole)) return { error: PLATFORM_STAFF_NO_GROUPS };
  const parsed = onboardingGroupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid group details" };

  const { name, segment, description, contactPersonRole } = parsed.data;
  const template = SEGMENTS[segment];
  const s = template.settings;

  const groupId = await withUser(session.user.id, async (tx) => {
    // No .returning() here, deliberately: at the instant this row is
    // inserted, none of groups' three SELECT policies match yet (not
    // public/registration-complete, app.current_group_id isn't set under
    // withUser, and the founding membership row below doesn't exist yet)
    // — under FORCE ROW LEVEL SECURITY, INSERT ... RETURNING must ALSO
    // satisfy a SELECT policy on the new row. lastval() reads back the id
    // this session's own INSERT just consumed — not a table SELECT.
    await tx.insert(groups).values({
      name,
      type: template.type,
      segment,
      description: description || null,
      isPublic: false,
      requireApproval: true,
      loansEnabled: template.products.loans,
      mgrEnabled: template.products.mgr,
      welfareEnabled: template.products.welfare,
      projectsEnabled: template.products.projects,
      sharePrice: String(s.sharePrice),
      sharesPerMember: s.sharesPerMember,
      meetingDay: s.meetingDay,
      fineLateness: String(s.fineLateness),
      fineAbsence: String(s.fineAbsence),
      ...(s.loanInterestRate !== undefined ? { loanInterestRate: String(s.loanInterestRate) } : {}),
      ...(s.loanMaxMultiplier !== undefined ? { loanMaxMultiplier: String(s.loanMaxMultiplier) } : {}),
      ...(s.loanRepaymentMonths !== undefined ? { loanRepaymentMonths: s.loanRepaymentMonths } : {}),
      ...(s.loanMinGuarantors !== undefined ? { loanMinGuarantors: s.loanMinGuarantors } : {}),
      contactPersonName: session.user.name,
      contactPersonEmail: session.user.email,
      contactPersonPhone: session.user.phone,
      contactPersonRole: contactPersonRole || "Chairperson",
      onboardingStage: "registration",
    });
    const lastvalResult = await tx.execute<{ id: number }>(sql`select lastval()::int as id`);
    const newGroupId = lastvalResult.rows[0].id;

    await tx.execute(sql`select set_config('app.current_group_id', ${String(newGroupId)}, true)`);
    await tx.insert(groupMemberships).values({
      userId: session.user.id,
      groupId: newGroupId,
      role: "admin",
      status: "active",
      rulesAcceptedAt: new Date(),
    });
    await tx.insert(members).values({
      groupId: newGroupId,
      userId: session.user.id,
      name: session.user.name,
      phone: session.user.phone,
      email: session.user.email,
    });

    if (template.welfare) {
      await tx.insert(welfarePolicies).values({
        groupId: newGroupId,
        fundingMethod: "fixed_amount",
        fundingFixedAmount: String(template.welfare.fixedAmount),
        benefitSchedule: template.welfare.benefits ?? [],
        // The cap must cover the largest benefit, or the table can't pay it.
        ...(template.welfare.benefits?.length
          ? { maxEmergencyGrant: String(Math.max(...template.welfare.benefits.map((b) => b.amount))) }
          : {}),
      });
    }

    let ruleNumber = 1;
    for (const rule of segmentRules(segment)) {
      await tx.insert(rules).values({
        groupId: newGroupId,
        ruleNumber: String(ruleNumber++).padStart(2, "0"),
        category: rule.category,
        title: rule.title,
        description: rule.description,
        penaltyAmount: rule.suggestedPenaltyAmount !== undefined ? String(rule.suggestedPenaltyAmount) : null,
      });
    }
    return newGroupId;
  });

  await db.update(sessions).set({ activeGroupId: groupId }).where(eq(sessions.id, session.sessionId));
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard");
}
