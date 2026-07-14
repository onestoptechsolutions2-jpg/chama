"use client";

import { useActionState, useTransition } from "react";
import type { fines as finesTable, members as membersTable } from "@/lib/db/schema";
import { fineTypes } from "@/lib/validation/fines";
import { createFineAction, resolveFineAction, type FineActionState } from "@/app/(dashboard)/fines/actions";
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

type Fine = typeof finesTable.$inferSelect & { member: { name: string } };
type Member = typeof membersTable.$inferSelect;

function ksh(n: string | number) {
  return `Ksh ${Number(n).toLocaleString()}`;
}

function AddFineForm({ members }: { members: Member[] }) {
  const [state, formAction, pending] = useActionState<FineActionState, FormData>(
    createFineAction,
    null,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Record a fine</CardTitle>
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
            <Label htmlFor="type">Type</Label>
            <Select
              name="type"
              defaultValue="other"
              items={Object.fromEntries(fineTypes.map((t) => [t, t.replace("_", " ")]))}
            >
              <SelectTrigger id="type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {fineTypes.map((t) => (
                  <SelectItem key={t} value={t} className="capitalize">
                    {t.replace("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="amount">Amount (Ksh)</Label>
            <Input id="amount" name="amount" type="number" min="1" step="1" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reason">Reason (optional)</Label>
            <Input id="reason" name="reason" />
          </div>
          {state?.error && (
            <p className="sm:col-span-2 lg:col-span-4 text-sm text-destructive">
              {state.error}
            </p>
          )}
          <Button type="submit" disabled={pending} className="lg:col-span-4 lg:w-fit">
            {pending ? "Recording…" : "Record fine"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ResolveButtons({ fineId }: { fineId: number }) {
  const [isPending, startTransition] = useTransition();
  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => startTransition(() => resolveFineAction(fineId, "paid"))}
      >
        Mark paid
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={isPending}
        onClick={() => startTransition(() => resolveFineAction(fineId, "waived"))}
      >
        Waive
      </Button>
    </div>
  );
}

const statusVariant = {
  pending: "secondary",
  paid: "default",
  waived: "outline",
} as const;

function FinesTable({ fines, canResolve }: { fines: Fine[]; canResolve: boolean }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Member</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Reason</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead>Status</TableHead>
          {canResolve && <TableHead />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {fines.length === 0 && (
          <TableRow>
            <TableCell colSpan={canResolve ? 6 : 5} className="text-center text-muted-foreground">
              No fines here.
            </TableCell>
          </TableRow>
        )}
        {fines.map((f) => (
          <TableRow key={f.id}>
            <TableCell className="font-medium">{f.member.name}</TableCell>
            <TableCell className="capitalize">{f.type.replace("_", " ")}</TableCell>
            <TableCell className="text-muted-foreground">{f.reason ?? "—"}</TableCell>
            <TableCell className="text-right">{ksh(f.amount)}</TableCell>
            <TableCell>
              <Badge variant={statusVariant[f.status]} className="capitalize">
                {f.status}
              </Badge>
            </TableCell>
            {canResolve && (
              <TableCell>{f.status === "pending" && <ResolveButtons fineId={f.id} />}</TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function FinesManager({
  fines,
  members,
  canResolve,
}: {
  fines: Fine[];
  members: Member[];
  canResolve: boolean;
}) {
  const pending = fines.filter((f) => f.status === "pending");
  const resolved = fines.filter((f) => f.status !== "pending");

  return (
    <div className="space-y-6">
      {canResolve && <AddFineForm members={members} />}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pending ({pending.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <FinesTable fines={pending} canResolve={canResolve} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resolved</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <FinesTable fines={resolved} canResolve={false} />
        </CardContent>
      </Card>
    </div>
  );
}
