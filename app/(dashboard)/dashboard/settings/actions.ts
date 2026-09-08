"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { groups, rules, welfarePolicies } from "@/lib/db/schema";
import {
  updateSettingsSchema,
  updateCapitalPolicySchema,
  updateLoanSettingsSchema,
} from "@/lib/validation/settings";
import { updateWelfarePolicySchema } from "@/lib/validation/welfare-policy";
import { RULE_TEMPLATES, type RuleCategory } from "@/lib/domain/rule-templates";
import { getOrCreateWelfarePolicy, getOrCreateWelfareFund } from "@/app/(dashboard)/dashboard/welfare/welfare-data";

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
        minPersonalSavingsIncrement:
          values.minPersonalSavingsIncrement !== undefined
            ? String(values.minPersonalSavingsIncrement)
            : undefined,
        updatedAt: new Date(),
      })
      .where(eq(groups.id, groupId)),
  );

  revalidatePath("/dashboard/settings");
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

export async function updateLoanSettingsAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const session = await requireRole("admin");

  const parsed = updateLoanSettingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const values = parsed.data;
  const groupId = session.activeMembership.groupId;

  await withTenant(groupId, (tx) =>
    tx
      .update(groups)
      .set({
        loanInterestRate:
          values.loanInterestRate !== undefined ? String(values.loanInterestRate) : undefined,
        loanMaxMultiplier:
          values.loanMaxMultiplier !== undefined ? String(values.loanMaxMultiplier) : undefined,
        loanRepaymentMonths: values.loanRepaymentMonths,
        loanLatePenalty:
          values.loanLatePenalty !== undefined ? String(values.loanLatePenalty) : undefined,
        loanMinGuarantors: values.loanMinGuarantors,
        loanMaxConcurrentGuarantees: values.loanMaxConcurrentGuarantees,
        minLoanAmount: values.minLoanAmount !== undefined ? String(values.minLoanAmount) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(groups.id, groupId)),
  );

  revalidatePath("/dashboard/settings");
  return { ok: true };
}

const ACTIVATABLE_PRODUCTS = ["loans", "mgr", "welfare", "projects"] as const;
type ActivatableProduct = (typeof ACTIVATABLE_PRODUCTS)[number];

type ProductEnabledColumns = {
  loansEnabled?: boolean;
  mgrEnabled?: boolean;
  welfareEnabled?: boolean;
  projectsEnabled?: boolean;
};

/** Explicit per-product literal keys — Drizzle's `.set()` needs a real column key, not a computed `${string}Enabled` template. */
function enabledColumnUpdate(product: ActivatableProduct): ProductEnabledColumns {
  switch (product) {
    case "loans":
      return { loansEnabled: true };
    case "mgr":
      return { mgrEnabled: true };
    case "welfare":
      return { welfareEnabled: true };
    case "projects":
      return { projectsEnabled: true };
  }
}

export type ActivateProductState = { error: string } | { ok: true } | null;

/**
 * The vehicle-activation wizard's single finishing action — turns a product
 * on, optionally sets its loan terms (loans only — MGR has its own richer
 * config flow at /mgr, welfare/projects have no group-level settings to
 * set), and bulk-adds whichever starter rule templates the admin picked, as
 * one transaction. Deliberately one combined action rather than three
 * separate ones: closing the dialog partway through a multi-step wizard
 * shouldn't be able to leave the group half-configured (product on, no
 * rules; or rules added, product still off).
 *
 * Template text is looked up server-side from RULE_TEMPLATES by id — the
 * client only ever sends which ids were checked, never free-text rule
 * content, so this can't be used to insert arbitrary rule text.
 */
