"use client";

import { useActionState, useState } from "react";
import type {
  welfareRequests as welfareRequestsTable,
  welfareGrants as welfareGrantsTable,
  welfareAdvances as welfareAdvancesTable,
  welfareApprovals as welfareApprovalsTable,
  welfareFunds as welfareFundsTable,
  welfarePolicies as welfarePoliciesTable,
  members as membersTable,
} from "@/lib/db/schema";
import {
  reviewWelfareRequestAction,
  recordAdvanceRepaymentAction,
  type WelfareActionState,
} from "@/app/(dashboard)/welfare/actions";
import { WelfareRequestForm } from "@/components/feature/welfare-request-form";
import { WelfareApprovalQueue, type PendingApproval } from "@/components/feature/welfare-approval-queue";
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

function ksh(n: string | number) {
  return `Ksh ${Number(n).toLocaleString()}`;
}

const requestStatusVariant = {
  pending: "secondary",
  under_review: "secondary",
  approved: "default",
  rejected: "destructive",
  disbursed: "outline",
  cancelled: "outline",
} as const;

const advanceStatusVariant = {
  active: "secondary",
  paid: "outline",
  overdue: "destructive",
  defaulted: "destructive",
  written_off: "outline",
} as const;

type Member = Pick<typeof membersTable.$inferSelect, "id" | "name">;
type Request = typeof welfareRequestsTable.$inferSelect & {
  member: Member;
  grant: typeof welfareGrantsTable.$inferSelect | null;
  advance: typeof welfareAdvancesTable.$inferSelect | null;
  approvals: (typeof welfareApprovalsTable.$inferSelect & { member: Member })[];
};
type Advance = typeof welfareAdvancesTable.$inferSelect & { member: Member };
type Fund = typeof welfareFundsTable.$inferSelect;
type Policy = typeof welfarePoliciesTable.$inferSelect;

function requestTotal(r: Request) {
  return (
    Number(r.requestedEmergencyAmount) + Number(r.requestedLongTermAmount) + Number(r.requestedAdvanceAmount)
  );
}

