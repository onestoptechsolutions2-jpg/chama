import Link from "next/link";
import { and, eq, inArray } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { db } from "@/lib/db/client";
import { groupMemberships, groups, members, rules, users, welfarePolicies } from "@/lib/db/schema";
import { buildConstitution, buildResolutionMinutes, type Section } from "@/lib/domain/registration-pack";
import { displayPhone } from "@/lib/domain/identity";
import { ROLE_LABELS } from "@/lib/domain/invites";
import { nairobiToday } from "@/lib/domain/dates";
import { PrintButton } from "@/components/feature/print-button";

export const metadata = { title: "Registration pack" };

const DOCS = {
  constitution: "Constitution",
  officials: "Officials list",
  register: "Member register",
  minutes: "Resolution minutes",
} as const;
type Doc = keyof typeof DOCS;

/**
 * Printable registration papers, outside the dashboard layout so they print
 * clean (A4, no menus). Written from the group's own settings, rule book,
 * officials and roster.
 */
export default async function RegistrationPackPage({ searchParams }: { searchParams: Promise<{ doc?: string }> }) {
  const session = await requirePermission("governance.manage");
  const groupId = session.activeMembership.groupId;
  const { doc: raw } = await searchParams;
  const doc: Doc = raw && raw in DOCS ? (raw as Doc) : "constitution";

  const { group, ruleRows, roster, policy } = await withTenant(groupId, async (tx) => ({
    group: (await tx.query.groups.findFirst({ where: eq(groups.id, groupId) }))!,
    ruleRows: await tx.query.rules.findMany({
      where: and(eq(rules.groupId, groupId), eq(rules.active, true)),
      orderBy: (r, { asc }) => [asc(r.ruleNumber)],
    }),
    roster: await tx.query.members.findMany({
      where: and(eq(members.groupId, groupId), eq(members.active, true)),
      orderBy: (m, { asc }) => [asc(m.memberNumber), asc(m.name)],
    }),
    policy: await tx.query.welfarePolicies.findFirst({ where: eq(welfarePolicies.groupId, groupId) }),
  }));
  const officials = await db
    .select({ userId: groupMemberships.userId, role: groupMemberships.role, name: users.name, phone: users.phone })
    .from(groupMemberships)
    .innerJoin(users, eq(users.id, groupMemberships.userId))
    .where(and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.status, "active"), inArray(groupMemberships.role, ["admin", "treasurer", "secretary"])));
  const memberByUser = new Map(roster.filter((m) => m.userId).map((m) => [m.userId!, m]));
  const officialRows = officials.map((o) => ({ ...o, roleLabel: ROLE_LABELS[o.role], idNumber: memberByUser.get(o.userId)?.idNumber ?? null }));

  const today = nairobiToday();
  return (
    <main className="mx-auto max-w-[210mm] bg-white p-8 text-[13px] leading-relaxed text-black print:p-0">
      <nav className="mb-6 flex flex-wrap items-center gap-2 print:hidden">
        <Link href="/dashboard/governance" className="text-sm underline">
          ← Back
        </Link>
        {(Object.keys(DOCS) as Doc[]).map((d) => (
          <Link
            key={d}
            href={`?doc=${d}`}
            className={`rounded-md border px-3 py-1 text-sm ${d === doc ? "border-black font-semibold" : "border-gray-300"}`}
          >
            {DOCS[d]}
          </Link>
        ))}
        <span className="ml-auto">
          <PrintButton label="Print / save as PDF" />
        </span>
      </nav>

      <header className="mb-6 text-center">
        <h1 className="text-xl font-bold uppercase">{group.name}</h1>
        <h2 className="text-base font-semibold">{DOCS[doc]}</h2>
        {group.registrationNo && <p>Registration no. {group.registrationNo}</p>}
      </header>

      {doc === "constitution" && (
        <>
          <Sections
            sections={buildConstitution(
              {
                name: group.name,
                description: group.description,
                meetingDay: group.meetingDay,
                meetingVenue: group.meetingVenue,
                sharePrice: Number(group.sharePrice),
                sharesPerMember: group.sharesPerMember,
                loansEnabled: group.loansEnabled,
                mgrEnabled: group.mgrEnabled,
                welfareEnabled: group.welfareEnabled,
                loanInterestRate: Number(group.loanInterestRate),
                loanMaxMultiplier: Number(group.loanMaxMultiplier),
                loanRepaymentMonths: group.loanRepaymentMonths,
                loanMinGuarantors: group.loanMinGuarantors,
                fineLateness: Number(group.fineLateness),
                fineAbsence: Number(group.fineAbsence),
                welfareFixedAmount: policy?.fundingFixedAmount ? Number(policy.fundingFixedAmount) : null,
              },
              ruleRows,
            )}
          />
          <Signatures people={officialRows.map((o) => `${o.name} — ${o.roleLabel}`)} date={today} />
        </>
      )}

      {doc === "officials" && (
        <Table
          head={["Office", "Name", "ID number", "Phone", "Signature"]}
          rows={officialRows.map((o) => [o.roleLabel, o.name, o.idNumber ?? "", displayPhone(o.phone), ""])}
          empty="No officials yet — invite a Treasurer and Secretary from Members."
        />
      )}

      {doc === "register" && (
        <Table
          head={["No.", "Name", "ID number", "Phone", "Joined", "Signature"]}
          rows={roster.map((m) => [m.memberNumber ?? "", m.name, m.idNumber ?? "", displayPhone(m.phone), m.joinedDate, ""])}
          empty="No members yet."
        />
      )}

      {doc === "minutes" && (
        <>
          <p className="mb-4">
            Minutes of a general meeting of {group.name} held on ____________________ at ____________________. Members present:
            ______ of {roster.length}.
          </p>
          <Sections sections={buildResolutionMinutes(group.name, officialRows.map((o) => ({ name: o.name, role: o.roleLabel })))} />
          <Signatures people={officialRows.map((o) => `${o.name} — ${o.roleLabel}`)} date={null} />
        </>
      )}

      <footer className="mt-10 text-center text-[11px] text-gray-500">Prepared {today} from the group&apos;s records.</footer>
    </main>
  );
}

function Sections({ sections }: { sections: Section[] }) {
  return (
    <div className="space-y-4">
      {sections.map((s) => (
        <section key={s.heading} className="break-inside-avoid">
          <h3 className="font-semibold">{s.heading}</h3>
          {s.paragraphs.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </section>
      ))}
    </div>
  );
}

function Signatures({ people, date }: { people: string[]; date: string | null }) {
  const lines = people.length ? people : ["Chairperson", "Treasurer", "Secretary"];
  return (
    <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-3">
      {lines.map((p) => (
        <div key={p} className="break-inside-avoid">
          <div className="h-10 border-b border-black" />
          <p>{p}</p>
          <p className="text-gray-600">Date: {date ?? "____________"}</p>
        </div>
      ))}
    </div>
  );
}

function Table({ head, rows, empty }: { head: string[]; rows: string[][]; empty: string }) {
  if (rows.length === 0) return <p>{empty}</p>;
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h} className="border border-black px-2 py-1 text-left">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="break-inside-avoid">
            {r.map((c, j) => (
              <td key={j} className="h-9 border border-black px-2 py-1">
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
