import { and, eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { members, groupMemberships } from "@/lib/db/schema";
import { PageHeader } from "@/components/feature/page-header";
import { MembersManager } from "@/components/feature/members-manager";

export default async function MembersPage() {
  const session = await requireRole("admin", "treasurer", "secretary");
  const groupId = session.activeMembership.groupId;
  const canEdit = ["admin", "treasurer"].includes(session.activeMembership.role);
  const isAdmin = session.activeMembership.role === "admin";
  const showWelfare = ["welfare", "hybrid"].includes(session.activeMembership.groupType);

  const { groupMembers, membershipByUserId } = await withTenant(groupId, async (tx) => {
    const groupMembers = await tx.query.members.findMany({
      where: eq(members.active, true),
      orderBy: (m, { asc }) => [asc(m.name)],
    });

    // Role lives on group_memberships, not members — only members with a
    // linked login (userId) have one to assign. Only isAdmin needs this,
    // but it's cheap and keeps the query shape simple either way.
    const activeMemberships = await tx.query.groupMemberships.findMany({
      where: and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.status, "active")),
    });
    const membershipByUserId = new Map(activeMemberships.map((m) => [m.userId, m]));

    return { groupMembers, membershipByUserId };
  });

  const membersWithRole = groupMembers.map((m) => ({
    ...m,
    membership: m.userId ? (membershipByUserId.get(m.userId) ?? null) : null,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Members"
        description="Group members and their savings balances."
      />
      <MembersManager
        members={membersWithRole}
        canEdit={canEdit}
        isAdmin={isAdmin}
        showWelfare={showWelfare}
      />
    </div>
  );
}
