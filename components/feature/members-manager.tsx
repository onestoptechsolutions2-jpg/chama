"use client";

import { useActionState, useState } from "react";
import type { members as membersTable } from "@/lib/db/schema";
import { contributionTypes } from "@/lib/validation/members";
import {
  createMemberAction,
  recordContributionAction,
  createLoginForMemberAction,
  type MemberActionState,
} from "@/app/(dashboard)/members/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

type Member = typeof membersTable.$inferSelect;

function ksh(n: string | number) {
  return `Ksh ${Number(n).toLocaleString()}`;
}

function totalSavings(m: Member) {
  return Number(m.capital) + Number(m.security) + Number(m.personalSavings);
}

function AddMemberForm() {
  const [state, formAction, pending] = useActionState<MemberActionState, FormData>(
    createMemberAction,
    null,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Add a member</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" name="phone" placeholder="0712345678" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="capital">Initial capital (Ksh)</Label>
            <Input id="capital" name="capital" type="number" min="0" step="1" defaultValue={0} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="security">Initial security (Ksh)</Label>
            <Input id="security" name="security" type="number" min="0" step="1" defaultValue={0} />
          </div>
          {state?.error && (
            <p className="sm:col-span-2 lg:col-span-4 text-sm text-destructive">
              {state.error}
            </p>
          )}
          <Button type="submit" disabled={pending} className="lg:col-span-4 lg:w-fit">
            {pending ? "Adding…" : "Add member"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function RecordContributionDialog({
  member,
  showWelfare,
}: {
  member: Member;
  showWelfare: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<MemberActionState, FormData>(
    async (prev, formData) => {
      const result = await recordContributionAction(prev, formData);
      if (!result) setOpen(false);
      return result;
    },
    null,
  );
  const types = showWelfare
    ? contributionTypes
    : contributionTypes.filter((t) => t !== "welfare");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        Record contribution
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record contribution — {member.name}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="memberId" value={member.id} />
          <div className="space-y-2">
            <Label htmlFor={`type-${member.id}`}>Type</Label>
            <Select
              name="type"
              defaultValue="capital"
              items={Object.fromEntries(types.map((t) => [t, t.replace("_", " ")]))}
            >
              <SelectTrigger id={`type-${member.id}`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {types.map((t) => (
                  <SelectItem key={t} value={t} className="capitalize">
                    {t.replace("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`amount-${member.id}`}>Amount (Ksh)</Label>
            <Input
              id={`amount-${member.id}`}
              name="amount"
              type="number"
              min="1"
              step="1"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`reference-${member.id}`}>Reference (optional)</Label>
            <Input id={`reference-${member.id}`} name="reference" placeholder="M-Pesa code" />
          </div>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Recording…" : "Record"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreateLoginDialog({ member }: { member: Member }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<MemberActionState, FormData>(
    async (prev, formData) => {
      const result = await createLoginForMemberAction(member.id, prev, formData);
      if (!result) setOpen(false);
      return result;
    },
    null,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" />}>Create login</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create login — {member.name}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`login-email-${member.id}`}>Email</Label>
            <Input id={`login-email-${member.id}`} name="email" type="email" />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`login-phone-${member.id}`}>Phone</Label>
            <Input id={`login-phone-${member.id}`} name="phone" placeholder="0712345678" />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`login-password-${member.id}`}>Password</Label>
            <Input
              id={`login-password-${member.id}`}
              name="password"
              type="password"
              required
            />
          </div>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Creating…" : "Create login"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MembersManager({
  members,
  canEdit,
  isAdmin,
  showWelfare,
}: {
  members: Member[];
  canEdit: boolean;
  isAdmin: boolean;
  showWelfare: boolean;
}) {
  return (
    <div className="space-y-6">
      {canEdit && <AddMemberForm />}

      <Card>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="text-right">Capital</TableHead>
                <TableHead className="text-right">Security</TableHead>
                <TableHead className="text-right">Savings</TableHead>
                {showWelfare && <TableHead className="text-right">Welfare</TableHead>}
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Fines</TableHead>
                {canEdit && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canEdit ? 9 : 8} className="text-center text-muted-foreground">
                    No members yet.
                  </TableCell>
                </TableRow>
              )}
              {members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell>{m.phone ?? "—"}</TableCell>
                  <TableCell className="text-right">{ksh(m.capital)}</TableCell>
                  <TableCell className="text-right">{ksh(m.security)}</TableCell>
                  <TableCell className="text-right">{ksh(m.personalSavings)}</TableCell>
                  {showWelfare && (
                    <TableCell className="text-right">{ksh(m.welfareBalance)}</TableCell>
                  )}
                  <TableCell className="text-right font-medium">
                    {ksh(totalSavings(m))}
                  </TableCell>
                  <TableCell className="text-right">{ksh(m.totalFines)}</TableCell>
                  {canEdit && (
                    <TableCell>
                      <div className="flex gap-2">
                        <RecordContributionDialog member={m} showWelfare={showWelfare} />
                        {isAdmin && !m.userId && <CreateLoginDialog member={m} />}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
