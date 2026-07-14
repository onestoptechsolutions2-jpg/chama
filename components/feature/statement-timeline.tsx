"use client";

import { useMemo, useState } from "react";
import type {
  contributions as contributionsTable,
  loans as loansTable,
  loanRepayments as loanRepaymentsTable,
  fines as finesTable,
} from "@/lib/db/schema";
import type { VariantProps } from "class-variance-authority";
import { isActiveLoanStatus } from "@/lib/domain/loans";
import { Badge, badgeVariants } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Contribution = typeof contributionsTable.$inferSelect;
type Loan = typeof loansTable.$inferSelect;
type Repayment = typeof loanRepaymentsTable.$inferSelect;
type Fine = typeof finesTable.$inferSelect;

type TimelineType = "contribution" | "repayment" | "fine" | "loan";

type TimelineItem = {
  key: string;
  type: TimelineType;
  date: string;
  amount: number;
  description: string;
  status?: string;
};

function ksh(n: string | number) {
  return `Ksh ${Number(n).toLocaleString()}`;
}

const typeBadge: Record<TimelineType, VariantProps<typeof badgeVariants>["variant"]> = {
  contribution: "secondary",
  repayment: "default",
  fine: "destructive",
  loan: "outline",
};

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

export function StatementTimeline({
  contributions,
  loans,
  repayments,
  fines,
}: {
  contributions: Contribution[];
  loans: Loan[];
  repayments: Repayment[];
  fines: Fine[];
}) {
  const [filter, setFilter] = useState<TimelineType | "all">("all");

  const items = useMemo<TimelineItem[]>(() => {
    const all: TimelineItem[] = [
      ...contributions.map((c) => ({
        key: `contribution-${c.id}`,
        type: "contribution" as const,
        date: c.createdAt.toISOString(),
        amount: Number(c.amount),
        description: `${c.type.replace("_", " ")} contribution`,
        status: c.status,
      })),
      ...loans.map((l) => ({
        key: `loan-${l.id}`,
        type: "loan" as const,
        date: l.createdAt.toISOString(),
        amount: Number(l.principal),
        description: l.purpose ? `Loan — ${l.purpose}` : "Loan",
        status: l.status,
      })),
      ...repayments.map((r) => ({
        key: `repayment-${r.id}`,
        type: "repayment" as const,
        date: r.createdAt.toISOString(),
        amount: Number(r.amount),
        description: `Loan repayment #${r.loanId}`,
      })),
      ...fines.map((f) => ({
        key: `fine-${f.id}`,
        type: "fine" as const,
        date: f.createdAt.toISOString(),
        amount: Number(f.amount),
        description: f.reason ?? f.type.replace("_", " "),
        status: f.status,
      })),
    ];
    return all.sort((a, b) => b.date.localeCompare(a.date));
  }, [contributions, loans, repayments, fines]);

  const filtered = filter === "all" ? items : items.filter((i) => i.type === filter);

  const totalContributed = contributions
    .filter((c) => c.status === "paid")
    .reduce((s, c) => s + Number(c.amount), 0);
  const totalRepaid = repayments.reduce((s, r) => s + Number(r.amount), 0);
  const totalFined = fines.reduce((s, f) => s + Number(f.amount), 0);
  const activeLoanCount = loans.filter((l) => isActiveLoanStatus(l.status)).length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Total contributed" value={ksh(totalContributed)} />
        <Metric label="Total repaid" value={ksh(totalRepaid)} />
        <Metric label="Total fined" value={ksh(totalFined)} />
        <Metric label="Active loans" value={String(activeLoanCount)} />
      </div>

      <div className="flex gap-2">
        {(["all", "contribution", "repayment", "fine", "loan"] as const).map((t) => (
          <Button
            key={t}
            variant={filter === t ? "default" : "outline"}
            size="sm"
            className="capitalize"
            onClick={() => setFilter(t)}
          >
            {t}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-2">
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground">No records.</p>
          )}
          {filtered.map((item) => (
            <div
              key={item.key}
              className="flex items-center justify-between gap-4 border-b py-2 text-sm last:border-0"
            >
              <div className="flex items-center gap-2">
                <Badge variant={typeBadge[item.type]} className="capitalize">
                  {item.type}
                </Badge>
                <span>{item.description}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                {item.status && <span className="capitalize">{item.status}</span>}
                <span className="font-medium text-foreground">{ksh(item.amount)}</span>
                <span>{new Date(item.date).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
