import { eq } from "drizzle-orm";
import { verifyStatementToken } from "@/lib/statement-link";
import { withPlatformAdmin } from "@/lib/db/rls";
import { groups } from "@/lib/db/schema";
import { loadStatement } from "@/app/(dashboard)/dashboard/statement/data";
import { StatementView } from "@/app/(dashboard)/dashboard/statement/statement-view";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { robots: { index: false, follow: false } };

/**
 * A member's own statement from the link in their SMS receipt — no login.
 * The signed token names exactly one member in one group (lib/statement-link.ts),
 * so it can't be changed to show anyone else's.
 */
export default async function SharedStatementPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const target = verifyStatementToken(token);
  if (!target) {
    return (
      <main className="mx-auto max-w-md p-4">
        <Card>
          <CardContent className="pt-6 text-muted-foreground">
            This statement link has expired or is not valid. Your next payment receipt will have a fresh one.
          </CardContent>
        </Card>
      </main>
    );
  }
  const group = await withPlatformAdmin((tx) =>
    tx.query.groups.findFirst({ where: eq(groups.id, target.groupId), columns: { name: true } }),
  );
  const data = await loadStatement(target.groupId, target.memberId);
  if (!data.member || !group) return null;
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4">
      <StatementView
        title={`${data.member.name} — ${group.name}`}
        description="Your savings, loans and fines in this group. Read-only."
        data={{ ...data, member: data.member }}
      />
    </main>
  );
}
