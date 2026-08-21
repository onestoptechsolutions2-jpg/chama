import { withPlatformAdmin } from "@/lib/db/rls";
import { users } from "@/lib/db/schema";
import { PageHeader } from "@/components/feature/page-header";
import { SuperAdminUsersManager } from "@/components/feature/super-admin-users-manager";

export default async function SuperAdminUsersPage() {
  const platformUsers = await withPlatformAdmin((tx) =>
    tx.query.users.findMany({
      orderBy: (u, { desc }) => [desc(u.createdAt)],
    }),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform users"
        description="Manage who can access the cross-tenant super-admin surface."
      />
      <SuperAdminUsersManager users={platformUsers} />
    </div>
  );
}
