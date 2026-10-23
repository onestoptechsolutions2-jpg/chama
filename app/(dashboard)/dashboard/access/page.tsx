import { and, eq, inArray } from "drizzle-orm";
import { requireActiveGroup } from "@/lib/auth/session";
import { GROUP_PERMISSIONS, can, permissionsForRole, type GroupPermission, type GroupRole } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { groupMemberships, users } from "@/lib/db/schema";
import { ROLE_LABELS } from "@/lib/domain/invites";
import { PageHeader } from "@/components/feature/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ROLES: GroupRole[] = ["admin", "treasurer", "secretary", "member"];

/**
 * Roles & access: the permission matrix (lib/auth/permissions.ts) in plain
 * words, plus who holds each office here. Everyone in the group can see it —
 * knowing who may touch the money is part of trusting it.
 */
export default async function AccessPage() {
  const session = await requireActiveGroup();
  const m = session.activeMembership;
  const holders = await db
    .select({ role: groupMemberships.role, name: users.name })
    .from(groupMemberships)
    .innerJoin(users, eq(users.id, groupMemberships.userId))
    .where(
      and(
        eq(groupMemberships.groupId, m.groupId),
        eq(groupMemberships.status, "active"),
        inArray(groupMemberships.role, ["admin", "treasurer", "secretary"]),
      ),
    );

  // Only permissions this group can use (product switched on).
  const relevant = (p: GroupPermission) => {
    const product = (GROUP_PERMISSIONS[p] as { product?: keyof typeof m.products }).product;
    return !product || m.products[product];
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Roles & access" description="Who can do what in this group." />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your role: {ROLE_LABELS[m.role]}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Nobody approves, pays out, waives or repays money for themselves — another official must do it. Every change is kept in
          the Activity log, including anything platform support does to help you.
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        {ROLES.map((role) => {
          const names = holders.filter((h) => h.role === role).map((h) => h.name);
          return (
            <Card key={role}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  {ROLE_LABELS[role]}
                  {role === m.role && <Badge>You</Badge>}
                </CardTitle>
                {role !== "member" && (
                  <p className="text-sm text-muted-foreground">{names.length ? names.join(", ") : "Nobody yet — invite one from Members."}</p>
                )}
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {permissionsForRole(role)
                    .filter(relevant)
                    .map((p) => (
                      <li key={p}>{GROUP_PERMISSIONS[p].label}</li>
                    ))}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {can(m, "members.manage") && (
        <p className="text-sm text-muted-foreground">Change someone&apos;s role on the Members page (More details → Role).</p>
      )}
    </div>
  );
}
