"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { recordMeetingAction, type CollectInput } from "@/app/(dashboard)/dashboard/collect/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { displayPhone } from "@/lib/domain/identity";

type Row = { id: number; name: string; phone: string | null; loan: { loanId: number; remaining: number } | null };
type Amounts = { capital: string; personal_savings: string; welfare: string; mgr: string; loan: string };
const EMPTY: Amounts = { capital: "", personal_savings: "", welfare: "", mgr: "", loan: "" };

const ksh = (n: number) => `Ksh ${Math.round(n).toLocaleString()}`;
const num = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * Meeting day on one screen: a line per member, type what they paid, save
 * once. All-or-nothing — if one line is wrong, nothing is saved.
 */
export function CollectSheet({
  rows,
  usual,
  showWelfare,
  showMgr = false,
  showLoans,
  myMemberId,
}: {
  rows: Row[];
  usual: { capital: number; welfare: number; mgr?: number };
  showWelfare: boolean;
  /** Merry-go-round on: an MGR column, counted towards the live rotation (who has paid in). */
  showMgr?: boolean;
  showLoans: boolean;
  myMemberId: number | null;
}) {
  const [amounts, setAmounts] = useState<Record<number, Amounts>>({});
  const [reference, setReference] = useState("");
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();

  const set = (id: number, field: keyof Amounts, value: string) =>
    setAmounts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? EMPTY), [field]: value } }));

  const total = useMemo(
    () =>
      Object.values(amounts).reduce(
        (s, a) => s + num(a.capital) + num(a.personal_savings) + num(a.welfare) + num(a.mgr) + num(a.loan),
        0,
      ),
    [amounts],
  );

  function fillUsual() {
    setAmounts((prev) => {
      const next = { ...prev };
      for (const r of rows) {
        const a = next[r.id] ?? EMPTY;
        next[r.id] = {
          ...a,
          capital: a.capital || (usual.capital > 0 ? String(usual.capital) : ""),
          welfare: showWelfare ? a.welfare || (usual.welfare > 0 ? String(usual.welfare) : "") : "",
          mgr: showMgr ? a.mgr || ((usual.mgr ?? 0) > 0 ? String(usual.mgr) : "") : "",
        };
      }
      return next;
    });
  }

  function save() {
    const input: CollectInput = { entries: [], repayments: [], reference };
    for (const r of rows) {
      const a = amounts[r.id];
      if (!a) continue;
      for (const type of ["capital", "personal_savings", "welfare", "mgr"] as const) {
        if (num(a[type]) > 0) input.entries.push({ memberId: r.id, type, amount: num(a[type]) });
      }
      if (r.loan && num(a.loan) > 0) input.repayments.push({ loanId: r.loan.loanId, amount: num(a.loan) });
    }
    if (input.entries.length + input.repayments.length === 0) {
      toast.error("Type at least one amount");
      return;
    }
    startTransition(async () => {
      const result = await recordMeetingAction(input);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(`Saved ${result.count} payments · ${ksh(result.total)}`);
      setAmounts({});
      setReference("");
    });
  }

  const q = query.trim().toLowerCase();
  const shown = q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
  const cols = 2 + (showWelfare ? 1 : 0) + (showMgr ? 1 : 0) + (showLoans ? 1 : 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1 space-y-1">
          <Label htmlFor="collect-ref">Note for all (optional)</Label>
          <Input
            id="collect-ref"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="e.g. Cash, meeting 12 Oct"
          />
        </div>
        {(usual.capital > 0 || usual.welfare > 0 || (showMgr && (usual.mgr ?? 0) > 0)) && (
          <Button type="button" variant="outline" onClick={fillUsual}>
            Fill usual amounts
          </Button>
        )}
      </div>

      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a member" aria-label="Find a member" />

      <div className="space-y-2">
        {shown.map((r) => {
          const a = amounts[r.id] ?? EMPTY;
          const ownLoan = r.id === myMemberId;
          return (
            <Card key={r.id}>
              <CardContent className="space-y-2 pt-4">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-semibold">{r.name}</p>
                  <p className="text-xs text-muted-foreground">{displayPhone(r.phone)}</p>
                </div>
                <div className={`grid gap-2 ${cols >= 4 ? "grid-cols-2 sm:grid-cols-4" : cols === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                  <AmountInput label="Shares" value={a.capital} onChange={(v) => set(r.id, "capital", v)} />
                  <AmountInput label="Savings" value={a.personal_savings} onChange={(v) => set(r.id, "personal_savings", v)} />
                  {showWelfare && <AmountInput label="Welfare" value={a.welfare} onChange={(v) => set(r.id, "welfare", v)} />}
                  {showMgr && <AmountInput label="Merry-go-round" value={a.mgr} onChange={(v) => set(r.id, "mgr", v)} />}
                  {showLoans &&
                    (r.loan && !ownLoan ? (
                      <AmountInput
                        label={`Loan (owes ${ksh(r.loan.remaining)})`}
                        value={a.loan}
                        onChange={(v) => set(r.id, "loan", v)}
                      />
                    ) : (
                      <div className="flex items-end pb-2 text-xs text-muted-foreground">
                        {r.loan ? "Another official records your loan" : "No loan"}
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="sticky bottom-20 z-10 flex items-center justify-between gap-3 rounded-xl border bg-background p-3 shadow-sm md:bottom-4">
        <p className="text-lg font-bold tabular-nums">{ksh(total)}</p>
        <Button size="lg" disabled={pending || total === 0} onClick={save}>
          {pending ? "Saving…" : "Save all"}
        </Button>
      </div>
    </div>
  );
}

function AmountInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="space-y-1 text-xs text-muted-foreground">
      <span>{label}</span>
      <Input
        type="number"
        inputMode="numeric"
        min="0"
        step="1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-base text-foreground"
      />
    </label>
  );
}
