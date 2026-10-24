import { partnerFund, startGift } from "@/lib/funds/funds";
import { json, partnerAuth } from "@/lib/funds/partner-auth";
import { giftSchema } from "@/lib/validation/funds";

/** Send an M-Pesa prompt to a mourner's phone. The result arrives as a fund.gift.paid / fund.gift.failed webhook. */
export async function POST(req: Request, { params }: { params: Promise<{ fundId: string }> }) {
  const partner = partnerAuth(req);
  if (typeof partner !== "string") return partner;
  const fundId = Number((await params).fundId);
  if (!(await partnerFund(partner, fundId))) return json({ error: "Fund not found" }, 404);
  const parsed = giftSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, 400);
  const r = await startGift(fundId, parsed.data, "partner");
  return "error" in r ? json({ error: r.error }, r.status) : json(r, 202);
}
