import { PageHeader } from "@/components/feature/page-header";
import { StatementTimeline } from "@/components/feature/statement-timeline";
import { Card, CardContent } from "@/components/ui/card";
import type { loadStatement } from "./data";

type Data = Awaited<ReturnType<typeof loadStatement>> & { member: NonNullable<Awaited<ReturnType<typeof loadStatement>>["member"]> };

export function StatementView({
  title,
  description,
  data,
  action,
}: {
  title: string;
  description: string;
  data: Data;
  /** Shown under the heading (e.g. Pay by M-Pesa). */
  action?: React.ReactNode;
}) {
  const { member, contribs, memberLoans, repayments, memberFines, paybillNumber } = data;
  const saved = Number(member.capital) + Number(member.security) + Number(member.personalSavings);
  const owedFines = memberFines
    .filter((f) => f.status === "pending")
    .reduce((sum, f) => sum + Number(f.amount), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={description}
      />
      {action}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="border-emerald-500/40 bg-emerald-500/5">
          <CardContent className="space-y-1 pt-6">
            <p className="text-base text-muted-foreground">Total I have saved</p>
            <p className="text-4xl font-bold tabular-nums">Ksh {saved.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className={owedFines > 0 ? "border-amber-500/50 bg-amber-500/5" : undefined}>
          <CardContent className="space-y-1 pt-6">
            <p className="text-base text-muted-foreground">Fines I must pay</p>
            <p className="text-4xl font-bold tabular-nums">Ksh {owedFines.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>
      {paybillNumber && member.memberNumber && (
        <Card>
          <CardContent className="pt-6 text-base">
            <p className="text-muted-foreground">How to pay by M-Pesa</p>
            <p>
              Paybill <strong>{paybillNumber}</strong> · Account <strong>{member.memberNumber}</strong>
              <span className="text-sm text-muted-foreground"> (add “welfare” or “loan” after the number for those)</span>
            </p>
          </CardContent>
        </Card>
      )}
      <h2 className="text-xl font-semibold">History</h2>
      <StatementTimeline
        contributions={contribs}
        loans={memberLoans}
        repayments={repayments}
        fines={memberFines}
      />
    </div>
  );
}
