"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import type {
  loans as loansTable,
  loanApplications as loanApplicationsTable,
  loanGuarantors as loanGuarantorsTable,
  members as membersTable,
} from "@/lib/db/schema";
import {
  createLoanAction,
  recordRepaymentAction,
  reviewApplicationAction,
  chargeLoanFeeFromWalletAction,
  type LoanActionState,
} from "@/app/(dashboard)/dashboard/loans/actions";
import { computeTransactionFee } from "@/lib/domain/billing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type GuarantorRow = typeof loanGuarantorsTable.$inferSelect & { member: { name: string } };
type Loan = typeof loansTable.$inferSelect & { member: { name: string }; guarantors: GuarantorRow[] };
type Application = typeof loanApplicationsTable.$inferSelect & {
  member: { name: string };
  guarantors: GuarantorRow[];
};
type Member = typeof membersTable.$inferSelect;

function ksh(n: string | number) {
  return `Ksh ${Number(n).toLocaleString()}`;
}

const statusVariant = {
  pending: "secondary",
  active: "default",
  extended: "secondary",
  overdue: "destructive",
  cleared: "outline",
  rejected: "destructive",
} as const;

const applicationStatusVariant = {
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
  cancelled: "outline",
} as const;

const guarantorStatusVariant = {
  pending: "secondary",
  accepted: "default",
  declined: "destructive",
  released: "outline",
} as const;

function GuarantorBadges({ guarantors }: { guarantors: GuarantorRow[] }) {
  if (guarantors.length === 0) return <span className="text-muted-foreground">None</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {guarantors.map((g) => (
        <Badge key={g.id} variant={guarantorStatusVariant[g.status]} className="capitalize">
          {g.member.name}: {g.status}
        </Badge>
      ))}
    </div>
  );
}

