/**
 * Seed script — creates the "GreatMinds" table-banking chama: a real group
 * with welfare enabled, a biweekly (every-2-weeks) 500 KES table-banking
 * contribution, its 9 founding members (with login credentials), and their
 * merry-go-round (MGR) payout schedule pre-assigned to the dates given.
 *
 * "Table banking cycle" here = one mgr_cycles row per payout date; each
 * cycle has exactly one slot (mgr_slots), pre-claimed by the member whose
 * turn it is. This mirrors what generateScheduleAction (app/(dashboard)/mgr/actions.ts)
 * would produce for frequency=biweekly, recipientsPerCycle=1 — except the
 * dates/assignments are the group's actual agreed rotation, not computed,
 * so slots are inserted already "claimed" rather than "open".
 *
 * Two of the nine (Bill = patron, Mitchel = matron) hold titles the schema's
 * membership_role enum has no office for (only admin/treasurer/secretary/
 * member — see lib/domain/officials.ts) — recorded as a note on their
 * members row instead; their login role is plain "member".
 *
 * Safe to re-run: skips entirely if a group named "GreatMinds" already exists.
 */
import { fileURLToPath } from "url";
import { eq } from "drizzle-orm";
import { pool } from "../lib/db/client";
import { withPlatformAdmin } from "../lib/db/rls";
import {
  groups,
  users,
  members,
  groupMemberships,
  mgrCycles,
  mgrSlots,
  mgrMemberTurns,
  mgrSlotEvents,
} from "../lib/db/schema";
import { hashPassword } from "../lib/auth/password";
import { computeRegistrationComplete, type MembershipRole } from "../lib/domain/officials";

const GROUP_NAME = "GreatMinds";
const CONTRIBUTION_AMOUNT = 500;
const RECIPIENTS_PER_CYCLE = 1;
const DEFAULT_PASSWORD = "GreatMinds2026!";
const EMAIL_DOMAIN = "greatminds.local";

type SeedMember = {
  name: string;
  emailSlug: string;
  date: string; // MGR payout date, YYYY-MM-DD
  role: MembershipRole;
  title?: string; // honorary title with no membership_role equivalent
};

const SEED_MEMBERS: SeedMember[] = [
  { name: "Skina", emailSlug: "skina", date: "2026-08-30", role: "member" },
  { name: "Flo", emailSlug: "flo", date: "2026-09-15", role: "secretary" },
  { name: "Bill", emailSlug: "bill", date: "2026-09-30", role: "member", title: "Patron" },
  { name: "Flo aishoya", emailSlug: "floaishoya", date: "2026-10-15", role: "member" },
  { name: "Treazer", emailSlug: "treazer", date: "2026-10-30", role: "member" },
  { name: "Mitchel", emailSlug: "mitchel", date: "2026-11-15", role: "member", title: "Matron" },
  { name: "Sylvia", emailSlug: "sylvia", date: "2026-11-30", role: "admin" }, // chair
  { name: "Vivian", emailSlug: "vivian", date: "2026-12-15", role: "treasurer" },
  { name: "Mercy", emailSlug: "mercy", date: "2026-12-30", role: "member" },
];

export type SeedGreatMindsResult = {
  groupId: number;
  created: boolean;
  credentials: { name: string; email: string; password: string }[];
};

