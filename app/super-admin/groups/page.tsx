import { withPlatformAdmin } from "@/lib/db/rls";
import { PageHeader } from "@/components/feature/page-header";
import { SuperAdminGroupsManager } from "@/components/feature/super-admin-groups-manager";

export default async function SuperAdminGroupsPage() {
  const allGroups = await withPlatformAdmin((tx) =>
    tx.query.groups.findMany({ orderBy: (g, { desc }) => [desc(g.createdAt)] }),
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Groups" description="Every tenant group on the platform." />
      <SuperAdminGroupsManager groups={allGroups} />
    </div>
  );
}
