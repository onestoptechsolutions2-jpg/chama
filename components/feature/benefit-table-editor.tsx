"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { saveBenefitScheduleAction } from "@/app/(dashboard)/dashboard/welfare/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { welfareClaimTypes } from "@/lib/validation/welfare";
import { DEFAULT_FUNERAL_BENEFITS, type BenefitItem } from "@/lib/domain/welfare-benefits";

type Row = { label: string; reason: string; amount: string };

/** Admin editor for the group's benefit table (fixed payout per event). */
export function BenefitTableEditor({ initial }: { initial: BenefitItem[] }) {
  const toRows = (items: BenefitItem[]): Row[] => items.map((b) => ({ label: b.label, reason: b.reason, amount: String(b.amount) }));
  const [rows, setRows] = useState<Row[]>(toRows(initial));
  const [pending, startTransition] = useTransition();
  const update = (i: number, patch: Partial<Row>) => setRows((r) => r.map((row, n) => (n === i ? { ...row, ...patch } : row)));

  function save() {
    startTransition(async () => {
      const result = await saveBenefitScheduleAction(rows.map((r) => ({ ...r, amount: Number(r.amount) || 0 })));
      if (result?.error) toast.error(result.error);
      else toast.success("Benefit table saved");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Benefit table</CardTitle>
        <p className="text-sm text-muted-foreground">
          What the group pays for each event. Members pick from this list and the amount is fixed. Leave it empty to let members
          ask for any amount (up to the policy limits).
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
            <Input value={row.label} onChange={(e) => update(i, { label: e.target.value })} placeholder="e.g. Death of a parent" aria-label="Event" />
            <select
              value={row.reason}
              onChange={(e) => update(i, { reason: e.target.value })}
              className="hidden h-10 rounded-md border bg-background px-2 text-sm capitalize sm:block"
              aria-label="Kind"
            >
              {welfareClaimTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <Input
              type="number"
              min="1"
              value={row.amount}
              onChange={(e) => update(i, { amount: e.target.value })}
              placeholder="Ksh"
              aria-label="Amount"
              className="hidden sm:block"
            />
            <Button variant="ghost" size="sm" onClick={() => setRows((r) => r.filter((_, n) => n !== i))} aria-label="Remove">
              <Trash2 className="size-4" />
            </Button>
            <Input
              type="number"
              min="1"
              value={row.amount}
              onChange={(e) => update(i, { amount: e.target.value })}
              placeholder="Ksh"
              aria-label="Amount"
              className="col-span-2 sm:hidden"
            />
          </div>
        ))}
        <div className="flex flex-wrap gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => setRows((r) => [...r, { label: "", reason: "bereavement", amount: "" }])}>
            <Plus className="size-4" /> Add a row
          </Button>
          {rows.length === 0 && (
            <Button variant="outline" size="sm" onClick={() => setRows(toRows(DEFAULT_FUNERAL_BENEFITS))}>
              Start from a funeral-group table
            </Button>
          )}
          <Button size="sm" disabled={pending} onClick={save}>
            {pending ? "Saving…" : "Save table"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
