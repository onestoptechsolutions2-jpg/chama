import { describe, expect, it } from "vitest";
import { inviteAcceptError, inviteRoleError, roleAfterInvite } from "@/lib/domain/invites";

const on = { loans: true, mgr: true, welfare: true, projects: true };
const future = new Date(Date.now() + 86_400_000);

describe("inviteRoleError", () => {
  it("lets a treasurer invite members but not officials", () => {
    expect(inviteRoleError({ role: "treasurer", products: on }, "member")).toBeNull();
    expect(inviteRoleError({ role: "treasurer", products: on }, "secretary")).toMatch(/admin/);
    expect(inviteRoleError({ role: "admin", products: on }, "treasurer")).toBeNull();
    expect(inviteRoleError({ role: "secretary", products: on }, "member")).not.toBeNull();
  });
});

describe("inviteAcceptError", () => {
  const invite = { status: "pending" as const, expiresAt: future, phone: "254712345678", email: null };

  it("accepts the right phone, or an account with no phone yet", () => {
    expect(inviteAcceptError(invite, { phone: "254712345678", email: null })).toBeNull();
    expect(inviteAcceptError(invite, { phone: null, email: "a@b.c" })).toBeNull();
  });

  it("refuses another phone, used, cancelled or expired invites", () => {
    expect(inviteAcceptError(invite, { phone: "254700000000", email: null })).toMatch(/different phone/);
    expect(inviteAcceptError({ ...invite, status: "accepted" }, { phone: null, email: null })).toMatch(/used/);
    expect(inviteAcceptError({ ...invite, status: "cancelled" }, { phone: null, email: null })).toMatch(/cancelled/);
    expect(inviteAcceptError({ ...invite, expiresAt: new Date(0) }, { phone: null, email: null })).toMatch(/expired/);
  });
});

describe("roleAfterInvite", () => {
  it("promotes but never demotes", () => {
    expect(roleAfterInvite(null, "member")).toBe("member");
    expect(roleAfterInvite("member", "treasurer")).toBe("treasurer");
    expect(roleAfterInvite("admin", "member")).toBe("admin");
  });
});
