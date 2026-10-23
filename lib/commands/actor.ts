import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { groups } from "@/lib/db/schema";
import type { SessionWithGroup } from "@/lib/auth/session";
import type { Actor } from "./types";

/** The signed-in person in their active group (or, in support mode, support acting for them). */
export function actorFromSession(session: SessionWithGroup): Actor {
  const m = session.activeMembership;
  const support = session.support;
  return {
    userId: session.user.id,
    name: session.user.name,
    groupId: m.groupId,
    groupName: m.groupName,
    role: m.role,
    products: m.products,
    memberId: support ? null : m.memberId,
    via: support ? "support" : "ui",
    platformRole: session.user.platformRole,
    onBehalfOfUserId: support?.asUserId ?? null,
    reason: support?.reason ?? null,
  };
}

/**
 * A system door into one group — an API key, an M-Pesa callback, a cron job.
 * It acts with treasurer-level rights; which commands each door may call is
 * decided by the caller (the public API exposes one write).
 */
export async function systemActor(groupId: number, via: "api" | "mpesa" | "cron", name: string): Promise<Actor | null> {
  const group = await db.query.groups.findFirst({ where: eq(groups.id, groupId) });
  if (!group) return null;
  return {
    userId: null,
    name,
    groupId,
    groupName: group.name,
    role: "treasurer",
    products: {
      loans: group.loansEnabled,
      mgr: group.mgrEnabled,
      welfare: group.welfareEnabled,
      projects: group.projectsEnabled,
    },
    memberId: null,
    via,
  };
}
