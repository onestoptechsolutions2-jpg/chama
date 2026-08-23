// Generic notification formatting — the notifications table itself
// (lib/db/schema.ts) is deliberately not welfare-named, even though welfare
// was the first feature to populate it. Each feature gets its own event
// union and builder (WelfareNotificationEvent, MembershipNotificationEvent,
// LoanNotificationEvent, ...) rather than one union overloaded across
// domains — see lib/db/notifications.ts for the shared insert helper every
// builder's output feeds into.

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

export type MembershipNotificationEvent =
  | { type: "join_request_submitted"; requesterName: string }
  | { type: "join_request_approved"; groupName: string }
  | { type: "join_request_rejected"; groupName: string };

export function buildMembershipNotification(event: MembershipNotificationEvent): NotificationTemplate {
  switch (event.type) {
    case "join_request_submitted":
      return {
        category: "action_required",
        title: "New join request",
        body: `${event.requesterName} asked to join this group.`,
      };
    case "join_request_approved":
      return {
        category: "success",
        title: "You're in!",
        body: `Your request to join ${event.groupName} was approved.`,
      };
    case "join_request_rejected":
      return {
        category: "warning",
        title: "Join request declined",
        body: `Your request to join ${event.groupName} wasn't approved.`,
      };
  }
}

export type LoanNotificationEvent =
  | { type: "application_submitted"; requesterName: string; amount: number }
  | { type: "application_approved"; amount: number }
  | { type: "application_rejected"; reason: string | null }
  | { type: "guarantee_requested"; requesterName: string; amount: number }
  | { type: "guarantee_accepted"; guarantorName: string }
  | { type: "guarantee_declined"; guarantorName: string };

export function buildLoanNotification(event: LoanNotificationEvent): NotificationTemplate {
  switch (event.type) {
    case "application_submitted":
      return {
        category: "action_required",
        title: "New loan application",
        body: `${event.requesterName} applied for Ksh ${event.amount.toLocaleString()}.`,
      };
    case "application_approved":
      return {
        category: "success",
        title: "Your loan was approved",
        body: `Ksh ${event.amount.toLocaleString()} was approved and is now active.`,
      };
    case "application_rejected":
      return {
        category: "warning",
        title: "Your loan application was declined",
        body: event.reason ?? "No reason was given.",
      };
    case "guarantee_requested":
      return {
        category: "action_required",
        title: "You've been asked to guarantee a loan",
        body: `${event.requesterName} asked you to guarantee their Ksh ${event.amount.toLocaleString()} loan application.`,
      };
    case "guarantee_accepted":
      return {
        category: "success",
        title: "A guarantor accepted",
        body: `${event.guarantorName} accepted your guarantee request.`,
      };
    case "guarantee_declined":
      return {
        category: "warning",
        title: "A guarantor declined",
        body: `${event.guarantorName} declined your guarantee request.`,
      };
  }
}
