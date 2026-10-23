import { can, canPlatform } from "@/lib/auth/permissions";
import type { Actor, Command } from "./types";

/**
 * May this actor run this command? The permission matrix decides by role
 * and product; support and the agent must give a reason; moving money on a
 * member's behalf needs a platform owner, and the agent never moves money.
 */
export function accessError(actor: Actor, command: Pick<Command<unknown, unknown>, "permission" | "movesMoney">): string | null {
  if (!can(actor, command.permission)) return "You don't have permission to do that in this group.";
  if (actor.via === "support" || actor.via === "agent") {
    if (!actor.reason?.trim()) return "Support and agent actions need a reason.";
    if (command.movesMoney && actor.via === "support" && !canPlatform(actor.platformRole, "support.money")) {
      return "Only a platform owner can move money on a member's behalf.";
    }
    if (command.movesMoney && actor.via === "agent") {
      return "The agent prepares payouts; a person must make them.";
    }
  }
  return null;
}

