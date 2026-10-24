import "server-only";
import { randomBytes } from "crypto";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { withPlatformAdmin, withTenant } from "@/lib/db/rls";
import { fundGifts, funeralFunds, groups, rules, webhookEndpoints, welfarePolicies } from "@/lib/db/schema";
import { normalizePhone } from "@/lib/domain/identity";
import { addDays, nairobiToday } from "@/lib/domain/dates";
import { destinationError, normalizeDestination, type PayoutDestination } from "@/lib/domain/group-wallet";
import {
  closesOnError,
  COMMITTEE_ROLE,
  committeeError,
  DEFAULT_FUND_DAYS,
  GIFT_WINDOW_MINUTES,
  giftError,
  isOpen,
  summarizeGifts,
  type CommitteeRole,
} from "@/lib/domain/funeral-fund";
import { SEGMENTS, segmentRules } from "@/lib/domain/segments";
import { createGroupWallet, groupWalletsEnabled, stkPushToWallet } from "@/lib/payments/intasend";
import { createGroupInvite } from "@/lib/invites/create";
import { dispatchWebhookEvent } from "@/lib/webhooks/dispatch";
import { appUrl } from "@/lib/urls";

/**
 * Funeral funds (see lib/domain/funeral-fund.ts for the rules). A fund is a
 * group: the committee are its officials, the money sits in its IntaSend
 * wallet, and gifts are recorded in fund_gifts the moment IntaSend confirms
 * them. The partner that created a fund (Family Compass) is told about each
 * gift through the group's outbound webhooks.
 */
export type Fail = { error: string; status: number };
const fail = (error: string, status = 400): Fail => ({ error, status });

export const PARTNER_LABELS: Record<string, string> = { familycompass: "Family Compass" };
const FUND_EVENTS = ["fund.gift.paid", "fund.gift.failed", "fund.closed"] as const;

export type CreateFundInput = {
  ref: string;
  deceasedName: string;
  name?: string;
  closesOn?: string;
  targetKes?: number;
  committee: { name: string; phone: string; role: CommitteeRole }[];
  branches?: string[];
  payout?: PayoutDestination;
  webhookUrl?: string;
};

type FundRow = typeof funeralFunds.$inferSelect;

async function fundView(fund: FundRow, groupName: string) {
  return {
    fundId: fund.groupId,
    ref: fund.ref,
    name: groupName,
    deceasedName: fund.deceasedName,
    status: fund.status === "open" && !isOpen(fund, nairobiToday()) ? "closed" : fund.status,
    closesOn: fund.closesOn,
    targetKes: fund.targetKes,
    branches: fund.branches,
    giveUrl: await appUrl(`/f/${fund.giveToken}`),
  };
}

