import { and, desc, eq } from "drizzle-orm";
import { requireActiveGroup } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { notifications } from "@/lib/db/schema";
import { PageHeader } from "@/components/feature/page-header";
import { NotificationsManager } from "@/components/feature/notifications-manager";

const RECENT_LIMIT = 50;

export default async function NotificationsPage() {
  const session = await requireActiveGroup();
  const groupId = session.activeMembership.groupId;

  const items = await withTenant(groupId, (tx) =>
    tx.query.notifications.findMany({
      where: and(eq(notifications.groupId, groupId), eq(notifications.userId, session.user.id)),
      orderBy: [desc(notifications.createdAt)],
      limit: RECENT_LIMIT,
    }),
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Notifications" description="Updates from this group, most recent first." />
      <NotificationsManager notifications={items} />
    </div>
  );
}
