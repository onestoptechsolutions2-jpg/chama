"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { groupInvites } from "@/lib/db/schema";
import { createGroupInvite } from "@/lib/invites/create";
import { createInviteSchema } from "@/lib/validation/invites";
import { inviteRoleError } from "@/lib/domain/invites";

export type InviteActionState =
  | { error: string }
  | { ok: true; name: string; link: string; phone: string | null; smsSent: boolean }
  | null;

/**
 * Invites a person into the group by phone (or email) with a role. Reuses
 * their roster row if staff already added them; never creates an account —
 * the person joins with their own (existing or new) login. Officials can be
 * invited before registration is complete; that's how a new group gets its
 * Treasurer and Secretary.
 */
export async function createInviteAction(_prev: InviteActionState, formData: FormData): Promise<InviteActionState> {
  const session = await requirePermission("members.add");
  const parsed = createInviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const { name, phone, email, role, memberId } = parsed.data;
  const roleError = inviteRoleError(session.activeMembership, role);
  if (roleError) return { error: roleError };
  const r = await createGroupInvite({
    groupId: session.activeMembership.groupId,
    groupName: session.activeMembership.groupName,
    name,
    phone: phone ?? null,
    email: email ?? null,
    role,
    memberId,
    invitedBy: session.user.id,
    inviterName: session.user.name,
  });
  if ("error" in r) return r;
  const { link, smsSent } = r;

  revalidatePath("/dashboard/members");
  return { ok: true, name, link, phone: phone ?? null, smsSent };
}

export async function cancelInviteAction(inviteId: number): Promise<{ error: string } | null> {
  const session = await requirePermission("members.add");
  const groupId = session.activeMembership.groupId;
  await withTenant(groupId, (tx) =>
    tx
      .update(groupInvites)
      .set({ status: "cancelled" })
      .where(and(eq(groupInvites.id, inviteId), eq(groupInvites.groupId, groupId), eq(groupInvites.status, "pending"))),
  );
  revalidatePath("/dashboard/members");
  return null;
}
