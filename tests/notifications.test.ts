import { describe, it, expect } from "vitest";
import {
  buildWelfareNotification,
  buildMembershipNotification,
  buildLoanNotification,
} from "../lib/domain/notifications";

describe("buildWelfareNotification", () => {
  it("flags approval_needed as action_required, not just info", () => {
    const tpl = buildWelfareNotification({ type: "approval_needed", requesterName: "Alice", amount: 5000 });
    expect(tpl.category).toBe("action_required");
    expect(tpl.body).toContain("Alice");
    expect(tpl.body).toContain("5,000");
  });

  it("formats every event type into a non-empty title and body", () => {
    const events: Parameters<typeof buildWelfareNotification>[0][] = [
      { type: "request_submitted", requesterName: "Bob", amount: 1000 },
      { type: "approval_needed", requesterName: "Bob", amount: 1000 },
      { type: "request_approved", amount: 1000 },
      { type: "request_rejected", reason: "Insufficient tenure" },
      { type: "request_rejected", reason: null },
      { type: "request_disbursed", amount: 1000 },
      { type: "advance_repayment_due", amount: 500, dueDate: "2026-09-01" },
      { type: "advance_overdue", amount: 500 },
      { type: "reserve_low", reserve: "Emergency", balance: 200 },
      { type: "policy_changed" },
    ];
    for (const event of events) {
      const tpl = buildWelfareNotification(event);
      expect(tpl.title.length).toBeGreaterThan(0);
      expect(tpl.body.length).toBeGreaterThan(0);
    }
  });

  it("falls back to a plain message when no rejection reason was given", () => {
    expect(buildWelfareNotification({ type: "request_rejected", reason: null }).body).toBe("No reason was given.");
  });
});

describe("buildMembershipNotification", () => {
  it("flags a new join request as action_required for staff", () => {
    const tpl = buildMembershipNotification({ type: "join_request_submitted", requesterName: "Carol" });
    expect(tpl.category).toBe("action_required");
    expect(tpl.body).toContain("Carol");
  });

  it("tells the requester which group they were approved into", () => {
    const tpl = buildMembershipNotification({ type: "join_request_approved", groupName: "GreatMinds" });
    expect(tpl.category).toBe("success");
    expect(tpl.body).toContain("GreatMinds");
  });

  it("tells the requester which group declined them", () => {
    const tpl = buildMembershipNotification({ type: "join_request_rejected", groupName: "GreatMinds" });
    expect(tpl.category).toBe("warning");
    expect(tpl.body).toContain("GreatMinds");
  });
});

describe("buildLoanNotification", () => {
  it("flags a new application and a guarantee request as action_required", () => {
    expect(buildLoanNotification({ type: "application_submitted", requesterName: "Dan", amount: 3000 }).category).toBe(
      "action_required",
    );
    expect(
      buildLoanNotification({ type: "guarantee_requested", requesterName: "Dan", amount: 3000 }).category,
    ).toBe("action_required");
  });

  it("formats an amount into the application-approved body", () => {
    const tpl = buildLoanNotification({ type: "application_approved", amount: 12_000 });
    expect(tpl.category).toBe("success");
    expect(tpl.body).toContain("12,000");
  });

  it("falls back to a plain message when a rejection carries no reason", () => {
    expect(buildLoanNotification({ type: "application_rejected", reason: null }).body).toBe("No reason was given.");
    expect(buildLoanNotification({ type: "application_rejected", reason: "Exceeds limit" }).body).toBe(
      "Exceeds limit",
    );
  });

  it("names the guarantor in both the accepted and declined events", () => {
    expect(buildLoanNotification({ type: "guarantee_accepted", guarantorName: "Eve" }).body).toContain("Eve");
    expect(buildLoanNotification({ type: "guarantee_declined", guarantorName: "Eve" }).body).toContain("Eve");
  });
});
