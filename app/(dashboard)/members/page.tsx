import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { members } from "@/lib/db/schema";
import { PageHeader } from "@/components/feature/page-header";
import { MembersManager } from "@/components/feature/members-manager";

export default async function MembersPage() {
  const session = await requireRole("admin", "treasurer", "secretary");
  const groupId = session.activeMembership.groupId;
  const canEdit = ["admin", "treasurer"].includes(session.activeMembership.role);
  const isAdmin = session.activeMembership.role === "admin";
  const showWelfare = ["welfare", "hybrid"].includes(session.activeMembership.groupType);

  const groupMembers = await withTenant(groupId, (tx) =>
    tx.query.members.findMany({
      where: eq(members.active, true),
      orderBy: (m, { asc }) => [asc(m.name)],
    }),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Members"
        description="Group members and their savings balances."
      />
      <MembersManager
        members={groupMembers}
        canEdit={canEdit}
        isAdmin={isAdmin}
        showWelfare={showWelfare}
      />
    </div>
  );
}
