import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { groupDocuments, complianceObligations } from "@/lib/db/schema";
import { PageHeader } from "@/components/feature/page-header";
import { GovernanceManager } from "@/components/feature/governance-manager";

export default async function GovernancePage() {
  const session = await requireRole("admin", "secretary");
  const groupId = session.activeMembership.groupId;

  const [documents, obligations] = await Promise.all([
    withTenant(groupId, (tx) =>
      tx.query.groupDocuments.findMany({
        where: eq(groupDocuments.groupId, groupId),
        orderBy: (d, { desc }) => [desc(d.createdAt)],
      }),
    ),
    withTenant(groupId, (tx) =>
      tx.query.complianceObligations.findMany({
        where: eq(complianceObligations.groupId, groupId),
        orderBy: (o, { asc }) => [asc(o.dueDate)],
      }),
    ),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Governance"
        description="Group documents and compliance obligations — constitution, bank details, AGM and annual-returns reminders."
      />
      <GovernanceManager documents={documents} obligations={obligations} />
    </div>
  );
}
