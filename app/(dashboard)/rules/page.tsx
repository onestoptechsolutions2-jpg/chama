import { eq } from "drizzle-orm";
import { requireActiveGroup } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { rules } from "@/lib/db/schema";
import { PageHeader } from "@/components/feature/page-header";
import { RulesManager } from "@/components/feature/rules-manager";

export default async function RulesPage() {
  const session = await requireActiveGroup();
  const groupId = session.activeMembership.groupId;
  const isAdmin = session.activeMembership.role === "admin";

  const groupRules = await withTenant(groupId, (tx) =>
    tx.query.rules.findMany({
      where: eq(rules.active, true),
      orderBy: (r, { asc }) => [asc(r.category), asc(r.ruleNumber)],
    }),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rules"
        description="Group bylaws and the penalties attached to them."
      />
      <RulesManager rules={groupRules} isAdmin={isAdmin} />
    </div>
  );
}
