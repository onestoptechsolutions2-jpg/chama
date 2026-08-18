"use client";

import { useState, useTransition } from "react";
import type {
  welfareApprovals as welfareApprovalsTable,
  welfareRequests as welfareRequestsTable,
  members as membersTable,
} from "@/lib/db/schema";
import { respondToWelfareApprovalAction } from "@/app/(dashboard)/welfare/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function ksh(n: string | number) {
  return `Ksh ${Number(n).toLocaleString()}`;
}

export type PendingApproval = typeof welfareApprovalsTable.$inferSelect & {
  request: typeof welfareRequestsTable.$inferSelect & {
    member: Pick<typeof membersTable.$inferSelect, "name">;
  };
};

function ApprovalRow({ approval }: { approval: PendingApproval }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function respond(decision: "accepted" | "declined") {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("decision", decision);
      const result = await respondToWelfareApprovalAction(approval.id, fd);
      if (result && "error" in result) setError(result.error);
    });
  }

  const total =
    Number(approval.request.requestedEmergencyAmount) +
    Number(approval.request.requestedLongTermAmount) +
    Number(approval.request.requestedAdvanceAmount);

  return (
    <div className="space-y-2 rounded-md border p-3 text-sm">
      <p>
        <span className="font-medium">{approval.request.member.name}</span> requested{" "}
        {ksh(total)} in welfare assistance and needs your sign-off (
        <span className="capitalize">{approval.request.reason}</span>).
      </p>
      {approval.request.description && (
        <p className="text-muted-foreground">{approval.request.description}</p>
      )}
      {error && <p className="text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" disabled={isPending} onClick={() => respond("accepted")}>
          Approve
        </Button>
        <Button size="sm" variant="outline" disabled={isPending} onClick={() => respond("declined")}>
          Decline
        </Button>
      </div>
    </div>
  );
}

/** A member's own inbox of tier2/tier3 co-sign requests — only ever non-empty if they hold an admin/treasurer/secretary office. */
export function WelfareApprovalQueue({ approvals }: { approvals: PendingApproval[] }) {
  if (approvals.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Awaiting your approval</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {approvals.map((a) => (
          <ApprovalRow key={a.id} approval={a} />
        ))}
      </CardContent>
    </Card>
  );
}
