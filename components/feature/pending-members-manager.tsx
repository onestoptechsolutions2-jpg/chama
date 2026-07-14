"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import type { groupMemberships as groupMembershipsTable, users as usersTable } from "@/lib/db/schema";
import {
  approveMembershipAction,
  rejectMembershipAction,
} from "@/app/(dashboard)/pending-members/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Membership = typeof groupMembershipsTable.$inferSelect & {
  user: typeof usersTable.$inferSelect;
};

function Row({ membership }: { membership: Membership }) {
  const [isPending, startTransition] = useTransition();
  return (
    <TableRow>
      <TableCell className="font-medium">{membership.user.name}</TableCell>
      <TableCell>{membership.user.email ?? membership.user.phone ?? "—"}</TableCell>
      <TableCell className="max-w-xs truncate text-muted-foreground">
        {membership.joinMessage || "—"}
      </TableCell>
      <TableCell>
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const result = await approveMembershipAction(membership.id);
                if (result?.error) toast.error(result.error);
              })
            }
          >
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => startTransition(() => rejectMembershipAction(membership.id))}
          >
            Reject
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function PendingMembersManager({ pending }: { pending: Membership[] }) {
  return (
    <Card>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Message</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pending.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No pending join requests.
                </TableCell>
              </TableRow>
            )}
            {pending.map((m) => (
              <Row key={m.id} membership={m} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
