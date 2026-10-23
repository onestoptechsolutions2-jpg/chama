import "server-only";
import { z } from "zod";
import { announce, applyContribution, entrySchema, loadGroup, type RecordedContribution } from "./contributions";
import { applyRepayment, repaymentSchema, type RecordedRepayment } from "./loans";
import { defineCommand, done, fail } from "./types";

/**
 * Everything collected at one meeting — contributions and loan repayments —
 * saved in ONE transaction: if any line is wrong, nothing is saved and the
 * treasurer fixes that line. Members get one SMS receipt each.
 */
export const recordMeetingCollections = defineCommand({
  name: "collections.recordMeeting",
  description: "Record a meeting's collections: contributions and loan repayments together.",
  permission: "money.record",
  input: z
    .object({
      entries: z.array(entrySchema).max(1000).default([]),
      repayments: z.array(repaymentSchema).max(500).default([]),
    })
    .refine((d) => d.entries.length + d.repayments.length > 0, { message: "Enter at least one amount" }),
  run: async (tx, actor, input) => {
    const group = await loadGroup(tx, actor.groupId);
    if (!group) return fail("Group not found", 404);
    if (input.repayments.length && !actor.products.loans) return fail("Loans are switched off for this group");

    const contributions: RecordedContribution[] = [];
    for (const entry of input.entries) {
      const one = await applyContribution(tx, actor, group, entry);
      if (!one.ok) return one;
      contributions.push(one.data);
    }
    const repayments: RecordedRepayment[] = [];
    for (const r of input.repayments) {
      const one = await applyRepayment(tx, actor, r);
      if (!one.ok) return one;
      repayments.push(one.data);
    }
    return done({ contributions, repayments, total: contributions.reduce((s, c) => s + c.amount, 0) + input.repayments.reduce((s, r) => s + r.amount, 0) });
  },
  afterCommit: (actor, _input, data) => announce(actor, data.contributions),
});
