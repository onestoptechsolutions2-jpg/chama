import type { ZodType } from "zod";
import type { Tx } from "@/lib/db/rls";
import type { GroupPermission, GroupRole, PlatformRole } from "@/lib/auth/permissions";
import type { ProductFlags } from "@/lib/domain/products";

/**
 * Who is doing something, in which group, through which door. Every
 * command takes one, so the same rule runs the same way whether a
 * treasurer clicked a button, an API key called in, M-Pesa sent a payment,
 * support stepped in, or the agent ran it.
 */
export type Actor = {
  /** The person the change is attributed to (support staff in support mode). Null for API keys and M-Pesa. */
  userId: number | null;
  /** Display name for messages and receipts. */
  name: string;
  groupId: number;
  groupName: string;
  /** Effective role in this group — what the permission matrix checks. */
  role: GroupRole;
  products: ProductFlags;
  /** The actor's own roster row here, for maker–checker (null for systems). */
  memberId: number | null;
  via: "ui" | "api" | "cron" | "support" | "agent" | "mpesa";
  /** Platform role of the person behind support/agent access. */
  platformRole?: PlatformRole | null;
  /** Support/agent acting for this user. */
  onBehalfOfUserId?: number | null;
  /** Why support/agent is acting — required for those doors. */
  reason?: string | null;
};

export type CommandResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };

export type Command<I, O> = {
  /** Dotted name, e.g. "contributions.record" — what the audit log and agent endpoint use. */
  name: string;
  /** Plain-language summary, shown to the agent and support. */
  description: string;
  permission: GroupPermission;
  /** Moves money out of the group (payouts, disbursements): support needs support.money. */
  movesMoney?: boolean;
  input: ZodType<I>;
  /** The rule. Runs inside the group's transaction; return ok:false to roll everything back. */
  run: (tx: Tx, actor: Actor, input: I) => Promise<CommandResult<O>>;
  /** Side effects after commit (webhooks, SMS). Never throws into the caller. */
  afterCommit?: (actor: Actor, input: I, data: O) => Promise<void>;
};

export function defineCommand<I, O>(command: Command<I, O>): Command<I, O> {
  return command;
}

export const fail = (error: string, status = 400): CommandResult<never> => ({ ok: false, error, status });
export const done = <T>(data: T): CommandResult<T> => ({ ok: true, data });
