import "server-only";
import { recordContribution, recordContributionBatch } from "./contributions";
import { issueFine, settleFine } from "./fines";
import { recordLoanRepayment } from "./loans";
import { recordMeetingCollections } from "./meeting";
import { assignPayment, ignorePayment, importPayments, receivePayment } from "./payments";
import type { Command } from "./types";

/**
 * Every command reachable by name — what the internal agent endpoint and
 * support tools can run. Adding a feature to the agent = moving its rule
 * into a command and listing it here; the permission matrix, audit log and
 * dry-run come for free.
 */
export const COMMANDS: Record<string, Command<any, any>> = Object.fromEntries(
  [recordContribution, recordContributionBatch, recordMeetingCollections, issueFine, settleFine, recordLoanRepayment, receivePayment, importPayments, assignPayment, ignorePayment].map((c) => [c.name, c]),
);

export function listCommands() {
  return Object.values(COMMANDS).map((c) => ({
    name: c.name,
    description: c.description,
    permission: c.permission,
    movesMoney: Boolean(c.movesMoney),
  }));
}
