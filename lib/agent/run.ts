import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { withTenant } from "@/lib/db/rls";
import { groups, incomingPayments, loans, members } from "@/lib/db/schema";
import { nairobiToday } from "@/lib/domain/dates";
import { PAYMENT_PURPOSES, type PaymentPurpose } from "@/lib/domain/payment-matching";
import { PLAYBOOKS, planLoanReminders, planRematch, type PlaybookId } from "@/lib/domain/agent-playbooks";
import { runCommand } from "@/lib/commands/run";
import { assignPayment } from "@/lib/commands/payments";
import { alreadySentToday, sendLoanReminder } from "@/lib/commands/reminders";
import type { Actor } from "@/lib/commands/types";

/**
 * The deterministic agent. No AI model: for one group it asks each playbook
 * (lib/domain/agent-playbooks.ts) for a plan from the group's records, then
 * carries the plan out through the normal commands as `via: "agent"` with
 * the playbook as the reason — so every step is permission-checked,
 * re-validated, audited, and never moves money out. `dryRun` returns the
 * plan without doing anything.
 */
export type AgentStep = { playbook: PlaybookId; summary: string; ok: boolean | null; error?: string };
export type AgentReport = { groupId: number; groupName: string; dryRun: boolean; steps: AgentStep[] };

export const ALL_PLAYBOOKS = Object.keys(PLAYBOOKS) as PlaybookId[];
const OPEN_LOAN = ["active", "extended", "overdue"] as const;

export async function runAgent(
  groupId: number,
  options: { dryRun?: boolean; playbooks?: PlaybookId[]; trigger: "cron" | "support" | "api"; triggeredBy?: number | null } = { trigger: "cron" },
): Promise<AgentReport | null> {
  const dryRun = options.dryRun ?? false;
  const playbooks = options.playbooks?.length ? options.playbooks : ALL_PLAYBOOKS;

  const snapshot = await withTenant(groupId, async (tx) => {
    const group = await tx.query.groups.findFirst({ where: eq(groups.id, groupId) });
    if (!group || !group.active) return null;
    return {
      group,
      roster: await tx
        .select({ id: members.id, memberNumber: members.memberNumber, phone: members.phone, name: members.name })
        .from(members)
        .where(and(eq(members.groupId, groupId), eq(members.active, true))),
      waiting: await tx
        .select({ id: incomingPayments.id, source: incomingPayments.source, accountRef: incomingPayments.accountRef, payerPhone: incomingPayments.payerPhone })
        .from(incomingPayments)
        .where(and(eq(incomingPayments.groupId, groupId), eq(incomingPayments.status, "unmatched")))
        .orderBy(asc(incomingPayments.id)),
      openLoans: group.loansEnabled
        ? await tx.query.loans.findMany({ where: and(eq(loans.groupId, groupId), inArray(loans.status, [...OPEN_LOAN])), orderBy: [asc(loans.id)] })
        : [],
    };
  });
  if (!snapshot) return null;
  const { group, roster, waiting, openLoans } = snapshot;

  const actor = (playbook: PlaybookId): Actor => ({
    userId: options.triggeredBy ?? null,
    name: "Agent",
    groupId,
    groupName: group.name,
    role: "treasurer",
    products: { loans: group.loansEnabled, mgr: group.mgrEnabled, welfare: group.welfareEnabled, projects: group.projectsEnabled },
    memberId: null,
    via: "agent",
    reason: `Playbook "${PLAYBOOKS[playbook].label}" (${options.trigger})`,
  });

  const steps: AgentStep[] = [];
  const nameOf = new Map(roster.map((m) => [m.id, m.name]));

  if (playbooks.includes("rematch-payments")) {
    const purpose = (PAYMENT_PURPOSES as string[]).includes(group.paymentDefaultType) ? (group.paymentDefaultType as PaymentPurpose) : "capital";
    for (const s of planRematch(waiting, roster, purpose)) {
      const summary = `Payment #${s.paymentId} → ${nameOf.get(s.memberId) ?? `member #${s.memberId}`} (${s.purpose}, ${s.why})`;
      if (dryRun) {
        steps.push({ playbook: "rematch-payments", summary, ok: null });
        continue;
      }
      const r = await runCommand(actor("rematch-payments"), assignPayment, s);
      steps.push({ playbook: "rematch-payments", summary, ok: r.ok, error: r.ok ? undefined : r.error });
    }
  }

  if (playbooks.includes("loan-reminders") && group.loansEnabled) {
    const byId = new Map(roster.map((m) => [m.id, m]));
    const plan = planLoanReminders(
      openLoans.map((l) => ({
        id: l.id,
        memberId: l.memberId,
        memberName: byId.get(l.memberId)?.name ?? "Member",
        phone: byId.get(l.memberId)?.phone ?? null,
        dueDate: l.dueDate,
        amountRemaining: Number(l.amountRemaining),
      })),
      nairobiToday(),
      group.name,
    );
    // Skip anyone already sent today's reminder, so a manual run after the
    // daily one (or a retried cron) never sends twice.
    const fresh = [];
    for (const s of plan) {
      if (!(await withTenant(groupId, (tx) => alreadySentToday(tx, groupId, s.phone, s.message)))) fresh.push(s);
    }
    for (const s of fresh) {
      const summary = `SMS ${nameOf.get(s.memberId) ?? "member"}: loan ${s.kind.replace("_", " ")}`;
      if (dryRun) {
        steps.push({ playbook: "loan-reminders", summary, ok: null });
        continue;
      }
      const r = await runCommand(actor("loan-reminders"), sendLoanReminder, { loanId: s.loanId });
      steps.push({ playbook: "loan-reminders", summary, ok: r.ok, error: r.ok ? undefined : r.error });
    }
  }

  return { groupId, groupName: group.name, dryRun, steps };
}
