import { withPlatformAdmin } from "@/lib/db/rls";
import { PageHeader } from "@/components/feature/page-header";
import { SuperAdminGroupsManager } from "@/components/feature/super-admin-groups-manager";

export default async function SuperAdminGroupsPage() {
  const [allGroups, platformUsers, activities] = await withPlatformAdmin(async (tx) => {
    const groupRows = await tx.query.groups.findMany({ orderBy: (g, { desc }) => [desc(g.createdAt)] });
    const userRows = await tx.query.users.findMany({ where: (u, { isNotNull }) => isNotNull(u.platformRole) });
    const activityRows = await tx.query.groupAccountActivities.findMany({
      orderBy: (activity, { desc }) => [desc(activity.createdAt)],
      limit: 100,
    });
    return [groupRows, userRows, activityRows] as const;
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Groups" description="Every tenant group on the platform." />
      <SuperAdminGroupsManager groups={allGroups} platformUsers={platformUsers} activities={activities} />
    </div>
  );
}
