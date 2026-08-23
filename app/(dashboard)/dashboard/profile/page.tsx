import { and, eq } from "drizzle-orm";
import { requireActiveGroup } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { members } from "@/lib/db/schema";
import { PageHeader } from "@/components/feature/page-header";
import { ProfileForm } from "@/components/feature/profile-form";
import { MyGroupsList } from "@/components/feature/my-groups-list";
import { Card, CardContent } from "@/components/ui/card";

export default async function ProfilePage() {
  const session = await requireActiveGroup();
  const groupId = session.activeMembership.groupId;
  const memberId = session.activeMembership.memberId;

  const member = memberId
    ? await withTenant(groupId, (tx) =>
        tx.query.members.findFirst({
          where: and(eq(members.id, memberId), eq(members.groupId, groupId)),
        }),
      )
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Profile"
        description="Filled in once, reused automatically for every other group you belong to."
      />
      <MyGroupsList memberships={session.memberships} activeGroupId={session.activeGroupId} />
      {member ? (
        <ProfileForm member={member} role={session.activeMembership.role} />
      ) : (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            You don&apos;t have a financial profile linked in this group yet — ask an admin to
            link your account to a member record.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
