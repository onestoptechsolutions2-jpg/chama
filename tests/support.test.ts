import { describe, expect, it } from "vitest";
import { supportWriteError } from "@/lib/auth/support-rules";

describe("supportWriteError", () => {
  it("blocks every write in view mode", () => {
    expect(supportWriteError({ mode: "view" }, "owner", "money.record")).toMatch(/view-only/);
  });

  it("lets support act on everyday work", () => {
    expect(supportWriteError({ mode: "act" }, "support", "money.record")).toBeNull();
    expect(supportWriteError({ mode: "act" }, "support", "members.add")).toBeNull();
  });

  it("keeps money going out for owners only", () => {
    expect(supportWriteError({ mode: "act" }, "support", "loans.manage")).toMatch(/owner/);
    expect(supportWriteError({ mode: "act" }, "owner", "loans.manage")).toBeNull();
  });

  it("never touches a group's credentials or pays the platform", () => {
    expect(supportWriteError({ mode: "act" }, "owner", "developer.manage")).not.toBeNull();
    expect(supportWriteError({ mode: "act" }, "owner", "billing.pay")).not.toBeNull();
  });
});
