"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { groups, groupMemberships } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/session";
import { joinRequestSchema } from "@/lib/validation/groups";

export type JoinRequestState = { error: string } | { ok: true } | null;

export async function requestToJoinAction(
  _prev: JoinRequestState,
  formData: FormData,
): Promise<JoinRequestState> {
  const session = await requireSession();
  const parsed = joinRequestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { groupId, message } = parsed.data;

  const group = await db.query.groups.findFirst({
    where: and(
      eq(groups.id, groupId),
      eq(groups.isPublic, true),
      eq(groups.active, true),
      eq(groups.registrationComplete, true),
    ),
  });
  if (!group) {
    return { error: "This group isn't accepting join requests" };
  }

  const existing = await db.query.groupMemberships.findFirst({
    where: and(
      eq(groupMemberships.userId, session.user.id),
      eq(groupMemberships.groupId, groupId),
    ),
  });

  if (existing) {
    if (existing.status === "active") return { error: "You're already a member of this group" };
    if (existing.status === "pending") return { error: "You already have a pending request" };
    if (existing.status === "suspended") {
      return { error: "Your membership here is suspended — contact the group admin" };
    }
    // status === "rejected": allow re-requesting with a fresh message.
    await db
      .update(groupMemberships)
      .set({
        status: "pending",
        joinMessage: message || null,
        reviewedBy: null,
        reviewedAt: null,
      })
      .where(eq(groupMemberships.id, existing.id));
    revalidatePath(`/discover/${groupId}`);
    return { ok: true };
  }

  if (group.maxMembers) {
    const [{ activeCount }] = await db
      .select({ activeCount: count() })
      .from(groupMemberships)
      .where(and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.status, "active")));
    if (activeCount >= group.maxMembers) {
      return { error: "This group is full" };
    }
  }

  await db.insert(groupMemberships).values({
    userId: session.user.id,
    groupId,
    role: "member",
    status: "pending",
    joinMessage: message || null,
  });

  revalidatePath(`/discover/${groupId}`);
  return { ok: true };
}
