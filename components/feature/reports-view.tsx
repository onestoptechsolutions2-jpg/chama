"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Report = {
  monthly: { year: number | null; month: number | null; total: string }[];
  balances: { name: string; total: string }[];
  loansByStatus: { status: string; count: number; outstanding: string }[];
  finesByStatus: { status: string; total: string }[];
};

function money(value: string | number) { return `Ksh ${Number(value).toLocaleString()}`; }
function BarList({ rows, label }: { rows: { label: string; value: number }[]; label: string }) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return <Card><CardHeader><CardTitle className="text-base">{label}</CardTitle></CardHeader><CardContent className="space-y-3">{rows.length === 0 && <p className="text-sm text-muted-foreground">No data yet.</p>}{rows.map((row) => <div key={row.label} className="space-y-1"><div className="flex justify-between text-sm"><span>{row.label}</span><span className="font-medium">{money(row.value)}</span></div><div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${Math.max((row.value / max) * 100, 2)}%` }} /></div></div>)}</CardContent></Card>;
}

export function ReportsView({ report }: { report: Report }) {
  function exportCsv() { window.location.assign("/reports/export"); }
  return <div className="space-y-6"><div className="flex justify-end"><Button onClick={exportCsv}>Export CSV</Button></div><div className="grid gap-4 lg:grid-cols-2"><BarList label="Contributions by month" rows={report.monthly.map((row) => ({ label: `${row.year ?? ""}-${String(row.month ?? 0).padStart(2, "0")}`, value: Number(row.total) }))} /><BarList label="Top member balances" rows={report.balances.map((row) => ({ label: row.name, value: Number(row.total) }))} /></div><div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle className="text-base">Loan exposure</CardTitle></CardHeader><CardContent className="space-y-2">{report.loansByStatus.map((row) => <div key={row.status} className="flex justify-between text-sm"><span className="capitalize">{row.status}</span><span>{row.count} · {money(row.outstanding)}</span></div>)}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">Fines by status</CardTitle></CardHeader><CardContent className="space-y-2">{report.finesByStatus.map((row) => <div key={row.status} className="flex justify-between text-sm"><span className="capitalize">{row.status}</span><span>{money(row.total)}</span></div>)}</CardContent></Card></div></div>;
}