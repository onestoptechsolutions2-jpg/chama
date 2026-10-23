import { withPlatformAdmin } from "@/lib/db/rls";
import { requirePlatformPermission } from "@/lib/auth/session";
import { canPlatform } from "@/lib/auth/permissions";
import { normalizeEmail, normalizePhone } from "@/lib/domain/identity";
import { PageHeader } from "@/components/feature/page-header";
import { SuperAdminUsersManager } from "@/components/feature/super-admin-users-manager";
import { DuplicateUsersPanel, type DuplicateSet } from "@/components/feature/duplicate-users-panel";

export default async function SuperAdminUsersPage() {
  const session = await requirePlatformPermission("platform.users.manage");
  const [platformUsers, auditLogs, membershipCounts] = await withPlatformAdmin(async (tx) => {
    const usersList = await tx.query.users.findMany({
      orderBy: (u, { desc }) => [desc(u.createdAt)],
    });
    const logs = await tx.query.platformUserAuditLogs.findMany({
      orderBy: (row, { desc }) => [desc(row.createdAt)],
      limit: 20,
    });
    const memberships = await tx.query.groupMemberships.findMany({ columns: { userId: true } });
    return [usersList, logs, memberships] as const;
  });

  const groupsPerUser = new Map<number, number>();
  for (const m of membershipCounts) groupsPerUser.set(m.userId, (groupsPerUser.get(m.userId) ?? 0) + 1);

  // Group active accounts by canonical phone and by lowercased email.
  const buckets = new Map<string, typeof platformUsers>();
  for (const u of platformUsers.filter((x) => x.active)) {
    for (const key of [normalizePhone(u.phone), normalizeEmail(u.email)]) {
      if (!key) continue;
      buckets.set(key, [...(buckets.get(key) ?? []), u]);
    }
  }
  const seen = new Set<string>();
  const duplicateSets: DuplicateSet[] = [];
  for (const [key, list] of buckets) {
    if (list.length < 2) continue;
    const id = list.map((u) => u.id).sort().join("-");
    if (seen.has(id)) continue;
    seen.add(id);
    duplicateSets.push({
      key,
      users: list.map((u) => ({
        id: u.id,
        name: u.name,
        phone: u.phone,
        email: u.email,
        createdAt: u.createdAt.toISOString(),
        groups: groupsPerUser.get(u.id) ?? 0,
      })),
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform users"
        description="Manage who can access the cross-tenant super-admin surface."
      />
      <DuplicateUsersPanel sets={duplicateSets} canMerge={canPlatform(session.user.platformRole, "platform.users.merge")} />
      <SuperAdminUsersManager users={platformUsers} auditLogs={auditLogs} />
    </div>
  );
}
