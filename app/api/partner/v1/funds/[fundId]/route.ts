import { fundSummary, partnerFund } from "@/lib/funds/funds";
import { json, partnerAuth } from "@/lib/funds/partner-auth";

/** Live totals for a fund: total, gift count, per family branch, recent gifts. */
export async function GET(req: Request, { params }: { params: Promise<{ fundId: string }> }) {
  const partner = partnerAuth(req);
  if (typeof partner !== "string") return partner;
  const fundId = Number((await params).fundId);
  if (!(await partnerFund(partner, fundId))) return json({ error: "Fund not found" }, 404);
  return json(await fundSummary(fundId));
}
