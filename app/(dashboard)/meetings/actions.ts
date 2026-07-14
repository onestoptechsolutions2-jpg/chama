"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { meetings, attendance, members, fines, groups } from "@/lib/db/schema";
import { createMeetingSchema, saveAttendanceSchema } from "@/lib/validation/meetings";
import { attendanceStatusToFineType } from "@/lib/domain/fines";

export type MeetingActionState = { error: string } | null;

export async function createMeetingAction(
  _prev: MeetingActionState,
  formData: FormData,
): Promise<MeetingActionState> {
  const session = await requireRole("admin", "secretary", "treasurer");

  const parsed = createMeetingSchema.safeParse({
    meetingDate: formData.get("meetingDate"),
    meetingType: formData.get("meetingType"),
    venue: formData.get("venue"),
    agenda: formData.get("agenda"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { meetingDate, meetingType, venue, agenda } = parsed.data;
  const groupId = session.activeMembership.groupId;

  await withTenant(groupId, (tx) =>
    tx.insert(meetings).values({
      groupId,
      meetingDate,
      meetingType,
      venue: venue || null,
      agenda: agenda || null,
      createdBy: session.user.id,
    }),
  );

  revalidatePath("/meetings");
  return null;
}

/**
 * Bulk-saves attendance for a meeting. Auto-fines members marked absent/late
 * using attendanceStatusToFineType() (the bug-3 fix — the original app
 * inserted fines.type='absent'/'late' directly, which violated the CHECK
 * constraint on every single submission). Re-saving the same meeting's
 * attendance does not double-fine: a fine is only issued the first time a
 * given attendance row's fineIssued flag is false.
 */
export async function saveAttendanceAction(
  meetingId: number,
  records: { memberId: number; status: string }[],
): Promise<{ error: string } | { ok: true }> {
  const session = await requireRole("admin", "secretary", "treasurer");
  const parsed = saveAttendanceSchema.safeParse(records);
  if (!parsed.success) {
    return { error: "Invalid attendance data" };
  }
  const groupId = session.activeMembership.groupId;

  await withTenant(groupId, async (tx) => {
    const meeting = await tx.query.meetings.findFirst({
      where: and(eq(meetings.id, meetingId), eq(meetings.groupId, groupId)),
    });
    if (!meeting) return;

    const group = await tx.query.groups.findFirst({ where: eq(groups.id, groupId) });
    if (!group) return;

    for (const record of parsed.data) {
      const [row] = await tx
        .insert(attendance)
        .values({
          groupId,
          meetingId,
          memberId: record.memberId,
          status: record.status,
        })
        .onConflictDoUpdate({
          target: [attendance.meetingId, attendance.memberId],
          set: { status: record.status },
        })
        .returning();

      if ((record.status === "absent" || record.status === "late") && !row.fineIssued) {
        const fineType = attendanceStatusToFineType(record.status);
        const amount =
          fineType === "absence" ? group.fineAbsence : group.fineLateness;

        await tx.insert(fines).values({
          groupId,
          memberId: record.memberId,
          type: fineType,
          amount,
          reason: `${fineType === "absence" ? "Absence" : "Lateness"} — meeting on ${meeting.meetingDate}`,
          recordedBy: session.user.id,
        });

        await tx
          .update(members)
          .set({ totalFines: sql`${members.totalFines} + ${amount}`, updatedAt: new Date() })
          .where(eq(members.id, record.memberId));

        await tx
          .update(attendance)
          .set({ fineIssued: true })
          .where(eq(attendance.id, row.id));
      }
    }
  });

  revalidatePath(`/meetings/${meetingId}`);
  revalidatePath("/fines");
  return { ok: true };
}
