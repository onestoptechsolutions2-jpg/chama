import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { groups } from "@/lib/db/schema";
import { getOrCreateWelfarePolicy } from "@/app/(dashboard)/dashboard/welfare/welfare-data";
import { PageHeader } from "@/components/feature/page-header";
import { SettingsManager } from "@/components/feature/settings-manager";

export default async function SettingsPage() {
  const session = await requireRole("admin", "treasurer", "secretary");
  const groupId = session.activeMembership.groupId;
  const isAdmin = session.activeMembership.role === "admin";
  const products = session.activeMembership.products;

  const group = await withTenant(groupId, (tx) =>
    tx.query.groups.findFirst({ where: eq(groups.id, groupId) }),
  );
  if (!group) return null;

  const welfarePolicy = products.welfare
    ? await withTenant(groupId, (tx) => getOrCreateWelfarePolicy(tx, groupId))
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description={isAdmin ? "Configure your group." : "View-only — ask an admin to make changes."}
      />
      <SettingsManager group={group} isAdmin={isAdmin} products={products} welfarePolicy={welfarePolicy} />
    </div>
  );
}
