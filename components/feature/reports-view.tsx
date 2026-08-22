"use client";

import { Button } from "@/components/ui/button";
import { SequentialColumnChart, RankedBarList, StatusBarList } from "@/components/feature/charts";

type Report = {
  monthly: { year: number | null; month: number | null; total: string }[];
  balances: { name: string; total: string }[];
  loansByStatus: { status: string; count: number; outstanding: string }[];
  finesByStatus: { status: string; total: string }[];
};

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const LOAN_STATUS_ROLE: Record<string, "good" | "warning" | "serious" | "critical" | "neutral"> = {
  cleared: "good",
  active: "neutral",
  pending: "warning",
  extended: "serious",
  overdue: "critical",
  rejected: "neutral",
};

const FINE_STATUS_ROLE: Record<string, "good" | "warning" | "serious" | "critical" | "neutral"> = {
  paid: "good",
  pending: "warning",
  waived: "neutral",
};

function money(value: string | number) {
  return `Ksh ${Number(value).toLocaleString()}`;
}

export function ReportsView({ report }: { report: Report }) {
  function exportCsv() {
    window.location.assign("/dashboard/reports/export");
  }

  const monthly = report.monthly.map((row) => ({
    label: row.month ? `${MONTH_LABELS[row.month - 1]} ${String(row.year ?? "").slice(2)}` : "—",
    value: Number(row.total),
  }));

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={exportCsv}>Export CSV</Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SequentialColumnChart
          title="Contributions by month"
          data={monthly}
          formatValue={money}
          emptyLabel="No contributions recorded yet."
        />
        <RankedBarList
          title="Top member balances"
          data={report.balances.map((row) => ({ label: row.name, value: Number(row.total) }))}
          formatValue={money}
          emptyLabel="No member balances yet."
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <StatusBarList
          title="Loan exposure"
          rows={report.loansByStatus.map((row) => ({
            label: row.status,
            value: Number(row.outstanding),
            secondary: `${row.count} loan${row.count === 1 ? "" : "s"}`,
            status: LOAN_STATUS_ROLE[row.status] ?? "neutral",
          }))}
          formatValue={money}
          emptyLabel="No loans recorded yet."
        />
        <StatusBarList
          title="Fines by status"
          rows={report.finesByStatus.map((row) => ({
            label: row.status,
            value: Number(row.total),
            status: FINE_STATUS_ROLE[row.status] ?? "neutral",
          }))}
          formatValue={money}
          emptyLabel="No fines recorded yet."
        />
      </div>
    </div>
  );
}
