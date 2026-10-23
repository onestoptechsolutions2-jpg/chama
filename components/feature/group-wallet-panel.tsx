"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  approveWithdrawalAction,
  cancelWithdrawalAction,
  enableWalletAction,
  promptMembersAction,
  requestWithdrawalAction,
  setDestinationAction,
} from "@/app/(dashboard)/dashboard/payments/wallet-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { describeDestination, type PayoutDestination } from "@/lib/domain/group-wallet";

export type WalletWithdrawal = {
  id: number;
  amount: number;
  status: string;
  narrative: string;
  requestedById: number | null;
  requestedBy: string | null;
  approvedBy: string | null;
  createdAt: string;
  error: string | null;
};

type Props = {
  walletId: string | null;
  balance: number | null;
  destination: PayoutDestination | null;
  withdrawals: WalletWithdrawal[];
  roster: { id: number; name: string; memberNumber: string | null; hasPhone: boolean }[];
  bankCodes: { name: string; code: string }[] | null;
  myUserId: number;
  can: { setup: boolean; prompt: boolean; destination: boolean; withdraw: boolean; approve: boolean };
};

const ksh = (n: number) => `Ksh ${Math.round(n).toLocaleString()}`;
const PURPOSES: Record<string, string> = { capital: "Shares", personal_savings: "Savings", welfare: "Welfare", loan: "Loan repayment" };
const STATUS: Record<string, string> = { requested: "Waiting for approval", approved: "Sending", sent: "Sent", failed: "Failed", cancelled: "Cancelled" };

function useRun() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ error: string } | { ok: true; message?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if ("error" in r) toast.error(r.error);
      else {
        if (r.message) toast.success(r.message);
        after?.();
      }
    });
  return { pending, run };
}

/**
 * The group's M-Pesa wallet on IntaSend: prompts that record themselves,
 * the balance, and withdrawals to the group's own account with two officials.
 */
export function GroupWalletPanel(props: Props) {
  const { pending, run } = useRun();
  if (!props.walletId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Collect by M-Pesa prompt</CardTitle>
          <p className="text-sm text-muted-foreground">
            Members get an M-Pesa prompt on their phone, type their PIN, and the payment is on their record at once — no account numbers,
            nothing to match. The money is kept in the group&apos;s own wallet and can only be sent to the group&apos;s bank account or
            paybill, with two officials agreeing.
          </p>
        </CardHeader>
        <CardContent>
          {props.can.setup ? (
            <Button disabled={pending} onClick={() => run(enableWalletAction)}>
              {pending ? "Setting up…" : "Turn on the group wallet"}
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">Ask your admin to turn it on.</p>
          )}
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Group wallet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <p className="text-3xl font-bold tabular-nums">{props.balance === null ? "—" : ksh(props.balance)}</p>
          <p className="text-sm text-muted-foreground">
            {props.balance === null ? "Balance unavailable right now." : "Available now."} Withdrawals go only to{" "}
            {props.destination ? describeDestination(props.destination) : "the group's own account (not set yet)"}.
          </p>
        </CardContent>
      </Card>
      {props.can.prompt && <PromptCard roster={props.roster} />}
      <WithdrawalsCard {...props} />
      {props.can.destination && <DestinationCard destination={props.destination} bankCodes={props.bankCodes} />}
    </div>
  );
}

