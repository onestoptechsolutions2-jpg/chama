"use client";

import { useActionState, useState, useTransition } from "react";
import type {
  loans as loansTable,
  loanApplications as loanApplicationsTable,
  loanGuarantors as loanGuarantorsTable,
  members as membersTable,
} from "@/lib/db/schema";
import { repaymentMonthsOptions } from "@/lib/validation/loans";
import {
  applyForLoanAction,
  cancelLoanApplicationAction,
  respondToGuaranteeRequestAction,
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
type Member = Pick<typeof membersTable.$inferSelect, "id" | "name">;
type GuarantorRow = typeof loanGuarantorsTable.$inferSelect;
type ApplicationGuarantor = GuarantorRow & { member: { name: string } };
type PendingRequest = GuarantorRow & {
  application: (typeof loanApplicationsTable.$inferSelect & { member: { name: string } }) | null;
};
type MyGuarantee = GuarantorRow & {
  loan: (Loan & { member: { name: string } }) | null;
  application: (Application & { member: { name: string } }) | null;
};

function ksh(n: string | number) {
  return `Ksh ${Number(n).toLocaleString()}`;
}

const guarantorStatusVariant = {
  pending: "secondary",
  accepted: "default",
  declined: "destructive",
  released: "outline",
} as const;

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

function PendingApplicationCard({
  application,
  guarantors,
}: {
  application: Application;
  guarantors: ApplicationGuarantor[];
}) {
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
        {guarantors.length > 0 && (
          <div className="space-y-1">
            <p className="text-muted-foreground">Guarantors:</p>
            {guarantors.map((g) => (
              <div key={g.id} className="flex items-center justify-between">
                <span>{g.member.name}</span>
                <Badge variant={guarantorStatusVariant[g.status]} className="capitalize">
                  {g.status}
                </Badge>
              </div>
            ))}
          </div>
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

function ApplyCard({
  limit,
  minGuarantors,
  eligibleGuarantors,
}: {
  limit: number;
  minGuarantors: number;
  eligibleGuarantors: Member[];
}) {
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
          {eligibleGuarantors.length > 0 && (
            <div className="space-y-2">
              <Label>
                Guarantors{" "}
                {minGuarantors > 0 && (
                  <span className="font-normal text-muted-foreground">
                    (at least {minGuarantors} must accept before this can be approved)
                  </span>
                )}
              </Label>
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
                {eligibleGuarantors.map((m) => (
                  <label key={m.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="guarantorMemberIds" value={m.id} className="size-4" />
                    {m.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" disabled={pending}>
            {pending ? "Submitting…" : "Submit application"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function GuaranteeRequestRow({ request }: { request: PendingRequest }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function respond(decision: "accepted" | "declined") {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("decision", decision);
      const result = await respondToGuaranteeRequestAction(request.id, fd);
      if (result && "error" in result) setError(result.error);
    });
  }

  if (!request.application) return null;

  return (
    <div className="space-y-2 rounded-md border p-3 text-sm">
      <div className="flex items-center justify-between">
        <span>
          <span className="font-medium">{request.application.member.name}</span> asked you to
          guarantee a {ksh(request.application.amountRequested)} loan
        </span>
      </div>
      {error && <p className="text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" disabled={isPending} onClick={() => respond("accepted")}>
          Accept
        </Button>
        <Button size="sm" variant="outline" disabled={isPending} onClick={() => respond("declined")}>
          Decline
        </Button>
      </div>
    </div>
  );
}

function MyGuaranteesCard({ guarantees }: { guarantees: MyGuarantee[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Loans you&apos;re guaranteeing</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {guarantees.map((g) => {
          const borrower = g.loan?.member.name ?? g.application?.member.name;
          const amount = g.loan?.principal ?? g.application?.amountRequested;
          const status = g.loan?.status ?? "awaiting approval";
          if (!borrower || amount === undefined) return null;
          return (
            <div key={g.id} className="flex items-center justify-between">
              <span>
                {borrower} — {ksh(amount)}
              </span>
              <Badge variant="secondary" className="capitalize">
                {status}
              </Badge>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function LoanApplyForm({
  activeLoan,
  pendingApplication,
  pendingApplicationGuarantors,
  pastApplications,
  limit,
  minGuarantors,
  eligibleGuarantors,
  myPendingRequests,
  myGuarantees,
}: {
  activeLoan: Loan | null;
  pendingApplication: Application | null;
  pendingApplicationGuarantors: ApplicationGuarantor[];
  pastApplications: Application[];
  limit: number;
  minGuarantors: number;
  eligibleGuarantors: Member[];
  myPendingRequests: PendingRequest[];
  myGuarantees: MyGuarantee[];
}) {
  return (
    <div className="space-y-6">
      {myPendingRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Guarantee requests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {myPendingRequests.map((r) => (
              <GuaranteeRequestRow key={r.id} request={r} />
            ))}
          </CardContent>
        </Card>
      )}

      {activeLoan ? (
        <ActiveLoanCard loan={activeLoan} />
      ) : pendingApplication ? (
        <PendingApplicationCard
          application={pendingApplication}
          guarantors={pendingApplicationGuarantors}
        />
      ) : (
        <ApplyCard limit={limit} minGuarantors={minGuarantors} eligibleGuarantors={eligibleGuarantors} />
      )}

      {myGuarantees.length > 0 && <MyGuaranteesCard guarantees={myGuarantees} />}

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
