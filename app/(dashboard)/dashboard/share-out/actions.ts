"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import { runCommand } from "@/lib/commands/run";
import { actorFromSession } from "@/lib/commands/actor";
import { cancelShareOut, confirmShareOut, prepareShareOut } from "@/lib/commands/share-out";

type Result = { error: string } | { ok: true; message: string };

export async function prepareShareOutAction(input: unknown): Promise<Result> {
  const session = await requirePermission("shareout.manage");
  const r = await runCommand(actorFromSession(session), prepareShareOut, input);
  revalidatePath("/dashboard/share-out");
  return r.ok ? { ok: true, message: "Prepared. Another official must confirm it." } : { error: r.error };
}

export async function confirmShareOutAction(shareOutId: number): Promise<Result> {
  const session = await requirePermission("shareout.manage");
  const r = await runCommand(actorFromSession(session), confirmShareOut, { shareOutId });
  revalidatePath("/dashboard/share-out");
  return r.ok
    ? { ok: true, message: `Share-out confirmed: Ksh ${Math.round(r.data.totalPayout).toLocaleString("en-KE")} to pay out to ${r.data.members} members.` }
    : { error: r.error };
}

export async function cancelShareOutAction(shareOutId: number): Promise<Result> {
  const session = await requirePermission("shareout.manage");
  const r = await runCommand(actorFromSession(session), cancelShareOut, { shareOutId });
  revalidatePath("/dashboard/share-out");
  return r.ok ? { ok: true, message: "Cancelled." } : { error: r.error };
}