export async function activateProductAction(
  _prev: ActivateProductState,
  formData: FormData,
): Promise<ActivateProductState> {
  const session = await requireRole("admin");
  const groupId = session.activeMembership.groupId;

  const product = formData.get("product");
  if (typeof product !== "string" || !ACTIVATABLE_PRODUCTS.includes(product as ActivatableProduct)) {
    return { error: "Invalid vehicle" };
  }
  const productKey = product as ActivatableProduct;

  const loanSettingsParsed =
    productKey === "loans"
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

  const requestedTemplateIds = new Set(formData.getAll("templateIds").map(String));
  const templatesToAdd = RULE_TEMPLATES.filter(
    (t) => requestedTemplateIds.has(t.id) && t.category === (productKey as RuleCategory),
  );

  await withTenant(groupId, async (tx) => {
    await tx
      .update(groups)
      .set({
        ...enabledColumnUpdate(productKey),
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
        updatedAt: new Date(),
      })
      .where(eq(groups.id, groupId));

    // Real root-cause fix, not just the dashboard-side symptom: welfare's
    // policy/fund rows were never actually created at activation time
    // despite getOrCreateWelfareFund's own doc comment claiming they were
    // — leaving every welfare-enabled-via-this-wizard group permanently
    // dependent on lazy get-or-create fallbacks (a real, reproduced bug:
    // /dashboard's Promise.all of 6 concurrent withTenant transactions
    // racing that fallback threw an RLS violation). Create both here,
    // inside this single transaction, so no page ever needs to fall back
    // to a racy lazy insert for a group activated this way again.
    if (productKey === "welfare") {
      await getOrCreateWelfarePolicy(tx, groupId);
      await getOrCreateWelfareFund(tx, groupId);
    }

    if (templatesToAdd.length === 0) return;

    const existingRules = await tx.query.rules.findMany({
      where: and(eq(rules.groupId, groupId), eq(rules.category, productKey)),
      columns: { title: true },
    });
    const existingTitles = new Set(existingRules.map((r) => r.title));

    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(rules)
      .where(eq(rules.groupId, groupId));

    let nextNumber = count + 1;
    for (const template of templatesToAdd) {
      // Idempotent-ish across repeated wizard runs — skip a template
      // already added under the same title, don't create duplicates.
      if (existingTitles.has(template.title)) continue;
      await tx.insert(rules).values({
        groupId,
        ruleNumber: String(nextNumber).padStart(2, "0"),
        category: template.category,
        title: template.title,
        description: template.description,
        penaltyAmount:
          template.suggestedPenaltyAmount !== undefined ? String(template.suggestedPenaltyAmount) : null,
      });
      nextNumber++;
    }
  });

  revalidatePath("/", "layout");
  revalidatePath("/dashboard/rules");
  revalidatePath("/dashboard/settings");
  return { ok: true };
}

export async function updateCapitalPolicyAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const session = await requireRole("admin");

  const parsed = updateCapitalPolicySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { targetLoanDeploymentPct } = parsed.data;
  const groupId = session.activeMembership.groupId;

  await withTenant(groupId, (tx) =>
    tx
      .update(groups)
      .set({
        targetLoanDeploymentPct:
          targetLoanDeploymentPct === "" || targetLoanDeploymentPct === undefined
            ? null
            : String(targetLoanDeploymentPct),
        updatedAt: new Date(),
      })
      .where(eq(groups.id, groupId)),
  );

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/capital");
  return { ok: true };
}

/**
 * The welfare-policy wizard's single finishing action — every field is
 * optional on the schema (see updateWelfarePolicySchema), but the wizard
 * always sends the full set it collected across its steps, same "one
 * combined submit" reasoning as activateProductAction above. allowOverdraft
 * is a checkbox read directly from formData, matching every other boolean
 * flag in this codebase.
 */
export async function updateWelfarePolicyAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const session = await requireRole("admin");

  const parsed = updateWelfarePolicySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;
  const groupId = session.activeMembership.groupId;

  await withTenant(groupId, async (tx) => {
    await getOrCreateWelfarePolicy(tx, groupId);
    await tx
      .update(welfarePolicies)
      .set({
        fundingMethod: v.fundingMethod,
        fundingFixedAmount: v.fundingFixedAmount !== undefined ? String(v.fundingFixedAmount) : undefined,
        fundingPct: v.fundingPct !== undefined ? String(v.fundingPct) : undefined,
        emergencyAllocationPct:
          v.emergencyAllocationPct !== undefined ? String(v.emergencyAllocationPct) : undefined,
        longTermAllocationPct:
          v.longTermAllocationPct !== undefined ? String(v.longTermAllocationPct) : undefined,
        advanceAllocationPct:
          v.advanceAllocationPct !== undefined ? String(v.advanceAllocationPct) : undefined,
        maxEmergencyGrant: v.maxEmergencyGrant !== undefined ? String(v.maxEmergencyGrant) : undefined,
        maxLongTermGrant: v.maxLongTermGrant !== undefined ? String(v.maxLongTermGrant) : undefined,
        maxAdvance: v.maxAdvance !== undefined ? String(v.maxAdvance) : undefined,
        maxOutstandingAdvancePerMember:
          v.maxOutstandingAdvancePerMember !== undefined ? String(v.maxOutstandingAdvancePerMember) : undefined,
        minEmergencyReserveFloor:
          v.minEmergencyReserveFloor !== undefined ? String(v.minEmergencyReserveFloor) : undefined,
        maxClaimsPerMemberPerYear: v.maxClaimsPerMemberPerYear,
        cooldownDays: v.cooldownDays,
        minTenureMonths: v.minTenureMonths,
        advanceFeePct: v.advanceFeePct !== undefined ? String(v.advanceFeePct) : undefined,
        advanceMaxRepaymentMonths: v.advanceMaxRepaymentMonths,
        tier1MaxAmount: v.tier1MaxAmount !== undefined ? String(v.tier1MaxAmount) : undefined,
        tier2MaxAmount: v.tier2MaxAmount !== undefined ? String(v.tier2MaxAmount) : undefined,
        allowOverdraft: formData.get("allowOverdraft") === "on",
        updatedAt: new Date(),
      })
      .where(eq(welfarePolicies.groupId, groupId));
  });

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/welfare");
  return { ok: true };
}
