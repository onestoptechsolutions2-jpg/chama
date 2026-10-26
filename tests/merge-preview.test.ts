import { describe, expect, it } from "vitest";
import { previewMerge, searchAccounts, type MergeCandidate } from "../lib/domain/merge-preview";
import type { MergeMembership } from "../lib/domain/identity";

const m = (groupId: number, groupName: string, role: MergeMembership["role"], over: Partial<MergeMembership> = {}): MergeMembership => ({
  groupId, groupName, role, status: "active", hasMemberRow: false, ...over,
});
const acct = (id: number, over: Partial<MergeCandidate> = {}): MergeCandidate => ({
  id, name: `User ${id}`, email: null, phone: null, platformRole: null, active: true, memberships: [], ...over,
});

const keep88 = acct(88, { name: "Mitchel Ndakala", email: "mitchendakala@gmail.com", phone: "0712345678", memberships: [m(200, "Friends group", "admin", { hasMemberRow: true })] });
const fold47 = acct(47, { name: "Mitchel", email: "mitchel@greatminds.local", memberships: [m(172, "Big Minds(Ndakalas)", "admin", { hasMemberRow: true })] });

describe("searchAccounts", () => {
  const list = [keep88, fold47, acct(5, { name: "Someone Else", phone: "0799000111" })];

  it("finds by #id, exact phone in any format, email, then name", () => {
    expect(searchAccounts(list, "#47").map((u) => u.id)).toEqual([47]);
    expect(searchAccounts(list, "+254712345678").map((u) => u.id)).toEqual([88]);
    expect(searchAccounts(list, "MITCHEL@greatminds.local").map((u) => u.id)).toEqual([47]);
    expect(searchAccounts(list, "mitchel").map((u) => u.id)).toEqual([47, 88]);
  });

  it("returns nothing for an empty search", () => {
    expect(searchAccounts(list, "   ")).toEqual([]);
  });
});

describe("previewMerge", () => {
  it("shows both accounts' groups side by side and the result (the #47 into #88 case)", () => {
    const p = previewMerge(keep88, fold47);
    expect(p.refusal).toBeNull();
    expect(p.rows).toEqual([
      { groupId: 172, groupName: "Big Minds(Ndakalas)", keep: null, foldIn: { role: "admin", status: "active", hasMemberRow: true }, after: { role: "admin", status: "active" } },
      { groupId: 200, groupName: "Friends group", keep: { role: "admin", status: "active", hasMemberRow: true }, foldIn: null, after: { role: "admin", status: "active" } },
    ]);
  });

  it("keeps the stronger role in a group both accounts share", () => {
    const keep = acct(1, { memberships: [m(9, "G", "member")] });
    const foldIn = acct(2, { memberships: [m(9, "G", "treasurer")] });
    expect(previewMerge(keep, foldIn).rows[0].after).toEqual({ role: "treasurer", status: "active" });
  });

  it("refuses, with the action's own message, when both have savings in the same group", () => {
    const keep = acct(1, { memberships: [m(9, "Savers", "member", { hasMemberRow: true })] });
    const foldIn = acct(2, { memberships: [m(9, "Savers", "member", { hasMemberRow: true })] });
    const p = previewMerge(keep, foldIn);
    expect(p.refusal).toContain("Both accounts have savings records in Savers");
    expect(p.rows[0].after).toBeNull();
  });

  it("refuses to fold in an account that has a platform role", () => {
    expect(previewMerge(keep88, { ...fold47, platformRole: "support" }).refusal).toBe("Remove the duplicate's platform role before merging");
  });

  it("refuses the same account twice and warns about a deactivated one", () => {
    expect(previewMerge(keep88, keep88).refusal).toBe("Choose two different accounts");
    expect(previewMerge(keep88, { ...fold47, active: false }).warnings[0]).toContain("already deactivated");
  });
});
