"use client";

import { useActionState, useState } from "react";
import type { welfareClaims as welfareClaimsTable } from "@/lib/db/schema";
import { welfareClaimTypes } from "@/lib/validation/welfare";
import {
  submitClaimAction,
  reviewClaimAction,
  type WelfareActionState,
} from "@/app/(dashboard)/welfare/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

type Claim = typeof welfareClaimsTable.$inferSelect & { member: { name: string } };

function ksh(n: string | number) {
  return `Ksh ${Number(n).toLocaleString()}`;
}

const statusVariant = {
  pending: "secondary",
  under_review: "secondary",
  approved: "default",
  rejected: "destructive",
  disbursed: "outline",
} as const;

function SubmitClaimForm() {
  const [state, formAction, pending] = useActionState<WelfareActionState, FormData>(
    submitClaimAction,
    null,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Submit a claim</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="claimType">Type</Label>
              <Select
                name="claimType"
                defaultValue="other"
                items={Object.fromEntries(welfareClaimTypes.map((t) => [t, t]))}
              >
                <SelectTrigger id="claimType" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {welfareClaimTypes.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="amountRequested">Amount requested (Ksh)</Label>
              <Input
                id="amountRequested"
                name="amountRequested"
                type="number"
                min="1"
                step="1"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="beneficiaryName">Beneficiary name (optional)</Label>
              <Input id="beneficiaryName" name="beneficiaryName" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="beneficiaryRel">Relationship (optional)</Label>
              <Input id="beneficiaryRel" name="beneficiaryRel" placeholder="self, spouse, child…" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" />
          </div>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" disabled={pending}>
            {pending ? "Submitting…" : "Submit claim"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ReviewDialog({ claim }: { claim: Claim }) {
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState<string>("approved");
  const [state, formAction, pending] = useActionState<WelfareActionState, FormData>(
    async (prev, formData) => {
      const result = await reviewClaimAction(claim.id, formData);
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
          <DialogTitle>Review claim — {claim.member.name}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`decision-${claim.id}`}>Decision</Label>
            <Select
              name="decision"
              defaultValue="approved"
              onValueChange={(value) => setDecision(value ?? "approved")}
              items={{
                under_review: "Mark under review",
                approved: "Approve",
                rejected: "Reject",
                disbursed: "Mark disbursed",
              }}
            >
              <SelectTrigger id={`decision-${claim.id}`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="under_review">Mark under review</SelectItem>
                <SelectItem value="approved">Approve</SelectItem>
                <SelectItem value="rejected">Reject</SelectItem>
                <SelectItem value="disbursed">Mark disbursed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(decision === "approved" || decision === "disbursed") && (
            <div className="space-y-2">
              <Label htmlFor={`amount-${claim.id}`}>Amount approved (Ksh)</Label>
              <Input
                id={`amount-${claim.id}`}
                name="amountApproved"
                type="number"
                min="1"
                step="1"
                defaultValue={Number(claim.amountApproved ?? claim.amountRequested)}
              />
            </div>
          )}
          {decision === "rejected" && (
            <div className="space-y-2">
              <Label htmlFor={`reason-${claim.id}`}>Rejection reason</Label>
              <Input id={`reason-${claim.id}`} name="rejectionReason" />
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

function ClaimsTable({ claims, isStaff }: { claims: Claim[]; isStaff: boolean }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Member</TableHead>
          <TableHead>Type</TableHead>
          <TableHead className="text-right">Requested</TableHead>
          <TableHead className="text-right">Approved</TableHead>
          <TableHead>Status</TableHead>
          {isStaff && <TableHead />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {claims.length === 0 && (
          <TableRow>
            <TableCell colSpan={isStaff ? 6 : 5} className="text-center text-muted-foreground">
              No claims.
            </TableCell>
          </TableRow>
        )}
        {claims.map((c) => (
          <TableRow key={c.id}>
            <TableCell className="font-medium">{c.member.name}</TableCell>
            <TableCell className="capitalize">{c.claimType}</TableCell>
            <TableCell className="text-right">{ksh(c.amountRequested)}</TableCell>
            <TableCell className="text-right">
              {c.amountApproved ? ksh(c.amountApproved) : "—"}
            </TableCell>
            <TableCell>
              <Badge variant={statusVariant[c.status]} className="capitalize">
                {c.status.replace("_", " ")}
              </Badge>
            </TableCell>
            {isStaff && (
              <TableCell>
                {!["rejected", "disbursed"].includes(c.status) && <ReviewDialog claim={c} />}
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function WelfareManager({
  claims,
  fund,
  isStaff,
}: {
  claims: Claim[];
  fund: { totalCollected: number; totalDisbursed: number };
  isStaff: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total collected</p>
            <p className="text-2xl font-semibold">{ksh(fund.totalCollected)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total disbursed</p>
            <p className="text-2xl font-semibold">{ksh(fund.totalDisbursed)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Fund balance</p>
            <p className="text-2xl font-semibold">
              {ksh(fund.totalCollected - fund.totalDisbursed)}
            </p>
          </CardContent>
        </Card>
      </div>

      <SubmitClaimForm />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Claims</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <ClaimsTable claims={claims} isStaff={isStaff} />
        </CardContent>
      </Card>
    </div>
  );
}
