import { partnerFund, rotateFundWebhookSecret } from "@/lib/funds/funds";
import { json, partnerAuth } from "@/lib/funds/partner-auth";

/**
 * Issues a new webhook secret for a fund (the old one stops working at once).
 * For a partner that lost the 201 that carried the first one.
 */
export async function POST(req: Request, { params }: { params: Promise<{ fundId: string }> }) {
  const partner = partnerAuth(req);
  if (typeof partner !== "string") return partner;
  const fundId = Number((await params).fundId);
  if (!(await partnerFund(partner, fundId))) return json({ error: "Fund not found" }, 404);
  const r = await rotateFundWebhookSecret(fundId);
  return "error" in r ? json({ error: r.error }, r.status) : json(r);
}
