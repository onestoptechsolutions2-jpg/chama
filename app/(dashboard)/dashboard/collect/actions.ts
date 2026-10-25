"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import { runCommand } from "@/lib/commands/run";
import { actorFromSession } from "@/lib/commands/actor";
import { recordMeetingCollections } from "@/lib/commands/meeting";

export type CollectInput = {
  entries: { memberId: number; type: "capital" | "personal_savings" | "welfare" | "mgr"; amount: number }[];
  repayments: { loanId: number; amount: number }[];
  reference?: string;
};

export async function recordMeetingAction(input: CollectInput): Promise<{ error: string } | { ok: true; total: number; count: number }> {
  const session = await requirePermission("money.record");
  const reference = input.reference?.trim() || undefined;
  const result = await runCommand(actorFromSession(session), recordMeetingCollections, {
    entries: input.entries.map((e) => ({ ...e, reference })),
    repayments: input.repayments.map((r) => ({ ...r, reference })),
  });
  if (!result.ok) return { error: result.error };
  revalidatePath("/dashboard/members");
  revalidatePath("/dashboard/collect");
  return { ok: true, total: result.data.total, count: result.data.contributions.length + result.data.repayments.length };
}
