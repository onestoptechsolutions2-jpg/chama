import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { groups } from "@/lib/db/schema";
import { PageHeader } from "@/components/feature/page-header";
import { SettingsManager } from "@/components/feature/settings-manager";

export default async function SettingsPage() {
  const session = await requireRole("admin", "treasurer", "secretary");
  const groupId = session.activeMembership.groupId;
  const isAdmin = session.activeMembership.role === "admin";

  const group = await withTenant(groupId, (tx) =>
    tx.query.groups.findFirst({ where: eq(groups.id, groupId) }),
  );
  if (!group) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description={isAdmin ? "Configure your group." : "View-only — ask an admin to make changes."}
      />
      <SettingsManager group={group} isAdmin={isAdmin} products={session.activeMembership.products} />
    </div>
  );
}