/** Creates the fund (idempotent on the partner's ref): group, wallet, payout account, committee invites, webhook. */
export async function createFund(partner: string, input: CreateFundInput) {
  if (!groupWalletsEnabled()) return fail("Funeral funds need group wallets, which aren't switched on yet", 503);
  const existing = await withPlatformAdmin((tx) =>
    tx
      .select({ fund: funeralFunds, name: groups.name })
      .from(funeralFunds)
      .innerJoin(groups, eq(groups.id, funeralFunds.groupId))
      .where(and(eq(funeralFunds.partner, partner), eq(funeralFunds.ref, input.ref))),
  );
  if (existing[0]) return { created: false, fund: await fundView(existing[0].fund, existing[0].name) };

  const today = nairobiToday();
  const closesOn = input.closesOn || addDays(today, DEFAULT_FUND_DAYS);
  const dateErr = closesOnError(closesOn, today);
  if (dateErr) return fail(dateErr);
  const payout = input.payout ? normalizeDestination(input.payout) : null;
  const committee = input.committee.map((c) => ({ ...c, name: c.name.trim(), phone: normalizePhone(c.phone) }));
  const cErr = committeeError(committee);
  if (cErr) return fail(cErr);
  if (payout) {
    const pErr = destinationError(payout);
    if (pErr) return fail(pErr);
  }
  const branches = [...new Set((input.branches ?? []).map((b) => b.trim()).filter(Boolean))];
  const chair = committee.find((c) => c.role === "chair")!;
  const name = input.name?.trim() || `${input.deceasedName.trim()} Funeral Fund`;

  const wallet = await createGroupWallet(`FUND-${partner}-${input.ref}`.slice(0, 50));
  const giveToken = randomBytes(12).toString("base64url");
  const webhookSecret = input.webhookUrl ? randomBytes(32).toString("hex") : null;

  const groupId = await withPlatformAdmin(async (tx) => {
    await tx.insert(groups).values({
      name,
      type: "welfare",
      segment: "funeral_fund",
      description: `Funeral harambee for ${input.deceasedName.trim()}`,
      isPublic: false,
      requireApproval: true,
      loansEnabled: false,
      mgrEnabled: false,
      welfareEnabled: false,
      projectsEnabled: false,
      contactPersonName: chair.name,
      contactPersonPhone: chair.phone,
      contactPersonRole: "Chairperson",
      intasendWalletId: wallet.wallet_id,
      payoutDestination: payout,
    });
    const id = (await tx.execute<{ id: number }>(sql`select lastval()::int as id`)).rows[0].id;
    await tx.insert(funeralFunds).values({ groupId: id, partner, ref: input.ref, deceasedName: input.deceasedName.trim(), closesOn, targetKes: input.targetKes ?? null, branches, giveToken });
    if (input.webhookUrl && webhookSecret) {
      await tx.insert(webhookEndpoints).values({
        groupId: id,
        url: input.webhookUrl,
        description: `${PARTNER_LABELS[partner] ?? partner} (funeral fund)`,
        secret: webhookSecret,
        events: [...FUND_EVENTS],
      });
    }
    return id;
  });

  const invites = [];
  for (const c of committee) {
    const r = await createGroupInvite({
      groupId,
      groupName: name,
      name: c.name,
      phone: c.phone,
      email: null,
      role: COMMITTEE_ROLE[c.role],
      invitedBy: null,
      inviterName: PARTNER_LABELS[partner] ?? partner,
    });
    invites.push({ phone: c.phone, role: c.role, sent: "ok" in r ? r.smsSent : false, error: "error" in r ? r.error : undefined });
  }

  const fund = await withTenant(groupId, (tx) => tx.query.funeralFunds.findFirst({ where: eq(funeralFunds.groupId, groupId) }));
  return { created: true, fund: await fundView(fund!, name), webhookSecret, invites };
}

/** The fund a partner owns, or null (also null for another partner's fund — no probing). */
export async function partnerFund(partner: string, fundId: number) {
  if (!Number.isInteger(fundId) || fundId <= 0) return null;
  const row = await withTenant(fundId, (tx) => tx.query.funeralFunds.findFirst({ where: eq(funeralFunds.groupId, fundId) }));
  return row && row.partner === partner ? row : null;
}

export async function fundByToken(token: string) {
  if (!/^[\w-]{8,64}$/.test(token)) return null;
  return withPlatformAdmin((tx) => tx.query.funeralFunds.findFirst({ where: eq(funeralFunds.giveToken, token) }));
}

export async function fundSummary(groupId: number) {
  const { fund, group, gifts } = await withTenant(groupId, async (tx) => ({
    fund: await tx.query.funeralFunds.findFirst({ where: eq(funeralFunds.groupId, groupId) }),
    group: await tx.query.groups.findFirst({ where: eq(groups.id, groupId), columns: { name: true } }),
    gifts: await tx.query.fundGifts.findMany({ where: and(eq(fundGifts.groupId, groupId), eq(fundGifts.status, "paid")) }),
  }));
  if (!fund || !group) return null;
  const s = summarizeGifts(
    gifts.map((g) => ({ name: g.name, amount: Number(g.amount), branch: g.branch, message: g.message, anonymous: g.anonymous, status: g.status, paidAt: g.paidAt })),
  );
  return { ...(await fundView(fund, group.name)), ...s };
}

