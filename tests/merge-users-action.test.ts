/**
 * Drives the existing mergeUsersAction (unchanged) with a stand-in transaction, so its safeguards are
 * proven without a database: owners only, no folding in a platform-role account, no merge when both
 * accounts have savings in the same group, and two platform audit entries on success.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";

const auth = vi.hoisted(() => ({ requirePlatformPermission: vi.fn() }));
const rls = vi.hoisted(() => ({ withPlatformAdmin: vi.fn() }));

vi.mock("@/lib/auth/session", () => auth);
vi.mock("@/lib/db/rls", () => rls);
vi.mock("@/lib/db/client", () => ({ db: {} }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { mergeUsersAction } from "../app/super-admin/users/actions";
import { canPlatform } from "../lib/auth/permissions";

type Write = { op: "update" | "delete" | "insert" | "execute"; table?: string; values?: Record<string, unknown> };

function fakeTx(opts: {
  keep: Record<string, unknown>;
  dup: Record<string, unknown>;
  keepMemberships?: unknown[];
  dupMemberships?: unknown[];
  keepMembers?: unknown[];
  dupMembers?: unknown[];
}) {
  const writes: Write[] = [];
  const users = [opts.keep, opts.dup];
  const memberships = [opts.keepMemberships ?? [], opts.dupMemberships ?? []];
  const memberRows = [opts.keepMembers ?? [], opts.dupMembers ?? []];
  const tx = {
    query: {
      users: { findFirst: vi.fn(async () => users.shift()) },
      groupMemberships: { findMany: vi.fn(async () => memberships.shift()) },
      members: { findMany: vi.fn(async () => memberRows.shift()) },
    },
    update: (table: never) => ({ set: (values: Record<string, unknown>) => ({ where: async () => void writes.push({ op: "update", table: getTableName(table), values }) }) }),
    delete: (table: never) => ({ where: async () => void writes.push({ op: "delete", table: getTableName(table) }) }),
    insert: (table: never) => ({ values: async (values: Record<string, unknown>) => void writes.push({ op: "insert", table: getTableName(table), values }) }),
    execute: async () => void writes.push({ op: "execute" }),
  };
  return { tx, writes };
}

const owner = { user: { id: 1, name: "Billy", platformRole: "owner" } };
const keepUser = { id: 88, name: "Mitchel Ndakala", platformRole: null, phone: "254712345678", email: "mitchendakala@gmail.com", googleId: null };
const dupUser = { id: 47, name: "Mitchel", platformRole: null, phone: null, email: "mitchel@greatminds.local", googleId: null };
const membership = (groupId: number, name: string, role = "admin") => ({ groupId, group: { name }, status: "active", role });

beforeEach(() => {
  auth.requirePlatformPermission.mockReset();
  rls.withPlatformAdmin.mockReset();
});

describe("mergeUsersAction: owners only", () => {
  it("asks for the owner-only merge permission, which support does not have", async () => {
    auth.requirePlatformPermission.mockResolvedValue(owner);
    const { tx } = fakeTx({ keep: keepUser, dup: dupUser });
    rls.withPlatformAdmin.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));
    await mergeUsersAction(88, 47);
    expect(auth.requirePlatformPermission).toHaveBeenCalledWith("platform.users.merge");
    expect(canPlatform("owner", "platform.users.merge")).toBe(true);
    expect(canPlatform("support", "platform.users.merge")).toBe(false);
    expect(canPlatform(null, "platform.users.merge")).toBe(false);
  });

  it("does no database work when the permission check turns the caller away", async () => {
    auth.requirePlatformPermission.mockRejectedValue(new Error("NEXT_REDIRECT /dashboard"));
    await expect(mergeUsersAction(88, 47)).rejects.toThrow("NEXT_REDIRECT");
    expect(rls.withPlatformAdmin).not.toHaveBeenCalled();
  });
});

describe("mergeUsersAction: refusals", () => {
  beforeEach(() => auth.requirePlatformPermission.mockResolvedValue(owner));

  it("refuses to fold in an account with a platform role, and changes nothing", async () => {
    const { tx, writes } = fakeTx({ keep: keepUser, dup: { ...dupUser, platformRole: "support" } });
    rls.withPlatformAdmin.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));
    expect(await mergeUsersAction(88, 47)).toEqual({ error: "Remove the duplicate's platform role before merging" });
    expect(writes).toEqual([]);
  });

  it("refuses when both accounts have savings in the same group, and changes nothing", async () => {
    const { tx, writes } = fakeTx({
      keep: keepUser,
      dup: dupUser,
      keepMemberships: [membership(172, "Big Minds(Ndakalas)", "member")],
      dupMemberships: [membership(172, "Big Minds(Ndakalas)", "admin")],
      keepMembers: [{ groupId: 172 }],
      dupMembers: [{ groupId: 172 }],
    });
    rls.withPlatformAdmin.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));
    const result = await mergeUsersAction(88, 47);
    expect(result).toEqual({ error: expect.stringContaining("Both accounts have savings records in Big Minds(Ndakalas)") });
    expect(writes).toEqual([]);
  });

  it("refuses the same account twice before touching the database", async () => {
    expect(await mergeUsersAction(88, 88)).toEqual({ error: "Choose two different accounts" });
    expect(rls.withPlatformAdmin).not.toHaveBeenCalled();
  });
});

describe("mergeUsersAction: a good merge", () => {
  it("moves the duplicate's group, deactivates it and writes both audit entries", async () => {
    auth.requirePlatformPermission.mockResolvedValue(owner);
    const { tx, writes } = fakeTx({
      keep: keepUser,
      dup: dupUser,
      keepMemberships: [membership(200, "Friends group")],
      dupMemberships: [membership(172, "Big Minds(Ndakalas)")],
      keepMembers: [{ groupId: 200 }],
      dupMembers: [{ groupId: 172 }],
    });
    rls.withPlatformAdmin.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));

    expect(await mergeUsersAction(88, 47)).toEqual({ ok: true });

    expect(writes.find((w) => w.op === "update" && w.table === "group_memberships")?.values).toMatchObject({ userId: 88 });
    expect(writes.find((w) => w.op === "update" && w.table === "users" && w.values?.active === false)?.values).toMatchObject({ mergedIntoUserId: 88, email: null });
    const audit = writes.filter((w) => w.op === "insert" && w.table === "platform_user_audit_logs").map((w) => w.values);
    expect(audit).toHaveLength(2);
    expect(audit[0]).toMatchObject({ targetUserId: 88, actorUserId: 1, eventType: "user_merged" });
    expect(audit[1]).toMatchObject({ targetUserId: 47, actorUserId: 1, eventType: "user_merged_away" });
    expect(String(audit[0]?.note)).toContain("Merged account #47 (Mitchel) into #88 (Mitchel Ndakala)");
  });
});
