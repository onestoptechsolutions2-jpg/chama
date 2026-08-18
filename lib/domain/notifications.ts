// Generic notification formatting — the notifications table itself
// (lib/db/schema.ts) is deliberately not welfare-named, even though welfare
// is the first feature to populate it. This module's event union is
// welfare-specific for now; a future feature adds its own event type rather
// than overloading this one.

export type NotificationCategory = "info" | "success" | "warning" | "action_required";

export type NotificationTemplate = {
  category: NotificationCategory;
  title: string;
  body: string;
};

export type WelfareNotificationEvent =
  | { type: "request_submitted"; requesterName: string; amount: number }
  | { type: "approval_needed"; requesterName: string; amount: number }
  | { type: "request_approved"; amount: number }
  | { type: "request_rejected"; reason: string | null }
  | { type: "request_disbursed"; amount: number }
  | { type: "advance_repayment_due"; amount: number; dueDate: string }
  | { type: "advance_overdue"; amount: number }
  | { type: "reserve_low"; reserve: string; balance: number }
  | { type: "policy_changed" };

export function buildWelfareNotification(event: WelfareNotificationEvent): NotificationTemplate {
  switch (event.type) {
    case "request_submitted":
      return {
        category: "info",
        title: "Welfare request submitted",
        body: `${event.requesterName} requested Ksh ${event.amount.toLocaleString()} in welfare assistance.`,
      };
    case "approval_needed":
      return {
        category: "action_required",
        title: "Welfare request needs your approval",
        body: `${event.requesterName} requested Ksh ${event.amount.toLocaleString()} — your sign-off is needed.`,
      };
    case "request_approved":
      return {
        category: "success",
        title: "Your welfare request was approved",
        body: `Ksh ${event.amount.toLocaleString()} was approved.`,
      };
    case "request_rejected":
      return {
        category: "warning",
        title: "Your welfare request was declined",
        body: event.reason ?? "No reason was given.",
      };
    case "request_disbursed":
      return {
        category: "success",
        title: "Welfare assistance disbursed",
        body: `Ksh ${event.amount.toLocaleString()} has been disbursed to you.`,
      };
    case "advance_repayment_due":
      return {
        category: "info",
        title: "Welfare advance repayment due",
        body: `Ksh ${event.amount.toLocaleString()} is due on ${event.dueDate}.`,
      };
    case "advance_overdue":
      return {
        category: "warning",
        title: "Welfare advance overdue",
        body: `Ksh ${event.amount.toLocaleString()} is overdue.`,
      };
    case "reserve_low":
      return {
        category: "warning",
        title: `${event.reserve} welfare reserve is running low`,
        body: `Only Ksh ${event.balance.toLocaleString()} remains — new requests may be restricted.`,
      };
    case "policy_changed":
      return {
        category: "info",
        title: "Welfare policy updated",
        body: "The group's welfare funding and approval rules were updated.",
      };
  }
}
