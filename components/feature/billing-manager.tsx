"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { subscriptionInvoices as subscriptionInvoicesTable } from "@/lib/db/schema";
import type { SubscriptionQuote } from "@/lib/domain/billing";
import { generateInvoiceAction, chargeInvoiceFromWalletAction } from "@/app/(dashboard)/dashboard/billing/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Invoice = typeof subscriptionInvoicesTable.$inferSelect;

function ksh(n: string | number) {
  return `Ksh ${Number(n).toLocaleString()}`;
}

const invoiceStatusVariant = {
  pending: "secondary",
  paid: "default",
  failed: "destructive",
  cancelled: "outline",
} as const;

function QuoteBreakdown({ quote }: { quote: SubscriptionQuote }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">This period&apos;s price</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-baseline justify-between">
          <span className="text-3xl font-semibold">{ksh(quote.totalMonthly)}<span className="text-base font-normal text-muted-foreground">/mo</span></span>
          <Badge variant="secondary" className="capitalize">{quote.tierLabel}</Badge>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Member fee (annual)</span>
            <span>{ksh(quote.memberFee)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Vehicle fee (annual)</span>
            <span>{ksh(quote.vehicleFee)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Activity fee (annual)</span>
            <span>{ksh(quote.activityFee)}</span>
          </div>
          <div className="flex justify-between border-t pt-2 font-medium">
            <span>Total (annual)</span>
            <span>{ksh(quote.totalAnnual)}</span>
          </div>
        </div>
        {quote.isCustomQuote && (
          <p className="text-xs text-muted-foreground">
            This group is large or active enough to fall outside the standard bands — the number
            above is an estimate; a real quote here should be negotiated directly.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Recomputed live from this group&apos;s actual members, active vehicles, and trailing
          12-month financial activity — never a flat per-group number. Transaction fees on loan
          disbursements are billed separately, not included here.
        </p>
      </CardContent>
    </Card>
  );
}

function ChargeInvoiceDialog({ invoice, walletBalance }: { invoice: Invoice; walletBalance: string }) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [walletPending, startWalletTransition] = useTransition();

  const amount = Number(invoice.totalAmount);
  const walletCoversFee = Number(walletBalance) >= amount;

  function chargeFromWallet() {
    setError(null);
    startWalletTransition(async () => {
      const result = await chargeInvoiceFromWalletAction(invoice.id);
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      toast.success(`Deducted ${ksh(amount)} from the wallet`);
      setOpen(false);
    });
  }

  async function chargeViaStk() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/payments/subscription-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: invoice.id, phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to trigger payment");
        return;
      }
      toast.success(`STK push sent for ${ksh(data.amount)}`);
      setOpen(false);
    } catch {
      setError("Network error — could not reach the server");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Charge</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Charge invoice — {invoice.periodStart} to {invoice.periodEnd}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Amount due: {ksh(amount)}</p>
          {walletCoversFee ? (
            <>
              <p className="text-sm text-muted-foreground">
                Covered by this group&apos;s wallet balance ({ksh(walletBalance)}) — deducted
                instantly, no phone prompt.
              </p>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button onClick={chargeFromWallet} disabled={walletPending} className="w-full">
                {walletPending ? "Deducting…" : `Deduct ${ksh(amount)} from wallet`}
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Wallet balance ({ksh(walletBalance)}) doesn&apos;t cover this — top up in{" "}
                <a href="/dashboard/wallet" className="underline underline-offset-4">Wallet</a>, or send an
                M-Pesa STK push instead.
              </p>
              <div className="space-y-2">
                <Label htmlFor={`invoice-phone-${invoice.id}`}>Phone number to charge</Label>
                <Input
                  id={`invoice-phone-${invoice.id}`}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0712345678"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button onClick={chargeViaStk} disabled={pending || !phone} className="w-full">
                {pending ? "Sending…" : "Send STK push"}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InvoicesTable({
  invoices,
  walletBalance,
  isAdmin,
}: {
  invoices: Invoice[];
  walletBalance: string;
  isAdmin: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Period</TableHead>
          <TableHead className="text-right">Members</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead>Status</TableHead>
          {isAdmin && <TableHead />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoices.length === 0 && (
          <TableRow>
            <TableCell colSpan={isAdmin ? 5 : 4} className="text-center text-muted-foreground">
              No invoices generated yet.
            </TableCell>
          </TableRow>
        )}
        {invoices.map((inv) => (
          <TableRow key={inv.id}>
            <TableCell className="font-medium">
              {inv.periodStart} – {inv.periodEnd}
            </TableCell>
            <TableCell className="text-right">{inv.memberCount}</TableCell>
            <TableCell className="text-right">{ksh(inv.totalAmount)}</TableCell>
            <TableCell>
              <Badge variant={invoiceStatusVariant[inv.status]} className="capitalize">
                {inv.status}
              </Badge>
            </TableCell>
            {isAdmin && (
              <TableCell>
                {inv.status === "pending" && Number(inv.totalAmount) > 0 && (
                  <ChargeInvoiceDialog invoice={inv} walletBalance={walletBalance} />
                )}
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function GenerateInvoiceButton() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function generate() {
    setError(null);
    startTransition(async () => {
      const result = await generateInvoiceAction();
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success("Invoice generated for this period");
    });
  }

  return (
    <div className="space-y-2">
      <Button onClick={generate} disabled={isPending} variant="outline">
        {isPending ? "Generating…" : "Generate invoice for this period"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function BillingManager({
  quote,
  invoices,
  walletBalance,
  isAdmin,
}: {
  quote: SubscriptionQuote;
  invoices: Invoice[];
  walletBalance: string;
  isAdmin: boolean;
}) {
  return (
    <div className="space-y-6">
      <QuoteBreakdown quote={quote} />

      {isAdmin && <GenerateInvoiceButton />}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invoice history</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <InvoicesTable invoices={invoices} walletBalance={walletBalance} isAdmin={isAdmin} />
        </CardContent>
      </Card>
    </div>
  );
}
