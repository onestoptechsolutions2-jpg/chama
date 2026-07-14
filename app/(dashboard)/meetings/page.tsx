import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { meetings } from "@/lib/db/schema";
import { PageHeader } from "@/components/feature/page-header";
import { MeetingsManager } from "@/components/feature/meetings-manager";

export default async function MeetingsPage() {
  const session = await requireRole("admin", "secretary", "treasurer");
  const groupId = session.activeMembership.groupId;

  const groupMeetings = await withTenant(groupId, (tx) =>
    tx.query.meetings.findMany({
      where: eq(meetings.groupId, groupId),
      orderBy: (m, { desc }) => [desc(m.meetingDate)],
    }),
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Meetings" description="Schedule meetings and track attendance." />
      <MeetingsManager meetings={groupMeetings} />
    </div>
  );
}
