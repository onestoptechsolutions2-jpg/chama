import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { meetings, members, attendance } from "@/lib/db/schema";
import { PageHeader } from "@/components/feature/page-header";
import { AttendanceForm } from "@/components/feature/attendance-form";

export default async function MeetingAttendancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const meetingId = Number(id);
  const session = await requireRole("admin", "secretary", "treasurer");
  const groupId = session.activeMembership.groupId;

  const [meeting, groupMembers, existingAttendance] = await withTenant(groupId, (tx) =>
    Promise.all([
      tx.query.meetings.findFirst({
        where: and(eq(meetings.id, meetingId), eq(meetings.groupId, groupId)),
      }),
      tx.query.members.findMany({
        where: eq(members.active, true),
        orderBy: (m, { asc }) => [asc(m.name)],
      }),
      tx.query.attendance.findMany({
        where: eq(attendance.meetingId, meetingId),
      }),
    ]),
  );

  if (!meeting) notFound();

  const statusByMember = new Map(existingAttendance.map((a) => [a.memberId, a.status]));

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Attendance — ${meeting.meetingDate}`}
        description={`${meeting.meetingType} meeting${meeting.venue ? ` at ${meeting.venue}` : ""}. Marking a member absent or late automatically issues a fine.`}
      />
      <AttendanceForm
        meetingId={meeting.id}
        members={groupMembers}
        initialStatus={Object.fromEntries(statusByMember)}
      />
    </div>
  );
}
