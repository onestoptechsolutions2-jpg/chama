import { createFund } from "@/lib/funds/funds";
import { json, partnerAuth } from "@/lib/funds/partner-auth";
import { createFundSchema } from "@/lib/validation/funds";

/** Create a funeral fund (idempotent on `ref`). See docs/api.md "Partner API". */
export async function POST(req: Request) {
  const partner = partnerAuth(req);
  if (typeof partner !== "string") return partner;
  const parsed = createFundSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid body", path: parsed.error.issues[0]?.path }, 400);
  const r = await createFund(partner, parsed.data);
  if ("error" in r) return json({ error: r.error }, r.status);
  return json({ ...r.fund, ...(r.created ? { webhookSecret: r.webhookSecret, invites: r.invites } : {}) }, r.created ? 201 : 200);
}