function PromptCard({ roster }: { roster: Props["roster"] }) {
  const { pending, run } = useRun();
  const withPhone = roster.filter((m) => m.hasPhone);
  const [selected, setSelected] = useState<number[]>(withPhone.map((m) => m.id));
  const [purpose, setPurpose] = useState("capital");
  const [amount, setAmount] = useState("");
  const toggle = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Send M-Pesa prompts</CardTitle>
        <p className="text-sm text-muted-foreground">Each chosen member gets a prompt for the amount; it records itself when they pay.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <select value={purpose} onChange={(e) => setPurpose(e.target.value)} className="h-10 rounded-md border bg-background px-2 text-sm" aria-label="For">
            {Object.entries(PURPOSES).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <Input type="number" inputMode="numeric" min="10" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Ksh each" className="w-32" />
        </div>
        <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2 text-sm">
          {withPhone.length === 0 && <p className="text-muted-foreground">No members with phone numbers yet.</p>}
          {withPhone.map((m) => (
            <label key={m.id} className="flex items-center gap-2 py-1">
              <input type="checkbox" checked={selected.includes(m.id)} onChange={() => toggle(m.id)} />
              {m.name} {m.memberNumber && <span className="text-muted-foreground">#{m.memberNumber}</span>}
            </label>
          ))}
        </div>
        <Button
          disabled={pending || !selected.length || !(Number(amount) >= 10)}
          onClick={() => run(() => promptMembersAction(selected, purpose, Number(amount)))}
        >
          {pending ? "Sending…" : `Send ${selected.length} prompt(s)`}
        </Button>
      </CardContent>
    </Card>
  );
}

function WithdrawalsCard(props: Props) {
  const { pending, run } = useRun();
  const [amount, setAmount] = useState("");
  const [narrative, setNarrative] = useState("");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Withdrawals</CardTitle>
        <p className="text-sm text-muted-foreground">One official asks, a different official approves. Money goes only to the group&apos;s own account.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {props.can.withdraw && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="wd-amount">Amount (Ksh)</Label>
              <Input id="wd-amount" type="number" inputMode="numeric" min="100" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-36" />
            </div>
            <div className="min-w-40 flex-1 space-y-1">
              <Label htmlFor="wd-note">What for</Label>
              <Input id="wd-note" value={narrative} onChange={(e) => setNarrative(e.target.value)} maxLength={60} placeholder="e.g. Bank deposit for October" />
            </div>
            <Button
              disabled={pending || !(Number(amount) > 0)}
              onClick={() =>
                run(() => requestWithdrawalAction(Number(amount), narrative), () => {
                  setAmount("");
                  setNarrative("");
                })
              }
            >
              Ask to withdraw
            </Button>
          </div>
        )}
        <div className="divide-y text-sm">
          {props.withdrawals.length === 0 && <p className="py-2 text-muted-foreground">No withdrawals yet.</p>}
          {props.withdrawals.map((w) => (
            <div key={w.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div>
                <p className="font-medium">
                  {ksh(w.amount)} <Badge variant={w.status === "failed" ? "destructive" : "secondary"}>{STATUS[w.status] ?? w.status}</Badge>
                </p>
                <p className="text-muted-foreground">
                  {w.narrative} · asked by {w.requestedBy ?? "—"}
                  {w.approvedBy ? ` · approved by ${w.approvedBy}` : ""}
                  {w.error ? ` · ${w.error}` : ""}
                </p>
              </div>
              {w.status === "requested" && (
                <div className="flex gap-2">
                  {props.can.approve && w.requestedById !== props.myUserId && (
                    <Button size="sm" disabled={pending} onClick={() => run(() => approveWithdrawalAction(w.id))}>
                      Approve
                    </Button>
                  )}
                  {props.can.withdraw && (
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => cancelWithdrawalAction(w.id))}>
                      Cancel
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function DestinationCard({ destination, bankCodes }: { destination: PayoutDestination | null; bankCodes: Props["bankCodes"] }) {
  const { pending, run } = useRun();
  const [kind, setKind] = useState<PayoutDestination["kind"]>(destination?.kind ?? "bank");
  const [f, setF] = useState<Record<string, string>>(
    destination ? Object.fromEntries(Object.entries(destination).map(([k, v]) => [k, String(v)])) : {},
  );
  const field = (key: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="space-y-1">
      <Label htmlFor={`dest-${key}`}>{label}</Label>
      <Input id={`dest-${key}`} value={f[key] ?? ""} onChange={(e) => setF((s) => ({ ...s, [key]: e.target.value }))} {...props} />
    </div>
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Where withdrawals go</CardTitle>
        <p className="text-sm text-muted-foreground">The group&apos;s OWN bank account, paybill or till. Only the admin can change it, never platform support.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <select value={kind} onChange={(e) => setKind(e.target.value as PayoutDestination["kind"])} className="h-10 rounded-md border bg-background px-2 text-sm" aria-label="Type">
          <option value="bank">Bank account</option>
          <option value="paybill">Paybill</option>
          <option value="till">Till number</option>
        </select>
        <div className="grid gap-3 sm:grid-cols-2">
          {kind === "bank" &&
            (bankCodes ? (
              <div className="space-y-1">
                <Label htmlFor="dest-bank">Bank</Label>
                <select id="dest-bank" value={f.bankCode ?? ""} onChange={(e) => setF((s) => ({ ...s, bankCode: e.target.value }))} className="h-10 w-full rounded-md border bg-background px-2 text-sm">
                  <option value="">Choose…</option>
                  {bankCodes.map((b) => (
                    <option key={b.code} value={b.code}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              field("bankCode", "Bank code", { inputMode: "numeric" })
            ))}
          {kind === "bank" && field("account", "Account number", { inputMode: "numeric" })}
          {kind === "paybill" && field("paybill", "Paybill number", { inputMode: "numeric" })}
          {kind === "paybill" && field("accountRef", "Account number at the paybill")}
          {kind === "till" && field("till", "Till number", { inputMode: "numeric" })}
          {field("name", "Account name (the group's name)")}
        </div>
        <Button disabled={pending} onClick={() => run(() => setDestinationAction({ kind, ...f }))}>
          Save account
        </Button>
      </CardContent>
    </Card>
  );
}
