import { describe, it, expect } from "vitest";
import { attendanceStatusToFineType } from "../lib/domain/fines";

describe("attendanceStatusToFineType", () => {
  // Bug 3 (docs/architecture.md): the original app inserted fines with
  // type 'absent'/'late' straight from the attendance status, but the
  // fines table's CHECK constraint only ever accepted 'absence'/'lateness'
  // — every attendance submission with an absent/late member threw.
  it("maps 'absent' to the CHECK-constraint-valid 'absence', not the raw status", () => {
    expect(attendanceStatusToFineType("absent")).toBe("absence");
  });

  it("maps 'late' to the CHECK-constraint-valid 'lateness', not the raw status", () => {
    expect(attendanceStatusToFineType("late")).toBe("lateness");
  });
});
