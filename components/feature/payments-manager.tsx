"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  assignPaymentAction,
  ignorePaymentAction,
  importPaymentsAction,
  rotateMpesaLinkAction,
  savePaymentSetupAction,
  type PaymentsState,
} from "@/app/(dashboard)/dashboard/payments/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { displayPhone } from "@/lib/domain/identity";

type Payment = {
  id: number;
  source: string;
  amount: number;
  payerName: string | null;
  payerPhone: string | null;
  accountRef: string | null;
  receivedAt: string;
  status: string;
  memberName: string | null;
  appliedAs: string | null;
};
type RosterMember = { id: number; name: string; memberNumber: string | null };

const PURPOSES: Record<string, string> = {
  capital: "Shares",
  personal_savings: "Savings",
  welfare: "Welfare",
  loan: "Loan repayment",
  mgr: "Merry-go-round",
  project: "Project",
};
const SOURCES: Record<string, string> = { mpesa: "M-Pesa", bank: "Bank", checkoff: "Payroll" };
const ksh = (n: number) => `Ksh ${Math.round(n).toLocaleString()}`;
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-KE", { timeZone: "Africa/Nairobi", dateStyle: "medium", timeStyle: "short" });

export function PaymentsManager({
  setup,
  unmatched,
  recent,
  roster,
}: {
  setup: { canSetup: boolean; paybillNumber: string; defaultType: string; confirmationUrl: string | null; validationUrl: string | null };
  unmatched: Payment[];
  recent: Payment[];
  roster: RosterMember[];
}) {
  return (
    <div className="space-y-6">
      {unmatched.length > 0 && (
        <Card className="border-amber-500/50">
          <CardHeader>
            <CardTitle className="text-base">Needs matching ({unmatched.length})</CardTitle>
            <p className="text-sm text-muted-foreground">
              We couldn&apos;t tell who these are from. Pick the member — they get their receipt as usual.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {unmatched.map((p) => (
              <AssignRow key={p.id} payment={p} roster={roster} />
            ))}
          </CardContent>
        </Card>
      )}

      <ImportCard />
      {setup.canSetup && <SetupCard setup={setup} />}

      {recent.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            {recent.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  {ksh(p.amount)} · {SOURCES[p.source] ?? p.source} · {p.accountRef ?? "—"}
                </span>
                <span className="text-muted-foreground">
                  {p.status === "ignored" ? "Not group money" : `${p.memberName ?? "?"} · ${PURPOSES[p.appliedAs ?? ""] ?? p.appliedAs}`}{" "}
                  · {when(p.receivedAt)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AssignRow({ payment, roster }: { payment: Payment; roster: RosterMember[] }) {
  const [memberId, setMemberId] = useState("");
  const [purpose, setPurpose] = useState("capital");
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ error: string } | null>, ok: string) =>
    startTransition(async () => {
      const r = await fn();
      if (r?.error) toast.error(r.error);
      else toast.success(ok);
    });

  return (
    <div className="space-y-2 rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">
          {ksh(payment.amount)} <Badge variant="secondary">{SOURCES[payment.source] ?? payment.source}</Badge>
        </p>
        <p className="text-xs text-muted-foreground">{when(payment.receivedAt)}</p>
      </div>
      <p className="text-muted-foreground">
        {[payment.payerName, payment.payerPhone && displayPhone(payment.payerPhone), payment.accountRef && `account “${payment.accountRef}”`]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <div className="flex flex-wrap gap-2">
        <select
          className="h-9 min-w-40 flex-1 rounded-md border bg-background px-2"
          value={memberId}
          onChange={(e) => setMemberId(e.target.value)}
          aria-label="Member"
        >
          <option value="">Choose member…</option>
          {roster.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
              {m.memberNumber ? ` (#${m.memberNumber})` : ""}
            </option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border bg-background px-2"
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          aria-label="What it's for"
        >
          {Object.entries(PURPOSES).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          disabled={pending || !memberId}
          onClick={() => run(() => assignPaymentAction(payment.id, Number(memberId), purpose), "Recorded")}
        >
          Record
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => ignorePaymentAction(payment.id), "Set aside")}>
          Not ours
        </Button>
      </div>
    </div>
  );
}

function ImportCard() {
  const [state, formAction, pending] = useActionState<PaymentsState, FormData>(importPaymentsAction, null);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Import a bank statement or payroll file</CardTitle>
        <p className="text-sm text-muted-foreground">
          CSV with an amount column and the member&apos;s number (account, member_no or employee_no) or a description. Uploading the
          same file twice is safe.
        </p>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1 space-y-1">
            <Label htmlFor="payments-file">CSV file</Label>
            <Input id="payments-file" name="file" type="file" accept=".csv,text/csv" required />
          </div>
          <select name="source" className="h-10 rounded-md border bg-background px-2" aria-label="File type" defaultValue="bank">
            <option value="bank">Bank statement</option>
            <option value="checkoff">Payroll check-off</option>
          </select>
          <Button type="submit" disabled={pending}>
            {pending ? "Importing…" : "Import"}
          </Button>
          {state?.error && <p className="basis-full text-sm text-destructive">{state.error}</p>}
          {state?.message && <p className="basis-full text-sm text-muted-foreground">{state.message}</p>}
        </form>
      </CardContent>
    </Card>
  );
}

function SetupCard({ setup }: { setup: { paybillNumber: string; defaultType: string; confirmationUrl: string | null; validationUrl: string | null } }) {
  const [state, formAction, pending] = useActionState<PaymentsState, FormData>(savePaymentSetupAction, null);
  const [rotating, startTransition] = useTransition();
  const copy = (v: string) => navigator.clipboard.writeText(v).then(() => toast.success("Copied"));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">M-Pesa setup</CardTitle>
        <p className="text-sm text-muted-foreground">
          Members pay your group&apos;s own paybill or till with their member number as the account (e.g. “12”, or “12 welfare”, “12
          loan”). The money goes straight to your account; we only read the payment and record it.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <form action={formAction} className="grid gap-3 sm:grid-cols-3 sm:items-end">
          <div className="space-y-1">
            <Label htmlFor="paybill">Paybill / till number</Label>
            <Input id="paybill" name="paybillNumber" defaultValue={setup.paybillNumber} inputMode="numeric" placeholder="123456" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="default-type">If the account doesn&apos;t say, count it as</Label>
            <select id="default-type" name="paymentDefaultType" defaultValue={setup.defaultType} className="h-10 w-full rounded-md border bg-background px-2">
              {Object.entries(PURPOSES)
                .filter(([v]) => v !== "loan")
                .map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
            </select>
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
          {state?.error && <p className="text-sm text-destructive sm:col-span-3">{state.error}</p>}
          {state?.message && <p className="text-sm text-muted-foreground sm:col-span-3">{state.message}</p>}
        </form>
        {setup.confirmationUrl && setup.validationUrl ? (
          <div className="space-y-2 rounded-lg bg-muted/50 p-3 text-sm">
            <p>
              Register these with Safaricom (Daraja C2B “Register URL”) or ask your M-Pesa provider to send payment notifications
              here. Keep them private.
            </p>
            {[
              ["Confirmation URL", setup.confirmationUrl],
              ["Validation URL", setup.validationUrl],
            ].map(([label, url]) => (
              <div key={label} className="flex flex-wrap items-center gap-2">
                <span className="w-36 text-muted-foreground">{label}</span>
                <code className="min-w-0 flex-1 break-all text-xs">{url}</code>
                <Button size="sm" variant="outline" onClick={() => copy(url)}>
                  Copy
                </Button>
              </div>
            ))}
            <Button
              size="sm"
              variant="ghost"
              disabled={rotating}
              onClick={() => startTransition(() => rotateMpesaLinkAction())}
            >
              Make new links (old ones stop working)
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Save once to get your M-Pesa notification links.</p>
        )}
      </CardContent>
    </Card>
  );
}
