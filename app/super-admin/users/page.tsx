import { withPlatformAdmin } from "@/lib/db/rls";
import { requirePlatformPermission } from "@/lib/auth/session";
import { canPlatform, isPlatformStaff } from "@/lib/auth/permissions";
import { Card, CardContent } from "@/components/ui/card";
import { normalizeEmail, normalizePhone } from "@/lib/domain/identity";
import { PageHeader } from "@/components/feature/page-header";
import { SuperAdminUsersManager } from "@/components/feature/super-admin-users-manager";
import { DuplicateUsersPanel, type DuplicateSet } from "@/components/feature/duplicate-users-panel";
import { MergeAccountsBox } from "@/components/feature/merge-accounts-box";
import type { MergeCandidate } from "@/lib/domain/merge-preview";

export default async function SuperAdminUsersPage() {
  const session = await requirePlatformPermission("platform.users.manage");
  const canMerge = canPlatform(session.user.platformRole, "platform.users.merge");
  const [platformUsers, auditLogs, membershipCounts, mergeMemberships, mergeMemberRows] = await withPlatformAdmin(async (tx) => {
    const usersList = await tx.query.users.findMany({
      orderBy: (u, { desc }) => [desc(u.createdAt)],
    });
    const logs = await tx.query.platformUserAuditLogs.findMany({
      orderBy: (row, { desc }) => [desc(row.createdAt)],
      limit: 20,
    });
    const memberships = await tx.query.groupMemberships.findMany({ columns: { userId: true } });
    // Only for owners, who are the only ones who can merge: each account's groups, roles and savings records.
    const detailed = canMerge
      ? await tx.query.groupMemberships.findMany({
          columns: { userId: true, groupId: true, role: true, status: true },
          with: { group: { columns: { name: true } } },
        })
      : [];
    const memberRows = canMerge ? await tx.query.members.findMany({ columns: { userId: true, groupId: true } }) : [];
    return [usersList, logs, memberships, detailed, memberRows] as const;
  });

  // Platform staff must not belong to groups; older accounts may still have
  // memberships (they're ignored at sign-in). List them so they get tidied.
  const activeMembershipUsers = new Set(
    (await withPlatformAdmin((tx) => tx.query.groupMemberships.findMany({ where: (m, { inArray }) => inArray(m.status, ["active", "pending"]), columns: { userId: true } }))).map((m) => m.userId),
  );
  const staffInGroups = platformUsers.filter((u) => isPlatformStaff(u.platformRole) && activeMembershipUsers.has(u.id));

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

  const savings = new Set(mergeMemberRows.filter((m) => m.userId !== null).map((m) => `${m.userId}:${m.groupId}`));
  const mergeCandidates: MergeCandidate[] = canMerge
    ? platformUsers.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        platformRole: u.platformRole,
        active: u.active,
        memberships: mergeMemberships
          .filter((m) => m.userId === u.id)
          .map((m) => ({ groupId: m.groupId, groupName: m.group.name, role: m.role, status: m.status, hasMemberRow: savings.has(`${u.id}:${m.groupId}`) })),
      }))
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform users"
        description="Manage who can access the cross-tenant super-admin surface."
      />
      {staffInGroups.length > 0 && (
        <Card className="border-amber-500/50">
          <CardContent className="space-y-1 pt-6 text-sm">
            <p className="font-medium">Platform staff still listed in groups</p>
            <p className="text-muted-foreground">
              Staff accounts can&apos;t act as group members — these memberships are ignored at sign-in. Hand their group roles
              to someone else (in support mode, Members → role), then remove them from the group; if they are also a real member,
              they should use a separate personal account.
            </p>
            <ul className="list-disc pl-5">
              {staffInGroups.map((u) => (
                <li key={u.id}>
                  {u.name} ({u.platformRole})
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      <DuplicateUsersPanel sets={duplicateSets} canMerge={canMerge} />
      {canMerge && <MergeAccountsBox candidates={mergeCandidates} />}
      <SuperAdminUsersManager users={platformUsers} auditLogs={auditLogs} />
    </div>
  );
}
