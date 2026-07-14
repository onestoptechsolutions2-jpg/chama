"use client";

import { useActionState, useState } from "react";
import type {
  loans as loansTable,
  loanApplications as loanApplicationsTable,
  members as membersTable,
} from "@/lib/db/schema";
import {
  createLoanAction,
  recordRepaymentAction,
  reviewApplicationAction,
  type LoanActionState,
} from "@/app/(dashboard)/loans/actions";
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

type Loan = typeof loansTable.$inferSelect & { member: { name: string } };
type Application = typeof loanApplicationsTable.$inferSelect & { member: { name: string } };
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
        <form action={formAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
          <div className="space-y-2">
            <Label htmlFor="purpose">Purpose</Label>
            <Input id="purpose" name="purpose" />
          </div>
          {state?.error && (
            <p className="sm:col-span-2 lg:col-span-4 text-sm text-destructive">
              {state.error}
            </p>
          )}
          <Button type="submit" disabled={pending} className="lg:col-span-4 lg:w-fit">
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

function LoansTable({ loans }: { loans: Loan[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Member</TableHead>
          <TableHead className="text-right">Principal</TableHead>
          <TableHead className="text-right">Remaining</TableHead>
          <TableHead>Due</TableHead>
          <TableHead>Status</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {loans.length === 0 && (
          <TableRow>
            <TableCell colSpan={6} className="text-center text-muted-foreground">
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
              {["active", "extended", "overdue"].includes(loan.status) && (
                <RepayDialog loan={loan} />
              )}
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
}: {
  application: Application;
  decision: "approved" | "rejected";
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
          <div className="space-y-2">
            <Label htmlFor={`notes-${application.id}`}>Notes (optional)</Label>
            <Input id={`notes-${application.id}`} name="reviewNotes" />
          </div>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Saving…" : `Confirm ${decision}`}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ApplicationsTable({ applications }: { applications: Application[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Member</TableHead>
          <TableHead className="text-right">Requested</TableHead>
          <TableHead>Purpose</TableHead>
          <TableHead>Status</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {applications.length === 0 && (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-muted-foreground">
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
              <Badge variant={applicationStatusVariant[app.status]} className="capitalize">
                {app.status}
              </Badge>
            </TableCell>
            <TableCell>
              {app.status === "pending" && (
                <div className="flex gap-2">
                  <ReviewDialog application={app} decision="approved" />
                  <ReviewDialog application={app} decision="rejected" />
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
}: {
  loans: Loan[];
  applications: Application[];
  members: Member[];
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
            <LoansTable loans={loans} />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="applications">
        <Card>
          <CardContent className="overflow-x-auto">
            <ApplicationsTable applications={applications} />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