export async function seedGreatMinds(): Promise<SeedGreatMindsResult> {
  const existing = await withPlatformAdmin((tx) =>
    tx.query.groups.findFirst({ where: (g, { eq }) => eq(g.name, GROUP_NAME) }),
  );
  if (existing) {
    return { groupId: existing.id, created: false, credentials: [] };
  }

  const passwordHash = await hashPassword(DEFAULT_PASSWORD);
  const contribPerCycle = CONTRIBUTION_AMOUNT * SEED_MEMBERS.length;
  const payoutPerSlot = contribPerCycle / RECIPIENTS_PER_CYCLE;

  return withPlatformAdmin(async (tx) => {
    const [group] = await tx
      .insert(groups)
      .values({
        name: GROUP_NAME,
        type: "chama",
        currency: "KES",
        loansEnabled: true,
        mgrEnabled: true,
        welfareEnabled: true,
        projectsEnabled: false,
        mgrFrequency: "biweekly",
        mgrContributionAmount: String(CONTRIBUTION_AMOUNT),
        mgrRecipientsPerCycle: RECIPIENTS_PER_CYCLE,
        mgrMemberCount: SEED_MEMBERS.length,
        mgrStartDate: SEED_MEMBERS[0].date,
      })
      .returning();

    const credentials: SeedGreatMindsResult["credentials"] = [];
    const memberRowByEmailSlug = new Map<string, { id: number; userId: number }>();

    for (const sm of SEED_MEMBERS) {
      const email = `${sm.emailSlug}@${EMAIL_DOMAIN}`;
      const [user] = await tx
        .insert(users)
        .values({ name: sm.name, email, passwordHash })
        .returning();

      const [memberRow] = await tx
        .insert(members)
        .values({
          groupId: group.id,
          userId: user.id,
          name: sm.name,
          email,
          notes: sm.title ? `${sm.title} (honorary)` : null,
        })
        .returning();

      await tx.insert(groupMemberships).values({
        userId: user.id,
        groupId: group.id,
        role: sm.role,
        status: "active",
        rulesAcceptedAt: new Date(),
      });

      await tx.insert(mgrMemberTurns).values({
        groupId: group.id,
        memberId: memberRow.id,
        turnsTotal: 1,
        contributionMultiplier: "1.0",
      });

      memberRowByEmailSlug.set(sm.emailSlug, { id: memberRow.id, userId: user.id });
      credentials.push({ name: sm.name, email, password: DEFAULT_PASSWORD });
    }

    await tx
      .update(groups)
      .set({
        registrationComplete: computeRegistrationComplete(SEED_MEMBERS.map((m) => m.role)),
      })
      .where(eq(groups.id, group.id));

    // One table-banking cycle per payout date, sole slot pre-claimed by
    // that member — see generateScheduleAction for the "open, unassigned"
    // counterpart this mirrors.
    for (let i = 0; i < SEED_MEMBERS.length; i++) {
      const sm = SEED_MEMBERS[i];
      const cycleNumber = i + 1;
      const memberRow = memberRowByEmailSlug.get(sm.emailSlug)!;

      const [cycle] = await tx
        .insert(mgrCycles)
        .values({
          groupId: group.id,
          cycleNumber,
          status: cycleNumber === 1 ? "active" : "planned",
          scheduledDate: sm.date,
          slotCount: RECIPIENTS_PER_CYCLE,
          payoutPerSlot: String(payoutPerSlot),
          totalContributions: String(contribPerCycle),
        })
        .returning();

      const [slot] = await tx
        .insert(mgrSlots)
        .values({
          groupId: group.id,
          cycleId: cycle.id,
          cycleNumber,
          slotNumber: 1,
          memberId: memberRow.id,
          status: "claimed",
          payoutAmount: String(payoutPerSlot),
          scheduledDate: sm.date,
          claimedAt: new Date(),
        })
        .returning();

      await tx.insert(mgrSlotEvents).values({
        groupId: group.id,
        slotId: slot.id,
        actorUserId: null,
        actorRole: null,
        action: "seed_assign",
        fromStatus: "open",
        toStatus: "claimed",
        toMemberId: memberRow.id,
        note: "Pre-assigned from the group's agreed rotation at seed time",
      });
    }

    return { groupId: group.id, created: true, credentials };
  });
}

async function main() {
  const result = await seedGreatMinds();
  if (result.created) {
    console.log(`Seeded group "${GROUP_NAME}" (#${result.groupId})`);
    console.log(`\nLogins (shared password: ${DEFAULT_PASSWORD}):`);
    for (const c of result.credentials) {
      console.log(`  ${c.name.padEnd(14)} ${c.email}`);
    }
  } else {
    console.log(`Seed skipped — a group named "${GROUP_NAME}" already exists (id ${result.groupId})`);
  }
}

const isMainModule =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMainModule) {
  main()
    .catch((err) => {
      console.error("Seed failed:", err);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