function ReviewDialog({ request }: { request: Request }) {
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState<string>("approved");
  const [state, formAction, pending] = useActionState<WelfareActionState, FormData>(
    async (_prev, formData) => {
      const result = await reviewWelfareRequestAction(request.id, formData);
      if (!result) setOpen(false);
      return result;
    },
    null,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Review</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Review request — {request.member.name}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`decision-${request.id}`}>Decision</Label>
            <Select
              name="decision"
              defaultValue="approved"
              onValueChange={(value) => setDecision(value ?? "approved")}
              items={{ approved: "Approve", rejected: "Reject" }}
            >
              <SelectTrigger id={`decision-${request.id}`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="approved">Approve</SelectItem>
                <SelectItem value="rejected">Reject</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {decision === "approved" && (
            <div className="space-y-3">
              {Number(request.requestedEmergencyAmount) > 0 && (
                <div className="space-y-2">
                  <Label htmlFor={`emergency-${request.id}`}>Emergency amount approved (Ksh)</Label>
                  <Input
                    id={`emergency-${request.id}`}
                    name="approvedEmergencyAmount"
                    type="number"
                    min="0"
                    step="1"
                    defaultValue={Number(request.requestedEmergencyAmount)}
                  />
                </div>
              )}
              {Number(request.requestedLongTermAmount) > 0 && (
                <div className="space-y-2">
                  <Label htmlFor={`longterm-${request.id}`}>Long-term amount approved (Ksh)</Label>
                  <Input
                    id={`longterm-${request.id}`}
                    name="approvedLongTermAmount"
                    type="number"
                    min="0"
                    step="1"
                    defaultValue={Number(request.requestedLongTermAmount)}
                  />
                </div>
              )}
              {Number(request.requestedAdvanceAmount) > 0 && (
                <div className="space-y-2">
                  <Label htmlFor={`advance-${request.id}`}>Advance amount approved (Ksh)</Label>
                  <Input
                    id={`advance-${request.id}`}
                    name="approvedAdvanceAmount"
                    type="number"
                    min="0"
                    step="1"
                    defaultValue={Number(request.requestedAdvanceAmount)}
                  />
                </div>
              )}
            </div>
          )}
          {decision === "rejected" && (
            <div className="space-y-2">
              <Label htmlFor={`reason-${request.id}`}>Rejection reason</Label>
              <Input id={`reason-${request.id}`} name="rejectionReason" />
            </div>
          )}
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Saving…" : "Save decision"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RecordRepaymentDialog({ advance }: { advance: Advance }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<WelfareActionState, FormData>(
    async (_prev, formData) => {
      const result = await recordAdvanceRepaymentAction(advance.id, formData);
      if (!result) setOpen(false);
      return result;
    },
    null,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>Record repayment</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Repayment — {advance.member.name}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Owes {ksh(advance.amountRemaining)} of {ksh(advance.totalRepayable)}
          </p>
          <div className="space-y-2">
            <Label htmlFor={`amount-${advance.id}`}>Amount (Ksh)</Label>
            <Input
              id={`amount-${advance.id}`}
              name="amount"
              type="number"
              min="1"
              max={Number(advance.amountRemaining)}
              step="1"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`reference-${advance.id}`}>Reference (optional)</Label>
            <Input id={`reference-${advance.id}`} name="reference" />
          </div>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Saving…" : "Record repayment"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RequestsTable({ requests, isStaff }: { requests: Request[]; isStaff: boolean }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {isStaff && <TableHead>Member</TableHead>}
          <TableHead>Reason</TableHead>
          <TableHead className="text-right">Requested</TableHead>
          <TableHead>Tier</TableHead>
          <TableHead>Status</TableHead>
          {isStaff && <TableHead />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {requests.length === 0 && (
          <TableRow>
            <TableCell colSpan={isStaff ? 6 : 4} className="text-center text-muted-foreground">
              No requests yet.
            </TableCell>
          </TableRow>
        )}
        {requests.map((r) => (
          <TableRow key={r.id}>
            {isStaff && <TableCell className="font-medium">{r.member.name}</TableCell>}
            <TableCell className="capitalize">{r.reason.replace("_", " ")}</TableCell>
            <TableCell className="text-right">{ksh(requestTotal(r))}</TableCell>
            <TableCell className="capitalize text-muted-foreground">{r.approvalTier}</TableCell>
            <TableCell>
              <Badge variant={requestStatusVariant[r.status]} className="capitalize">
                {r.status.replace("_", " ")}
              </Badge>
              {(r.status === "under_review" && r.approvals.length > 0) && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {r.approvals.filter((a) => a.status === "accepted").length}/{r.approvals.length} approved
                </p>
              )}
            </TableCell>
            {isStaff && (
              <TableCell>
                {r.status === "pending" && r.approvalTier === "tier1" && <ReviewDialog request={r} />}
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function AdvancesTable({ advances, isStaff }: { advances: Advance[]; isStaff: boolean }) {
  if (advances.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{isStaff ? "Welfare advances" : "Your advances"}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {isStaff && <TableHead>Member</TableHead>}
              <TableHead className="text-right">Principal</TableHead>
              <TableHead className="text-right">Owes</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Status</TableHead>
              {isStaff && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {advances.map((a) => (
              <TableRow key={a.id}>
                {isStaff && <TableCell className="font-medium">{a.member.name}</TableCell>}
                <TableCell className="text-right">{ksh(a.principal)}</TableCell>
                <TableCell className="text-right">{ksh(a.amountRemaining)}</TableCell>
                <TableCell>{a.dueDate}</TableCell>
                <TableCell>
                  <Badge variant={advanceStatusVariant[a.status]} className="capitalize">
                    {a.status.replace("_", " ")}
                  </Badge>
                </TableCell>
                {isStaff && (
                  <TableCell>
                    {(a.status === "active" || a.status === "overdue") && (
                      <RecordRepaymentDialog advance={a} />
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function WelfareManager({
  fund,
  policy,
  requests,
  advances,
  myPendingApprovals,
  reserveLow,
  isStaff,
  memberId,
}: {
  fund: Fund;
  policy: Policy;
  requests: Request[];
  advances: Advance[];
  myPendingApprovals: PendingApproval[];
  reserveLow: boolean;
  isStaff: boolean;
  memberId: number | null;
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Emergency available</p>
            <p className="text-2xl font-semibold">{ksh(fund.emergencyBalance)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Long-term welfare</p>
            <p className="text-2xl font-semibold">{ksh(fund.longTermBalance)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Advance liquidity</p>
            <p className="text-2xl font-semibold">{ksh(fund.advanceBalance)}</p>
          </CardContent>
        </Card>
      </div>
      <p className="text-sm text-muted-foreground">
        This is a group welfare fund — you do not have an individual welfare balance. The amounts
        above are what the whole group currently has available to support a member in need.
      </p>

      {reserveLow && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6 text-sm text-destructive">
            The emergency reserve is running low (below the group&apos;s configured minimum of{" "}
            {ksh(policy.minEmergencyReserveFloor)}). New discretionary grants may be restricted until
            it recovers.
          </CardContent>
        </Card>
      )}

      <WelfareApprovalQueue approvals={myPendingApprovals} />

      {memberId && (
        <WelfareRequestForm
          maxEmergencyGrant={Number(policy.maxEmergencyGrant)}
          maxLongTermGrant={Number(policy.maxLongTermGrant)}
          maxAdvance={Number(policy.maxAdvance)}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{isStaff ? "All requests" : "Your requests"}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <RequestsTable requests={requests} isStaff={isStaff} />
        </CardContent>
      </Card>

      <AdvancesTable advances={advances} isStaff={isStaff} />
    </div>
  );
}
