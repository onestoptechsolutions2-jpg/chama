import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { fines, members } from "@/lib/db/schema";
import { PageHeader } from "@/components/feature/page-header";
import { FinesManager } from "@/components/feature/fines-manager";

export default async function FinesPage() {
  const session = await requireRole("admin", "treasurer", "secretary");
  const groupId = session.activeMembership.groupId;
  const canResolve = ["admin", "treasurer"].includes(session.activeMembership.role);

  const [groupFines, groupMembers] = await withTenant(groupId, (tx) =>
    Promise.all([
      tx.query.fines.findMany({
        where: eq(fines.groupId, groupId),
        with: { member: true },
        orderBy: (f, { desc }) => [desc(f.createdAt)],
      }),
      tx.query.members.findMany({
        where: eq(members.active, true),
        orderBy: (m, { asc }) => [asc(m.name)],
      }),
    ]),
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Fines" description="Track and resolve member fines." />
      <FinesManager fines={groupFines} members={groupMembers} canResolve={canResolve} />
    </div>
  );
}
