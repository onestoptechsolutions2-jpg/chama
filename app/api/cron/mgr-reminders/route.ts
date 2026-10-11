import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { isAuthorizedCronRequest, runCronJob } from "@/lib/cron/helpers";
import { withPlatformAdmin } from "@/lib/db/rls";
import { members, mgrCycles, mgrSlots, notifications } from "@/lib/db/schema";
import { insertNotification } from "@/lib/db/notifications";
import { buildMgrNotification } from "@/lib/domain/notifications";

/**
 * Daily at 08:45 Africa/Nairobi (05:45 UTC — see vercel.json). For every
 * active Mzunguko cycle dated tomorrow: tell each member with a login that
 * contributions are due, and tell whoever receives a slot that their turn is
 * tomorrow. Skips anyone already reminded for that cycle, so a double-fired
 * cron never sends twice.
 */
export async function GET(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runCronJob("mgr-reminders", sendReminders);

  if (!result.ranJob) {
    return NextResponse.json({ ok: true, skipped: "already running" });
  }
  return NextResponse.json({ ok: !result.error, ...result });
}

async function sendReminders(): Promise<number> {
  // Nairobi is UTC+3 with no daylight saving.
  const tomorrow = new Date(Date.now() + 27 * 60 * 60 * 1000).toISOString().split("T")[0];
  let sent = 0;

  const cycles = await withPlatformAdmin((tx) =>
    tx.query.mgrCycles.findMany({
      where: and(eq(mgrCycles.status, "active"), eq(mgrCycles.scheduledDate, tomorrow)),
    }),
  );

  for (const cycle of cycles) {
    sent += await withPlatformAdmin(async (tx) => {
      const alreadyReminded = new Set(
        (
          await tx.query.notifications.findMany({
            where: and(
              eq(notifications.groupId, cycle.groupId),
              eq(notifications.sourceType, "mgr_cycle_reminder"),
              eq(notifications.sourceId, cycle.id),
            ),
          })
        ).map((n) => `${n.userId}:${n.title}`),
      );

      const groupMembers = await tx.query.members.findMany({
        where: and(eq(members.groupId, cycle.groupId), eq(members.active, true)),
      });
      const userByMember = new Map(
        groupMembers.filter((m) => m.userId).map((m) => [m.id, m.userId as number]),
      );

      const slots = await tx.query.mgrSlots.findMany({
        where: and(
          eq(mgrSlots.cycleId, cycle.id),
          inArray(mgrSlots.status, ["claimed", "auto_assigned"]),
        ),
      });

      const messages: { userId: number; template: ReturnType<typeof buildMgrNotification> }[] = [];
      for (const userId of userByMember.values()) {
        messages.push({
          userId,
          template: buildMgrNotification({
            type: "contribution_due_tomorrow",
            cycleNumber: cycle.cycleNumber,
            date: tomorrow,
          }),
        });
      }
      for (const slot of slots) {
        const userId = slot.memberId ? userByMember.get(slot.memberId) : undefined;
        if (!userId) continue;
        messages.push({
          userId,
          template: buildMgrNotification({
            type: "payout_tomorrow",
            cycleNumber: cycle.cycleNumber,
            amount: slot.payoutAmount ? Number(slot.payoutAmount) : null,
          }),
        });
      }

      let count = 0;
      for (const m of messages) {
        if (alreadyReminded.has(`${m.userId}:${m.template.title}`)) continue;
        await insertNotification(tx, {
          groupId: cycle.groupId,
          userId: m.userId,
          template: m.template,
          link: "/dashboard/mgr",
          sourceType: "mgr_cycle_reminder",
          sourceId: cycle.id,
        });
        count++;
      }
      return count;
    });
  }

  return sent;
}
