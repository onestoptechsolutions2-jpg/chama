import { and, asc, eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { groupMemberships } from "@/lib/db/schema";
import { PageHeader } from "@/components/feature/page-header";
import { PendingMembersManager } from "@/components/feature/pending-members-manager";

export default async function PendingMembersPage() {
  const session = await requireRole("admin", "treasurer");
  const groupId = session.activeMembership.groupId;

  const pending = await withTenant(groupId, (tx) =>
    tx.query.groupMemberships.findMany({
      where: and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.status, "pending")),
      with: { user: true },
      orderBy: (m) => [asc(m.createdAt)],
    }),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pending members"
        description="Review join requests for this group."
      />
      <PendingMembersManager pending={pending} />
    </div>
  );
}
