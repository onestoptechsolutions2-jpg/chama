import { describe, it, expect } from "vitest";
import { resolveObligationStatus, nextOccurrence } from "../lib/domain/governance";

describe("resolveObligationStatus", () => {
  const now = new Date(2026, 5, 15); // 2026-06-15

  it("is upcoming when the due date is well beyond the reminder window", () => {
    expect(resolveObligationStatus("2026-08-01", now, 14)).toBe("upcoming");
  });

  it("is due once inside the reminder window", () => {
    expect(resolveObligationStatus("2026-06-25", now, 14)).toBe("due");
  });

  it("is due on the exact edge of the reminder window", () => {
    expect(resolveObligationStatus("2026-06-29", now, 14)).toBe("due");
  });

  it("is overdue once the due date has passed", () => {
    expect(resolveObligationStatus("2026-06-01", now, 14)).toBe("overdue");
  });

  it("is due, not overdue, on the due date itself", () => {
    expect(resolveObligationStatus("2026-06-15", now, 14)).toBe("due");
  });
});

describe("nextOccurrence", () => {
  it("adds the recurrence months to the due date", () => {
    expect(nextOccurrence("2026-03-05", 12)).toBe("2027-03-05");
  });

  it("handles a shorter recurrence", () => {
    expect(nextOccurrence("2026-01-31", 1)).toBe("2026-03-03");
  });
});
