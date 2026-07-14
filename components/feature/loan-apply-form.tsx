"use client";

import { useActionState, useTransition } from "react";
import type { loans as loansTable, loanApplications as loanApplicationsTable } from "@/lib/db/schema";
import { repaymentMonthsOptions } from "@/lib/validation/loans";
import {
  applyForLoanAction,
  cancelLoanApplicationAction,
  type LoanActionState,
} from "@/app/(dashboard)/loans/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Loan = typeof loansTable.$inferSelect;
type Application = typeof loanApplicationsTable.$inferSelect;

function ksh(n: string | number) {
  return `Ksh ${Number(n).toLocaleString()}`;
}

function ActiveLoanCard({ loan }: { loan: Loan }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Your loan</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        <p>
          <span className="text-muted-foreground">Status:</span>{" "}
          <Badge variant="secondary" className="capitalize">
            {loan.status}
          </Badge>
        </p>
        <p>
          <span className="text-muted-foreground">Principal:</span> {ksh(loan.principal)}
        </p>
        <p>
          <span className="text-muted-foreground">Remaining:</span> {ksh(loan.amountRemaining)}
        </p>
        <p>
          <span className="text-muted-foreground">Due:</span> {loan.dueDate}
        </p>
      </CardContent>
    </Card>
  );
}

function PendingApplicationCard({ application }: { application: Application }) {
  const [isPending, startTransition] = useTransition();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Application pending review</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>
          <span className="text-muted-foreground">Requested:</span>{" "}
          {ksh(application.amountRequested)}
        </p>
        {application.purpose && (
          <p>
            <span className="text-muted-foreground">Purpose:</span> {application.purpose}
          </p>
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() => startTransition(() => cancelLoanApplicationAction(application.id))}
        >
          Cancel application
        </Button>
      </CardContent>
    </Card>
  );
}

function ApplyCard({ limit }: { limit: number }) {
  const [state, formAction, pending] = useActionState<LoanActionState, FormData>(
    applyForLoanAction,
    null,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Apply for a loan</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amountRequested">Amount (Ksh, up to {ksh(limit)})</Label>
            <Input
              id="amountRequested"
              name="amountRequested"
              type="number"
              min="1000"
              max={limit}
              step="1"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="purpose">Purpose</Label>
            <Input id="purpose" name="purpose" />
          </div>
          <div className="space-y-2 sm:w-48">
            <Label htmlFor="repaymentMonths">Repayment period</Label>
            <Select
              name="repaymentMonths"
              defaultValue="3"
              items={Object.fromEntries(
                repaymentMonthsOptions.map((m) => [String(m), `${m} months`]),
              )}
            >
              <SelectTrigger id="repaymentMonths" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {repaymentMonthsOptions.map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {m} months
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" disabled={pending}>
            {pending ? "Submitting…" : "Submit application"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function LoanApplyForm({
  activeLoan,
  pendingApplication,
  pastApplications,
  limit,
}: {
  activeLoan: Loan | null;
  pendingApplication: Application | null;
  pastApplications: Application[];
  limit: number;
}) {
  return (
    <div className="space-y-6">
      {activeLoan ? (
        <ActiveLoanCard loan={activeLoan} />
      ) : pendingApplication ? (
        <PendingApplicationCard application={pendingApplication} />
      ) : (
        <ApplyCard limit={limit} />
      )}

      {pastApplications.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Application history</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pastApplications.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-sm">
                <span>{ksh(a.amountRequested)}</span>
                <Badge variant="outline" className="capitalize">
                  {a.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
