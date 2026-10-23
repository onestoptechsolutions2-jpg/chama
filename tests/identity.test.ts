import { describe, expect, it } from "vitest";
import {
  displayPhone,
  findRosterRowFor,
  normalizeEmail,
  normalizePhone,
  planMerge,
  resolvePerson,
  type MergeMembership,
} from "@/lib/domain/identity";

describe("normalizePhone", () => {
  it("reads every common Kenyan format as one number", () => {
    for (const raw of ["0712345678", "0712 345 678", "+254712345678", "254712345678", "712345678", "0712-345-678"]) {
      expect(normalizePhone(raw)).toBe("254712345678");
    }
  });

  it("accepts the 01xx range", () => {
    expect(normalizePhone("0110 123 456")).toBe("254110123456");
  });

  it("rejects what isn't a Kenyan mobile", () => {
    for (const raw of ["", "12345", "0212345678", "+1 415 555 0100", "07123456789", "abc"]) {
      expect(normalizePhone(raw)).toBeNull();
    }
    expect(normalizePhone(null)).toBeNull();
  });

  it("displays the local form", () => {
    expect(displayPhone("254712345678")).toBe("0712 345 678");
    expect(displayPhone(null)).toBe("");
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Wanjiku@Example.COM ")).toBe("wanjiku@example.com");
    expect(normalizeEmail("")).toBeNull();
  });
});

describe("resolvePerson", () => {
  it("finds none, one, or a conflict", () => {
    expect(resolvePerson([])).toEqual({ kind: "none" });
    expect(resolvePerson([{ id: 1, phone: "x", email: null }, { id: 1, phone: "x", email: null }])).toEqual({ kind: "one", userId: 1 });
    expect(resolvePerson([{ id: 1, phone: "x", email: null }, { id: 2, phone: null, email: "y" }])).toEqual({ kind: "conflict", userIds: [1, 2] });
  });
});

describe("findRosterRowFor", () => {
  const rows = [
    { id: 10, userId: null, phone: "0712345678", email: null, active: true },
    { id: 11, userId: 5, phone: "254700000000", email: null, active: true },
    { id: 12, userId: null, phone: null, email: "Akinyi@x.com", active: true },
  ];

  it("prefers the row already linked to the user", () => {
    expect(findRosterRowFor(rows, { userId: 5, phone: "254712345678", email: null })?.id).toBe(11);
  });

  it("links an unlinked row by phone, even in the old format", () => {
    expect(findRosterRowFor(rows, { userId: 9, phone: "254712345678", email: null })?.id).toBe(10);
  });

  it("links by email when there is no phone match", () => {
    expect(findRosterRowFor(rows, { userId: 9, phone: null, email: "akinyi@x.com" })?.id).toBe(12);
  });

  it("never takes a row that belongs to someone else", () => {
    expect(findRosterRowFor(rows, { userId: 9, phone: "254700000000", email: null })).toBeNull();
  });
});

describe("planMerge", () => {
  const m = (groupId: number, over: Partial<MergeMembership> = {}): MergeMembership => ({
    groupId,
    groupName: `G${groupId}`,
    status: "active",
    role: "member",
    hasMemberRow: true,
    ...over,
  });

  it("moves groups only the duplicate is in", () => {
    const plan = planMerge([m(1)], [m(2)]);
    expect(plan).toEqual({ ok: true, moveGroupIds: [2], collapse: [] });
  });

  it("collapses a shared group and keeps the stronger role", () => {
    const plan = planMerge([m(1, { hasMemberRow: false, status: "pending" })], [m(1, { role: "treasurer" })]);
    expect(plan.ok && plan.collapse[0]).toEqual({
      groupId: 1,
      takeFromDuplicate: { status: "active", role: "treasurer" },
      moveMemberRow: true,
    });
  });

  it("refuses when both have savings in the same group", () => {
    const plan = planMerge([m(1)], [m(1)]);
    expect(plan.ok).toBe(false);
  });
});
