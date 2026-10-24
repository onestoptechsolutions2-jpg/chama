import "server-only";
import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { withTenant } from "@/lib/db/rls";
import { groups, members, welfareRequests } from "@/lib/db/schema";
import { signedHeaders } from "@/lib/webhooks/dispatch";
import { sendSms } from "@/lib/notify/sms";

/** Family Compass referrals are on when both settings are present. */
export function funeralOfferEnabled(): boolean {
  return Boolean(process.env.FAMILY_COMPASS_REFERRAL_URL && process.env.FAMILY_COMPASS_REFERRAL_SECRET);
}

/**
 * A bereavement claim was approved and the claimant ticked "Family Compass
 * may send me an offer". Tell Family Compass which group referred it (the
 * group earns their referral commission, paid to its nominated account) and
 * text the claimant the link Family Compass returns. No personal details go
 * to Family Compass; the claimant decides whether to open the link.
 */
export async function referBereavement(groupId: number, requestId: number): Promise<void> {
  if (!funeralOfferEnabled()) return;
  try {
    const ctx = await withTenant(groupId, async (tx) => {
      const req = await tx.query.welfareRequests.findFirst({ where: and(eq(welfareRequests.id, requestId), eq(welfareRequests.groupId, groupId)) });
      if (!req || req.reason !== "bereavement" || !req.partnerContactOk) return null;
      const member = await tx.query.members.findFirst({ where: eq(members.id, req.memberId), columns: { phone: true } });
      const group = await tx.query.groups.findFirst({ where: eq(groups.id, groupId), columns: { name: true, payoutDestination: true } });
      return member?.phone && group ? { phone: member.phone, group, beneficiary: req.beneficiaryName } : null;
    });
    if (!ctx) return;

    const url = process.env.FAMILY_COMPASS_REFERRAL_URL!;
    const body = JSON.stringify({
      eventId: randomUUID(),
      event: "bereavement.approved",
      groupId,
      groupName: ctx.group.name,
      referrerCode: `chama-${groupId}`,
      payout: ctx.group.payoutDestination ?? null,
    });
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...signedHeaders(process.env.FAMILY_COMPASS_REFERRAL_SECRET!, body) },
      body,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Family Compass responded ${res.status}`);
    const { link } = (await res.json()) as { link?: string };
    // Only ever text a link on Family Compass's own site.
    if (!link || new URL(link).origin !== new URL(url).origin) throw new Error("Family Compass returned no usable link");
    const forWhom = ctx.beneficiary ? ` for ${ctx.beneficiary}` : "";
    await sendSms(groupId, ctx.phone, `Pole sana from ${ctx.group.name}. If it helps, Family Compass can prepare a funeral programme${forWhom}: ${link}`);
  } catch (e) {
    console.error(`[referral] welfare request ${requestId}`, e);
  }
}
