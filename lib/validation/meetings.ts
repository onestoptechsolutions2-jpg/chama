import { z } from "zod";

export const meetingTypes = ["regular", "special", "emergency", "agm"] as const;
export const attendanceStatuses = ["present", "absent", "late", "excused"] as const;

export const createMeetingSchema = z.object({
  meetingDate: z.string().min(1, "Date is required"),
  meetingType: z.enum(meetingTypes),
  venue: z.string().trim().optional().or(z.literal("")),
  agenda: z.string().trim().optional().or(z.literal("")),
});

export const attendanceRecordSchema = z.object({
  memberId: z.number().int().positive(),
  status: z.enum(attendanceStatuses),
});

export const saveAttendanceSchema = z.array(attendanceRecordSchema);

export type CreateMeetingInput = z.infer<typeof createMeetingSchema>;
export type AttendanceRecordInput = z.infer<typeof attendanceRecordSchema>;
