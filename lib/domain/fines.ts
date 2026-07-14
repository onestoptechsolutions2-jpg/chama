import type { attendanceStatusEnum, fineTypeEnum } from "@/lib/db/schema";

type AttendanceStatus = (typeof attendanceStatusEnum.enumValues)[number];
type FineType = (typeof fineTypeEnum.enumValues)[number];

/**
 * Bug 3 (docs/architecture.md): the original app inserted fines with
 * type='absent'/'late' straight from the attendance status string, but the
 * fines table only ever accepted 'absence'/'lateness' — every attendance
 * submission with an absent/late member threw a CHECK-constraint violation.
 * This is the one place that maps attendance status -> fine type; there is
 * no other code path that writes a fine row from attendance.
 */
export function attendanceStatusToFineType(
  status: Extract<AttendanceStatus, "absent" | "late">,
): FineType {
  return status === "absent" ? "absence" : "lateness";
}
