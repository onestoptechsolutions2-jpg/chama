import { describe, expect, it } from "vitest";
import { canViewPrivateFile } from "@/lib/files/private";

describe("who may open a private KYC file", () => {
  const base = { viewerUserId: 7, holders: [{ groupId: 3, userId: 9 }], canSeeMembersIn: () => false };
  it("lets the uploader see it", () => {
    expect(canViewPrivateFile({ ...base, pathParts: ["kyc", "7", "123-id.jpg"] })).toBe(true);
  });
  it("lets the member it belongs to see it", () => {
    expect(canViewPrivateFile({ ...base, viewerUserId: 9, pathParts: ["kyc", "2", "x.jpg"] })).toBe(true);
  });
  it("lets an official of a group holding it see it, nobody else", () => {
    expect(canViewPrivateFile({ ...base, pathParts: ["kyc", "2", "x.jpg"], canSeeMembersIn: (g) => g === 3 })).toBe(true);
    expect(canViewPrivateFile({ ...base, pathParts: ["kyc", "2", "x.jpg"], canSeeMembersIn: (g) => g === 4 })).toBe(false);
    expect(canViewPrivateFile({ ...base, holders: [], pathParts: ["kyc", "2", "x.jpg"], canSeeMembersIn: () => true })).toBe(false);
  });
  it("refuses other folders and path tricks", () => {
    expect(canViewPrivateFile({ ...base, pathParts: ["governance", "7", "x.pdf"] })).toBe(false);
    expect(canViewPrivateFile({ ...base, pathParts: ["kyc", "7", "..", "x"] })).toBe(false);
  });
});
