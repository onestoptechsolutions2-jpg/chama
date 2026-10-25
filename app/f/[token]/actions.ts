"use server";

import { fundByToken, startGift } from "@/lib/funds/funds";
import { giftSchema } from "@/lib/validation/funds";
import { LIMITS, TOO_MANY, clientIp, hit } from "@/lib/auth/rate-limit";

/** Public: a mourner gives from the fund's page. Sends an M-Pesa prompt; nothing counts until they pay. */
export async function giveAction(token: string, input: unknown): Promise<{ error: string } | { ok: true }> {
  if (!(await hit(`give-ip:${await clientIp()}`, LIMITS.givePerIp.limit, LIMITS.givePerIp.windowSeconds))) return { error: TOO_MANY };
  const fund = await fundByToken(token);
  if (!fund) return { error: "This fund link isn't valid" };
  const parsed = giftSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form" };
  const r = await startGift(fund.groupId, parsed.data, "web");
  return "error" in r ? { error: r.error } : { ok: true };
}
