"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import { runCommand } from "@/lib/commands/run";
import { actorFromSession } from "@/lib/commands/actor";
import { issueFine, settleFine } from "@/lib/commands/fines";

export type FineActionState = { error: string } | null;

export async function createFineAction(
  _prev: FineActionState,
  formData: FormData,
): Promise<FineActionState> {
  const session = await requirePermission("fines.issue");
  const result = await runCommand(actorFromSession(session), issueFine, {
    memberId: formData.get("memberId"),
    type: formData.get("type"),
    amount: formData.get("amount"),
    reason: formData.get("reason") ?? undefined,
  });
  if (!result.ok) return { error: result.error };
  revalidatePath("/dashboard/fines");
  return null;
}

/** Marks a pending fine paid or waived, and reverses its charge off the member's total. */
export async function resolveFineAction(fineId: number, status: "paid" | "waived"): Promise<{ error: string } | null> {
  const session = await requirePermission("fines.settle");
  const result = await runCommand(actorFromSession(session), settleFine, { fineId, status });
  revalidatePath("/dashboard/fines");
  return result.ok ? null : { error: result.error };
}