/** Starts an M-Pesa prompt for a gift. The gift counts once IntaSend confirms it (confirmGift). */
export async function startGift(
  groupId: number,
  input: { name: string; phone: string; amount: number; branch?: string | null; message?: string | null; anonymous?: boolean },
  source: "web" | "partner",
): Promise<{ giftId: number; status: "pending" } | Fail> {
  const phone = normalizePhone(input.phone);
  const amount = Math.round(Number(input.amount));
  const branch = input.branch?.trim() || null;
  const checked = await withTenant(groupId, async (tx) => {
    const fund = await tx.query.funeralFunds.findFirst({ where: eq(funeralFunds.groupId, groupId) });
    const group = await tx.query.groups.findFirst({ where: eq(groups.id, groupId), columns: { name: true, intasendWalletId: true } });
    if (!fund || !group?.intasendWalletId) return fail("Fund not found", 404);
    const since = new Date(Date.now() - GIFT_WINDOW_MINUTES * 60_000);
    const recent = phone
      ? (await tx.select({ n: sql<number>`count(*)::int` }).from(fundGifts).where(and(eq(fundGifts.groupId, groupId), eq(fundGifts.phone, phone), gte(fundGifts.createdAt, since))))[0].n
      : 0;
    const err = giftError({ amount, phone, branch }, { open: isOpen(fund, nairobiToday()), branches: fund.branches, recentFromPhone: recent });
    if (err) return fail(err, err.startsWith("Too many") ? 429 : 400);
    const [gift] = await tx
      .insert(fundGifts)
      .values({
        groupId,
        name: input.name.trim().slice(0, 80) || "Well-wisher",
        phone: phone!,
        amount: String(amount),
        branch,
        message: input.message?.trim().slice(0, 140) || null,
        anonymous: Boolean(input.anonymous),
        source,
      })
      .returning({ id: fundGifts.id });
    return { giftId: gift.id, walletId: group.intasendWalletId, groupName: group.name };
  });
  if ("error" in checked) return checked;

  try {
    const res = await stkPushToWallet({ walletId: checked.walletId, amount, phoneNumber: phone!, apiRef: `fund-${groupId}-${checked.giftId}`, narrative: checked.groupName.slice(0, 22) });
    await withTenant(groupId, (tx) => tx.update(fundGifts).set({ externalId: res.invoice.invoice_id }).where(eq(fundGifts.id, checked.giftId)));
    return { giftId: checked.giftId, status: "pending" };
  } catch (e) {
    await withTenant(groupId, (tx) => tx.update(fundGifts).set({ status: "failed" }).where(eq(fundGifts.id, checked.giftId)));
    console.error(`[fund] gift ${checked.giftId}`, e);
    return fail("M-Pesa couldn't send the prompt. Try again in a moment.", 502);
  }
}

/** From the IntaSend webhook. Returns false when the invoice isn't a gift. Idempotent. */
export async function confirmGift(invoiceId: string, state: "COMPLETE" | "FAILED"): Promise<boolean> {
  const gift = await withPlatformAdmin((tx) => tx.query.fundGifts.findFirst({ where: eq(fundGifts.externalId, invoiceId) }));
  if (!gift) return false;
  const updated = await withTenant(gift.groupId, (tx) =>
    tx
      .update(fundGifts)
      .set(state === "COMPLETE" ? { status: "paid", paidAt: new Date() } : { status: "failed" })
      .where(and(eq(fundGifts.id, gift.id), eq(fundGifts.status, "pending")))
      .returning({ id: fundGifts.id }),
  );
  if (!updated.length) return true; // IntaSend resends; once is enough
  const fund = await withTenant(gift.groupId, (tx) => tx.query.funeralFunds.findFirst({ where: eq(funeralFunds.groupId, gift.groupId) }));
  if (state === "FAILED") {
    await dispatchWebhookEvent(gift.groupId, "fund.gift.failed", { fundId: gift.groupId, ref: fund?.ref, giftId: gift.id });
    return true;
  }
  const s = await fundSummary(gift.groupId);
  await dispatchWebhookEvent(gift.groupId, "fund.gift.paid", {
    fundId: gift.groupId,
    ref: fund?.ref,
    giftId: gift.id,
    name: gift.anonymous ? "Well-wisher" : gift.name,
    amount: Number(gift.amount),
    branch: gift.branch,
    message: gift.message,
    total: s?.total ?? null,
    giftCount: s?.giftCount ?? null,
    byBranch: s?.byBranch ?? [],
  });
  return true;
}

