import { describe, it, expect } from "vitest";
import { computeRegistrationComplete, requiredKycFields, isKycComplete } from "../lib/domain/officials";

describe("computeRegistrationComplete", () => {
  it("is false with no roles", () => {
    expect(computeRegistrationComplete([])).toBe(false);
  });

  it("is false with only an admin", () => {
    expect(computeRegistrationComplete(["admin"])).toBe(false);
  });

  it("is false missing just the secretary", () => {
    expect(computeRegistrationComplete(["admin", "treasurer", "member", "member"])).toBe(false);
  });

  it("is true once admin, treasurer, and secretary are all present", () => {
    expect(computeRegistrationComplete(["admin", "treasurer", "secretary"])).toBe(true);
  });

  it("is true regardless of extra members or duplicate offices", () => {
    expect(
      computeRegistrationComplete(["admin", "admin", "treasurer", "secretary", "member", "member"]),
    ).toBe(true);
  });
});

describe("requiredKycFields", () => {
  it("requires only the core fields for a plain member", () => {
    expect(requiredKycFields("member")).toEqual([
      "name",
      "idNumber",
      "idDocumentUrl",
      "phone",
      "photoUrl",
    ]);
  });

  it("requires address and signature in addition for every office", () => {
    for (const role of ["admin", "treasurer", "secretary"] as const) {
      const fields = requiredKycFields(role);
      expect(fields).toContain("address");
      expect(fields).toContain("signatureUrl");
      expect(fields).toContain("idNumber");
    }
  });
});

describe("isKycComplete", () => {
  const coreFilled = {
    name: "Jane Wanjiru",
    idNumber: "12345678",
    idDocumentUrl: "https://blob.example/id.jpg",
    phone: "0712345678",
    photoUrl: "https://blob.example/photo.jpg",
  };

  it("is true for a member with only core fields filled", () => {
    expect(isKycComplete("member", coreFilled)).toBe(true);
  });

  it("is false for an official missing address/signature even with core fields filled", () => {
    expect(isKycComplete("treasurer", coreFilled)).toBe(false);
  });

  it("is true for an official once address and signature are also present", () => {
    expect(
      isKycComplete("secretary", {
        ...coreFilled,
        address: "P.O. Box 123, Nairobi",
        signatureUrl: "https://blob.example/sig.jpg",
      }),
    ).toBe(true);
  });

  it("is false when a core field is missing, even for a plain member", () => {
    expect(isKycComplete("member", { ...coreFilled, idNumber: null })).toBe(false);
  });
});
