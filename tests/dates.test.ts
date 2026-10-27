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

describe("formatDay", () => {
  it("reads like people say it", async () => {
    const { formatDay } = await import("@/lib/domain/dates");
    expect(formatDay("2026-10-27", "2026-10-27")).toBe("Today");
    expect(formatDay("2026-10-28", "2026-10-27")).toBe("Tomorrow");
    expect(formatDay("2026-11-05", "2026-10-27")).toBe("Thu 5 Nov");
    expect(formatDay("2027-01-04", "2026-10-27")).toBe("Mon 4 Jan 2027");
    expect(formatDay("2026-10-26", "2026-10-27")).toBe("Yesterday");
  });
  it("never says Today in stored text, and shows Nairobi time", async () => {
    const { formatDate, formatDateTime, formatRange } = await import("@/lib/domain/dates");
    expect(formatDate("2026-10-27", "2026-10-27")).toBe("Tue 27 Oct");
    // 22:30 UTC is 01:30 the next day in Nairobi.
    expect(formatDateTime("2026-10-27T22:30:00Z", "2026-10-27")).toBe("Tomorrow, 01:30");
    expect(formatDateTime(new Date("2026-10-01T06:05:00Z"), "2026-10-27")).toBe("Thu 1 Oct, 09:05");
    expect(formatRange("2026-11-02", "2027-01-18", "2026-10-27")).toBe("Mon 2 Nov – Mon 18 Jan 2027");
  });
});
