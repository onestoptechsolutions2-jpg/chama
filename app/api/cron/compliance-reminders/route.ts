import { NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { isAuthorizedCronRequest, runCronJob } from "@/lib/cron/helpers";
import { withPlatformAdmin } from "@/lib/db/rls";
import { groups, complianceObligations } from "@/lib/db/schema";
import { insertNotification, listActiveStaffUserIds } from "@/lib/db/notifications";
import { buildGovernanceNotification } from "@/lib/domain/notifications";
import { resolveObligationStatus } from "@/lib/domain/governance";

const REMINDER_WINDOW_DAYS = 14;

/**
 * Daily, same shape as contribution-dues/loan-overdue: status-flip only
 * (compliance obligations are admin-created, not auto-generated, unlike
 * contribution_dues) — upcoming -> due within the reminder window,
 * anything -> overdue once the due date has passed. Notifies admin +
 * secretary on each transition via the existing generic `notifications`
 * table (the "notification-channel decision" flagged in
 * docs/CHANGELOG.md's Known Gaps — reuse, don't build a new channel).
 */
export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runCronJob("compliance-reminders", flipObligationStatuses);

  if (!result.ranJob) {
    return NextResponse.json({ ok: true, skipped: "already running" });
  }
  return NextResponse.json({ ok: !result.error, ...result });
}

async function flipObligationStatuses(): Promise<number> {
  const now = new Date();
  let transitioned = 0;

  const allGroups = await withPlatformAdmin((tx) =>
    tx.query.groups.findMany({ where: eq(groups.active, true) }),
  );

  for (const group of allGroups) {
    await withPlatformAdmin(async (tx) => {
      const obligations = await tx.query.complianceObligations.findMany({
        where: and(eq(complianceObligations.groupId, group.id), ne(complianceObligations.status, "completed")),
      });

      const staffUserIds = await listActiveStaffUserIds(tx, group.id, ["admin", "secretary"]);

      for (const obligation of obligations) {
        const resolved = resolveObligationStatus(obligation.dueDate, now, REMINDER_WINDOW_DAYS);
        if (resolved === obligation.status) continue;

        await tx
          .update(complianceObligations)
          .set({ status: resolved, updatedAt: now })
          .where(eq(complianceObligations.id, obligation.id));
        transitioned++;

        if (resolved === "due" || resolved === "overdue") {
          const event =
            resolved === "due"
              ? ({ type: "obligation_due", title: obligation.title, dueDate: obligation.dueDate } as const)
              : ({ type: "obligation_overdue", title: obligation.title, dueDate: obligation.dueDate } as const);
          const template = buildGovernanceNotification(event);
          for (const userId of staffUserIds) {
            await insertNotification(tx, {
              groupId: group.id,
              userId,
              template,
              link: "/dashboard/governance",
              sourceType: "compliance_obligation",
              sourceId: obligation.id,
            });
          }
        }
      }
    });
  }

  return transitioned;
}
