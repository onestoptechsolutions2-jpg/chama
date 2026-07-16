"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { walletTransactions as walletTransactionsTable } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type WalletTransaction = typeof walletTransactionsTable.$inferSelect;

function ksh(n: string | number) {
  return `Ksh ${Number(n).toLocaleString()}`;
}

const typeVariant = {
  topup: "default",
  fee_deduction: "secondary",
  refund: "outline",
} as const;

function TopupForm() {
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function topUp() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/payments/wallet-topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to trigger payment");
        return;
      }
      toast.success(`STK push sent for Ksh ${data.amount}`);
      setAmount("");
      setPhone("");
    } catch {
      setError("Network error — could not reach the server");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Top up</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Sends an M-Pesa STK push. Once confirmed, the amount is credited to this wallet — top it
          up once and platform fees get deducted instantly with no phone prompt each time.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="topup-amount">Amount (Ksh)</Label>
            <Input
              id="topup-amount"
              type="number"
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="1000"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="topup-phone">Phone number to charge</Label>
            <Input
              id="topup-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0712345678"
            />
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button onClick={topUp} disabled={pending || !amount || !phone}>
          {pending ? "Sending…" : "Send STK push"}
        </Button>
      </CardContent>
    </Card>
  );
}

function TransactionHistory({ transactions }: { transactions: WalletTransaction[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Transaction history</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">
          This ledger can be added to but never edited or erased, including by an admin.
        </p>
        {transactions.length === 0 && (
          <p className="text-sm text-muted-foreground">No wallet activity yet.</p>
        )}
        {transactions.map((t) => (
          <div key={t.id} className="flex items-center justify-between border-b py-2 text-sm last:border-0">
            <span className="flex items-center gap-2">
              <Badge variant={typeVariant[t.type]} className="capitalize">
                {t.type.replace("_", " ")}
              </Badge>
              {t.note && <span className="text-muted-foreground">{t.note}</span>}
            </span>
            <span className="flex flex-col items-end">
              <span className={t.type === "fee_deduction" ? "text-destructive" : ""}>
                {t.type === "fee_deduction" ? "-" : "+"}
                {ksh(t.amount)}
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(t.createdAt).toLocaleString()}
              </span>
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function WalletManager({
  balance,
  transactions,
}: {
  balance: string;
  transactions: WalletTransaction[];
}) {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Current balance</p>
          <p className="text-3xl font-semibold">{ksh(balance)}</p>
        </CardContent>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <TopupForm />
        <TransactionHistory transactions={transactions} />
      </div>
    </div>
  );
}
