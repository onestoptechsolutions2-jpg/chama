import "server-only";
import { and, eq, gt, or, type SQL } from "drizzle-orm";
import { withPlatformAdmin, withTenant } from "@/lib/db/rls";
import { groupInvites } from "@/lib/db/schema";

export type MyInvite = { token: string; groupName: string; role: "admin" | "treasurer" | "secretary" | "member"; inviterName: string | null };

/** Live invites addressed to this person's phone or email (across groups — scoped to their own contacts). */
export async function listMyInvites(user: { phone: string | null; email: string | null }): Promise<MyInvite[]> {
  const contacts: SQL[] = [];
  if (user.phone) contacts.push(eq(groupInvites.phone, user.phone));
  if (user.email) contacts.push(eq(groupInvites.email, user.email.toLowerCase()));
  if (contacts.length === 0) return [];
  const rows = await withPlatformAdmin((tx) =>
    tx.query.groupInvites.findMany({
      where: and(eq(groupInvites.status, "pending"), gt(groupInvites.expiresAt, new Date()), or(...contacts)),
      with: { group: { columns: { name: true } }, inviter: { columns: { name: true } } },
      limit: 10,
    }),
  );
  return rows.map((r) => ({ token: r.token, groupName: r.group.name, role: r.role, inviterName: r.inviter?.name ?? null }));
}

/** Pending invites for the group's Members page. */
export async function listGroupInvites(groupId: number) {
  return withTenant(groupId, (tx) =>
    tx.query.groupInvites.findMany({
      where: and(eq(groupInvites.groupId, groupId), eq(groupInvites.status, "pending")),
      orderBy: (i, { desc }) => [desc(i.createdAt)],
    }),
  );
}
