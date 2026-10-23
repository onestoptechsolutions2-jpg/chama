import "server-only";
import { withTenant } from "@/lib/db/rls";
import { groupAuditLog } from "@/lib/db/schema";
import type { Actor, Command, CommandResult } from "./types";
import { accessError } from "./access";

/** Thrown inside the transaction to roll back a failed (or dry) run, carrying its result out. */
class Rollback<T> extends Error {
  constructor(readonly result: CommandResult<T>) {
    super("rollback");
  }
}

/**
 * The one way a command runs, for every caller:
 * 1. access — the permission matrix (role + product), plus support/agent
 *    rules: a reason is required, and moving money needs support.money;
 * 2. validation — the command's zod schema;
 * 3. the rule itself, in the group's RLS transaction — a failure rolls back
 *    everything it wrote;
 * 4. an append-only audit row in the same transaction;
 * 5. side effects (webhooks, SMS) only after commit.
 *
 * `dryRun` does 1–3 and rolls back: "what would happen" for the agent and
 * support previews.
 */
export async function runCommand<I, O>(
  actor: Actor,
  command: Command<I, O>,
  rawInput: unknown,
  options: { dryRun?: boolean } = {},
): Promise<CommandResult<O>> {
  const access = accessError(actor, command);
  if (access) return { ok: false, error: access, status: 403 };

  const parsed = command.input.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input", status: 400 };
  }
  const input = parsed.data;

  let result: CommandResult<O>;
  try {
    result = await withTenant(actor.groupId, async (tx) => {
      const outcome = await command.run(tx, actor, input);
      if (!outcome.ok || options.dryRun) throw new Rollback(outcome);
      await tx.insert(groupAuditLog).values(auditRow(actor, command.name, input, outcome));
      return outcome;
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
    result = error.result as CommandResult<O>;
    if (!result.ok && !options.dryRun) await logFailure(actor, command.name, input, result.error);
    return result;
  }

  if (command.afterCommit && result.ok) {
    await command.afterCommit(actor, input, result.data).catch((e) => {
      console.error(`[command ${command.name}] afterCommit failed`, e);
    });
  }
  return result;
}

function auditRow(actor: Actor, command: string, input: unknown, result: CommandResult<unknown>) {
  return {
    groupId: actor.groupId,
    command,
    actorUserId: actor.userId,
    via: actor.via,
    onBehalfOfUserId: actor.onBehalfOfUserId ?? null,
    reason: actor.reason ?? null,
    input: (input ?? {}) as object,
    ok: result.ok,
    error: result.ok ? null : result.error,
  };
}

async function logFailure(actor: Actor, command: string, input: unknown, error: string) {
  try {
    await withTenant(actor.groupId, (tx) =>
      tx.insert(groupAuditLog).values(auditRow(actor, command, input, { ok: false, error })),
    );
  } catch {
    // The audit log must never turn a clean refusal into a crash.
  }
}
