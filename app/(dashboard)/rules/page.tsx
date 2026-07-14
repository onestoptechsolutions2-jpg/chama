import { and, eq } from "drizzle-orm";
import { requireActiveGroup } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { rules, groupMemberships } from "@/lib/db/schema";
import { PageHeader } from "@/components/feature/page-header";
import { RulesManager } from "@/components/feature/rules-manager";

export default async function RulesPage() {
  const session = await requireActiveGroup();
  const groupId = session.activeMembership.groupId;
  const isAdmin = session.activeMembership.role === "admin";

  const { groupRules, rulesAcceptedAt } = await withTenant(groupId, async (tx) => {
    const groupRules = await tx.query.rules.findMany({
      where: eq(rules.active, true),
      orderBy: (r, { asc }) => [asc(r.category), asc(r.ruleNumber)],
    });
    const membership = await tx.query.groupMemberships.findFirst({
      where: and(
        eq(groupMemberships.userId, session.user.id),
        eq(groupMemberships.groupId, groupId),
      ),
      columns: { rulesAcceptedAt: true },
    });
    return { groupRules, rulesAcceptedAt: membership?.rulesAcceptedAt ?? null };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rules"
        description="Group bylaws and the penalties attached to them."
      />
      <RulesManager rules={groupRules} isAdmin={isAdmin} rulesAcceptedAt={rulesAcceptedAt} />
    </div>
  );
}
