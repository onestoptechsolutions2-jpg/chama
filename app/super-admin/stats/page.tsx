import { sql } from "drizzle-orm";
import { withPlatformAdmin } from "@/lib/db/rls";
import { groups, users, groupMemberships, platformPayments } from "@/lib/db/schema";
import { PageHeader } from "@/components/feature/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function ksh(n: string | number) {
  return `Ksh ${Number(n).toLocaleString()}`;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

export default async function SuperAdminStatsPage() {
  const [groupCounts, userCount, membershipCounts, feeTotal, recentRuns] = await withPlatformAdmin(
    (tx) =>
      Promise.all([
        tx
          .select({
            total: sql<number>`count(*)::int`,
            active: sql<number>`count(*) filter (where ${groups.active})::int`,
          })
          .from(groups)
          .then((r) => r[0]),
        tx
          .select({ total: sql<number>`count(*)::int` })
          .from(users)
          .then((r) => r[0].total),
        tx
          .select({
            active: sql<number>`count(*) filter (where ${groupMemberships.status} = 'active')::int`,
            pending: sql<number>`count(*) filter (where ${groupMemberships.status} = 'pending')::int`,
          })
          .from(groupMemberships)
          .then((r) => r[0]),
        tx
          .select({
            total: sql<string>`coalesce(sum(${platformPayments.amount}) filter (where ${platformPayments.status} = 'paid'), 0)`,
          })
          .from(platformPayments)
          .then((r) => r[0].total),
        tx.query.cronRuns.findMany({
          orderBy: (c, { desc }) => [desc(c.startedAt)],
          limit: 10,
        }),
      ]),
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Platform stats" description="Cross-tenant totals and recent cron activity." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Groups" value={`${groupCounts.active} / ${groupCounts.total} active`} />
        <Metric label="Users" value={String(userCount)} />
        <Metric label="Active memberships" value={String(membershipCounts.active)} />
        <Metric label="Pending join requests" value={String(membershipCounts.pending)} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Metric label="Platform fees collected" value={ksh(feeTotal)} />
      </div>

      <Card>
        <CardContent className="overflow-x-auto pt-6">
          <p className="mb-3 text-sm font-medium">Recent cron runs</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Rows</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentRuns.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No cron runs recorded yet.
                  </TableCell>
                </TableRow>
              )}
              {recentRuns.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.jobName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(r.startedAt).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.status === "success" ? "secondary" : "destructive"}>
                      {r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{r.rowsAffected ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