function NewLoanForm({ members }: { members: Member[] }) {
  const [state, formAction, pending] = useActionState<LoanActionState, FormData>(
    createLoanAction,
    null,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Approve a new loan</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="memberId">Member</Label>
              <Select
                name="memberId"
                required
                items={Object.fromEntries(members.map((m) => [String(m.id), m.name]))}
              >
                <SelectTrigger id="memberId" className="w-full">
                  <SelectValue placeholder="Select member" />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="principal">Principal (Ksh)</Label>
              <Input id="principal" name="principal" type="number" min="1000" step="1" required />
            </div>
            <div className="space-y-2 lg:col-span-2">
              <Label htmlFor="purpose">Purpose</Label>
              <Input id="purpose" name="purpose" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>
              Guarantors{" "}
              <span className="font-normal text-muted-foreground">
                (optional — you&apos;re vouching for this loan directly, so these are recorded as
                accepted immediately)
              </span>
            </Label>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
              {members.map((m) => (
                <label key={m.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="guarantorMemberIds" value={m.id} className="size-4" />
                  {m.name}
                </label>
              ))}
            </div>
          </div>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" disabled={pending} className="w-fit">
            {pending ? "Approving…" : "Approve loan"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function RepayDialog({ loan }: { loan: Loan }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<LoanActionState, FormData>(
    async (prev, formData) => {
      const result = await recordRepaymentAction(loan.id, formData);
      if (!result) setOpen(false);
      return result;
    },
    null,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Repay</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record repayment — {loan.member.name}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Remaining balance: {ksh(loan.amountRemaining)}
          </p>
          <div className="space-y-2">
            <Label htmlFor={`amount-${loan.id}`}>Amount (Ksh)</Label>
            <Input id={`amount-${loan.id}`} name="amount" type="number" min="1" step="1" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`reference-${loan.id}`}>Reference (optional)</Label>
            <Input id={`reference-${loan.id}`} name="reference" placeholder="M-Pesa code" />
          </div>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Recording…" : "Record repayment"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LoanFeeDialog({ loan, walletBalance }: { loan: Loan; walletBalance: string }) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [walletPending, startWalletTransition] = useTransition();

  const fee = computeTransactionFee("loan_disbursement", Number(loan.principal));
  const walletCoversFee = Number(walletBalance) >= fee;

  function chargeFromWallet() {
    setError(null);
    startWalletTransition(async () => {
      const result = await chargeLoanFeeFromWalletAction(loan.id);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toast.success(`Deducted Ksh ${result.fee} from the wallet`);
      setOpen(false);
    });
  }

  async function chargeViaStk() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/payments/loan-fee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loanId: loan.id, phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to trigger payment");
        return;
      }
      toast.success(`STK push sent for Ksh ${data.fee}`);
      setOpen(false);
    } catch {
      setError("Network error — could not reach the server");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        Charge disbursement fee
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Charge disbursement fee — {loan.member.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The platform&apos;s one-time fee on this {ksh(loan.principal)} disbursement is{" "}
            {ksh(fee)} (0.75% of principal).
          </p>
          {walletCoversFee ? (
            <>
              <p className="text-sm text-muted-foreground">
                Covered by this group&apos;s wallet balance ({ksh(walletBalance)}) — deducted
                instantly, no phone prompt.
              </p>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button onClick={chargeFromWallet} disabled={walletPending} className="w-full">
                {walletPending ? "Deducting…" : `Deduct Ksh ${fee} from wallet`}
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Wallet balance ({ksh(walletBalance)}) doesn&apos;t cover this fee — top up in{" "}
                <a href="/dashboard/wallet" className="underline underline-offset-4">Wallet</a>, or send an
                M-Pesa STK push instead.
              </p>
              <div className="space-y-2">
                <Label htmlFor={`loan-fee-phone-${loan.id}`}>Phone number to charge</Label>
                <Input
                  id={`loan-fee-phone-${loan.id}`}
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

function LoansTable({
  loans,
  chargedLoanIds,
  walletBalance,
  isAdmin,
}: {
  loans: Loan[];
  chargedLoanIds: Set<number>;
  walletBalance: string;
  isAdmin: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Member</TableHead>
          <TableHead className="text-right">Principal</TableHead>
          <TableHead className="text-right">Remaining</TableHead>
          <TableHead>Due</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Guarantors</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {loans.length === 0 && (
          <TableRow>
            <TableCell colSpan={7} className="text-center text-muted-foreground">
              No loans yet.
            </TableCell>
          </TableRow>
        )}
        {loans.map((loan) => (
          <TableRow key={loan.id}>
            <TableCell className="font-medium">{loan.member.name}</TableCell>
            <TableCell className="text-right">{ksh(loan.principal)}</TableCell>
            <TableCell className="text-right">{ksh(loan.amountRemaining)}</TableCell>
            <TableCell>{loan.dueDate}</TableCell>
            <TableCell>
              <Badge variant={statusVariant[loan.status]} className="capitalize">
                {loan.status}
              </Badge>
            </TableCell>
            <TableCell>
              <GuarantorBadges guarantors={loan.guarantors} />
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap justify-end gap-2">
                {["active", "extended", "overdue"].includes(loan.status) && (
                  <RepayDialog loan={loan} />
                )}
                {isAdmin &&
                  loan.status !== "pending" &&
                  loan.status !== "rejected" &&
                  !chargedLoanIds.has(loan.id) && (
                    <LoanFeeDialog loan={loan} walletBalance={walletBalance} />
                  )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ReviewDialog({
  application,
  decision,
  minGuarantors,
}: {
  application: Application;
  decision: "approved" | "rejected";
  minGuarantors: number;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<LoanActionState, FormData>(
    async (prev, formData) => {
      formData.set("decision", decision);
      const result = await reviewApplicationAction(application.id, formData);
      if (!result) setOpen(false);
      return result;
    },
    null,
  );

  const acceptedCount = application.guarantors.filter((g) => g.status === "accepted").length;
  const guarantorsMet = minGuarantors <= 0 || acceptedCount >= minGuarantors;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button size="sm" variant={decision === "approved" ? "default" : "ghost"} />}
      >
        {decision === "approved" ? "Approve" : "Reject"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {decision === "approved" ? "Approve" : "Reject"} application — {application.member.name}
          </DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {decision === "approved" && minGuarantors > 0 && (
            <div className="space-y-2 rounded-md border p-3 text-sm">
              <p className={guarantorsMet ? "text-muted-foreground" : "text-destructive"}>
                {acceptedCount} of {minGuarantors} required guarantor(s) accepted.
                {!guarantorsMet && " This can't be approved until enough have responded."}
              </p>
              <GuarantorBadges guarantors={application.guarantors} />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor={`notes-${application.id}`}>Notes (optional)</Label>
            <Input id={`notes-${application.id}`} name="reviewNotes" />
          </div>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button
            type="submit"
            disabled={pending || (decision === "approved" && !guarantorsMet)}
            className="w-full"
          >
            {pending ? "Saving…" : `Confirm ${decision}`}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ApplicationsTable({
  applications,
  minGuarantors,
}: {
  applications: Application[];
  minGuarantors: number;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Member</TableHead>
          <TableHead className="text-right">Requested</TableHead>
          <TableHead>Purpose</TableHead>
          <TableHead>Guarantors</TableHead>
          <TableHead>Status</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {applications.length === 0 && (
          <TableRow>
            <TableCell colSpan={6} className="text-center text-muted-foreground">
              No applications.
            </TableCell>
          </TableRow>
        )}
        {applications.map((app) => (
          <TableRow key={app.id}>
            <TableCell className="font-medium">{app.member.name}</TableCell>
            <TableCell className="text-right">{ksh(app.amountRequested)}</TableCell>
            <TableCell className="text-muted-foreground">{app.purpose ?? "—"}</TableCell>
            <TableCell>
              <GuarantorBadges guarantors={app.guarantors} />
            </TableCell>
            <TableCell>
              <Badge variant={applicationStatusVariant[app.status]} className="capitalize">
                {app.status}
              </Badge>
            </TableCell>
            <TableCell>
              {app.status === "pending" && (
                <div className="flex gap-2">
                  <ReviewDialog application={app} decision="approved" minGuarantors={minGuarantors} />
                  <ReviewDialog application={app} decision="rejected" minGuarantors={minGuarantors} />
                </div>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function LoansManager({
  loans,
  applications,
  members,
  chargedLoanIds,
  walletBalance,
  isAdmin,
  minGuarantors,
}: {
  loans: Loan[];
  applications: Application[];
  members: Member[];
  chargedLoanIds: Set<number>;
  walletBalance: string;
  isAdmin: boolean;
  minGuarantors: number;
}) {
  return (
    <Tabs defaultValue="loans">
      <TabsList>
        <TabsTrigger value="loans">Active Loans</TabsTrigger>
        <TabsTrigger value="applications">
          Applications
          {applications.filter((a) => a.status === "pending").length > 0 && (
            <Badge variant="secondary" className="ml-1.5">
              {applications.filter((a) => a.status === "pending").length}
            </Badge>
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="loans" className="space-y-6">
        <NewLoanForm members={members} />
        <Card>
          <CardContent className="overflow-x-auto">
            <LoansTable
              loans={loans}
              chargedLoanIds={chargedLoanIds}
              walletBalance={walletBalance}
              isAdmin={isAdmin}
            />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="applications">
        <Card>
          <CardContent className="overflow-x-auto">
            <ApplicationsTable applications={applications} minGuarantors={minGuarantors} />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
