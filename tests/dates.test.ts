import { describe, expect, it } from "vitest";
import { addDays, nairobiDate, nairobiToday } from "@/lib/domain/dates";
import { defaultDueDate } from "@/lib/domain/loans";

describe("Nairobi dates", () => {
  it("is already tomorrow in Nairobi at 22:00 UTC", () => {
    expect(nairobiDate(new Date("2026-03-09T22:00:00Z"))).toBe("2026-03-10");
    expect(nairobiToday(new Date("2026-03-09T20:59:00Z"))).toBe("2026-03-09");
  });

  it("adds days across month ends", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("dates a loan issued just after midnight Nairobi time on the Nairobi day", () => {
    // 00:30 on 1 Feb in Nairobi is still 31 Jan in UTC.
    expect(defaultDueDate(new Date("2026-01-31T21:30:00Z"), 1)).toBe("2026-03-01");
  });
});
