import { desc, eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { apiKeys, webhookEndpoints, webhookDeliveries } from "@/lib/db/schema";
import { PageHeader } from "@/components/feature/page-header";
import { DeveloperManager } from "@/components/feature/developer-manager";

const RECENT_DELIVERIES_LIMIT = 20;

export default async function DeveloperPage() {
  const session = await requireRole("admin");
  const groupId = session.activeMembership.groupId;

  // Independent withTenant calls, not one shared transaction — see
  // docs/architecture.md's transaction-wrapper rule.
  const [keys, endpoints, recentDeliveries] = await Promise.all([
    withTenant(groupId, (tx) =>
      tx.query.apiKeys.findMany({
        where: eq(apiKeys.groupId, groupId),
        orderBy: (k, { desc }) => [desc(k.createdAt)],
      }),
    ),
    withTenant(groupId, (tx) =>
      tx.query.webhookEndpoints.findMany({
        where: eq(webhookEndpoints.groupId, groupId),
        orderBy: (e, { desc }) => [desc(e.createdAt)],
      }),
    ),
    withTenant(groupId, (tx) =>
      tx
        .select()
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.groupId, groupId))
        .orderBy(desc(webhookDeliveries.attemptedAt))
        .limit(RECENT_DELIVERIES_LIMIT),
    ),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Developer"
        description="API keys and webhook endpoints for integrating other systems with this group's data. See docs/api.md for the full contract."
      />
      <DeveloperManager keys={keys} endpoints={endpoints} recentDeliveries={recentDeliveries} />
    </div>
  );
}
