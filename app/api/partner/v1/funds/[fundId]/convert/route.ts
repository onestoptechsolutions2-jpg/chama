import { convertFund, partnerFund } from "@/lib/funds/funds";
import { json, partnerAuth } from "@/lib/funds/partner-auth";
import { convertFundSchema } from "@/lib/validation/funds";

/** After the burial: keep the group going as a family welfare chama and invite the family. */
export async function POST(req: Request, { params }: { params: Promise<{ fundId: string }> }) {
  const partner = partnerAuth(req);
  if (typeof partner !== "string") return partner;
  const fundId = Number((await params).fundId);
  if (!(await partnerFund(partner, fundId))) return json({ error: "Fund not found" }, 404);
  const parsed = convertFundSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, 400);
  const r = await convertFund(fundId, parsed.data.members);
  return "error" in r ? json({ error: r.error }, r.status) : json(r);
}
