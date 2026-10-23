import { describe, expect, it } from "vitest";
import { accessError } from "@/lib/commands/access";
import type { Actor } from "@/lib/commands/types";

const on = { loans: true, mgr: true, welfare: true, projects: true };
const actor = (over: Partial<Actor> = {}): Actor => ({
  userId: 1,
  name: "A",
  groupId: 1,
  groupName: "G",
  role: "treasurer",
  products: on,
  memberId: 1,
  via: "ui",
  ...over,
});
const record = { permission: "money.record" as const };
const payout = { permission: "mgr.manage" as const, movesMoney: true };

describe("accessError", () => {
  it("follows the permission matrix", () => {
    expect(accessError(actor(), record)).toBeNull();
    expect(accessError(actor({ role: "secretary" }), record)).toMatch(/permission/);
    expect(accessError(actor({ products: { ...on, mgr: false } }), payout)).toMatch(/permission/);
  });

  it("requires a reason from support and the agent", () => {
    expect(accessError(actor({ via: "support", platformRole: "support" }), record)).toMatch(/reason/);
    expect(accessError(actor({ via: "support", platformRole: "support", reason: "Member asked" }), record)).toBeNull();
  });

  it("lets only owners move money in support mode, and never the agent", () => {
    expect(accessError(actor({ via: "support", platformRole: "support", reason: "x" }), payout)).toMatch(/owner/);
    expect(accessError(actor({ via: "support", platformRole: "owner", reason: "x" }), payout)).toBeNull();
    expect(accessError(actor({ via: "agent", platformRole: "agent", reason: "x" }), payout)).toMatch(/person/);
  });
});
