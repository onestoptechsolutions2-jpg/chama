import Link from "next/link";
import { eq } from "drizzle-orm";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { groupDocuments, complianceObligations } from "@/lib/db/schema";
import { PageHeader } from "@/components/feature/page-header";
import { GovernanceManager } from "@/components/feature/governance-manager";

export default async function GovernancePage() {
  const session = await requirePermission("governance.manage");
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
      <Link
        href="/print/registration-pack"
        className={cn(buttonVariants({ variant: "outline" }), "h-auto w-full whitespace-normal py-3 text-left sm:w-auto")}
      >
        Registration pack — constitution, officials, member register, minutes (print or PDF)
      </Link>
      <GovernanceManager documents={documents} obligations={obligations} />
    </div>
  );
}
