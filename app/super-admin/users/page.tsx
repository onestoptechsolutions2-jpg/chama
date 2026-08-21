import { withPlatformAdmin } from "@/lib/db/rls";
import { users } from "@/lib/db/schema";
import { platformUserAuditLogs } from "@/lib/db/schema";
import { PageHeader } from "@/components/feature/page-header";
import { SuperAdminUsersManager } from "@/components/feature/super-admin-users-manager";
import { desc } from "drizzle-orm";

export default async function SuperAdminUsersPage() {
  const [platformUsers, auditLogs] = await withPlatformAdmin(async (tx) => {
    const usersList = await tx.query.users.findMany({
      orderBy: (u, { desc }) => [desc(u.createdAt)],
    });
    const logs = await tx.query.platformUserAuditLogs.findMany({
      orderBy: (row, { desc }) => [desc(row.createdAt)],
      limit: 20,
    });
    return [usersList, logs] as const;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform users"
        description="Manage who can access the cross-tenant super-admin surface."
      />
      <SuperAdminUsersManager users={platformUsers} auditLogs={auditLogs} />
    </div>
  );
}