/** Daily: funds past their closing date stop taking gifts; the partner is told. */
export async function closeDueFunds(today = nairobiToday()): Promise<number> {
  const due = await withPlatformAdmin((tx) =>
    tx
      .update(funeralFunds)
      .set({ status: "closed", closedAt: new Date() })
      .where(and(eq(funeralFunds.status, "open"), lt(funeralFunds.closesOn, today)))
      .returning({ groupId: funeralFunds.groupId, ref: funeralFunds.ref }),
  );
  for (const f of due) {
    const s = await fundSummary(f.groupId);
    await dispatchWebhookEvent(f.groupId, "fund.closed", { fundId: f.groupId, ref: f.ref, total: s?.total ?? 0, giftCount: s?.giftCount ?? 0 });
  }
  return due.length;
}

/**
 * After the burial: the fund becomes a standing family welfare chama. The
 * committee stay as officials; each family member gets an invite (they
 * accept it themselves). Gifts stop; the wallet carries on.
 */
export async function convertFund(groupId: number, people: { name: string; phone: string }[]) {
  const template = SEGMENTS.welfare_funeral;
  const state = await withTenant(groupId, async (tx) => {
    const fund = await tx.query.funeralFunds.findFirst({ where: eq(funeralFunds.groupId, groupId) });
    const group = await tx.query.groups.findFirst({ where: eq(groups.id, groupId), columns: { name: true } });
    if (!fund || !group) return fail("Fund not found", 404);
    if (fund.status === "converted") return { already: true as const, groupName: group.name };
    await tx.update(funeralFunds).set({ status: "converted", closedAt: fund.closedAt ?? new Date() }).where(eq(funeralFunds.groupId, groupId));
    await tx.update(groups).set({ segment: "welfare_funeral", welfareEnabled: true, updatedAt: new Date() }).where(eq(groups.id, groupId));
    if (!(await tx.query.welfarePolicies.findFirst({ where: eq(welfarePolicies.groupId, groupId) })) && template.welfare) {
      await tx.insert(welfarePolicies).values({
        groupId,
        fundingMethod: "fixed_amount",
        fundingFixedAmount: String(template.welfare.fixedAmount),
        benefitSchedule: template.welfare.benefits ?? [],
        ...(template.welfare.benefits?.length ? { maxEmergencyGrant: String(Math.max(...template.welfare.benefits.map((b) => b.amount))) } : {}),
      });
      let n = 1;
      for (const rule of segmentRules("welfare_funeral")) {
        await tx.insert(rules).values({
          groupId,
          ruleNumber: String(n++).padStart(2, "0"),
          category: rule.category,
          title: rule.title,
          description: rule.description,
          penaltyAmount: rule.suggestedPenaltyAmount !== undefined ? String(rule.suggestedPenaltyAmount) : null,
        });
      }
    }
    return { already: false as const, groupName: group.name, partner: fund.partner };
  });
  if ("error" in state) return state;

  const results = [];
  const seen = new Set<string>();
  for (const p of people) {
    const phone = normalizePhone(p.phone);
    if (!phone || seen.has(phone)) {
      results.push({ phone: p.phone, invited: false, reason: phone ? "duplicate" : "invalid phone" });
      continue;
    }
    seen.add(phone);
    const r = await createGroupInvite({
      groupId,
      groupName: state.groupName,
      name: p.name.trim() || "Member",
      phone,
      email: null,
      role: "member",
      invitedBy: null,
      inviterName: state.groupName,
    });
    results.push({ phone, invited: "ok" in r, sms: "ok" in r ? r.smsSent : false, reason: "error" in r ? r.error : undefined });
  }
  return { groupId, status: "converted" as const, invites: results };
}

/** New signing secret for the fund's partner webhook; the old one stops working immediately. */
export async function rotateFundWebhookSecret(groupId: number): Promise<{ webhookSecret: string } | Fail> {
  const secret = randomBytes(32).toString("hex");
  const updated = await withTenant(groupId, (tx) =>
    tx
      .update(webhookEndpoints)
      .set({ secret })
      .where(and(eq(webhookEndpoints.groupId, groupId), sql`${webhookEndpoints.events} && array['fund.gift.paid']::webhook_event_type[]`))
      .returning({ id: webhookEndpoints.id }),
  );
  return updated.length ? { webhookSecret: secret } : fail("This fund has no webhook (no webhookUrl was given)", 409);
}
