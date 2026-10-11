"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { Plus, Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import type { members as membersTable, groupMemberships as groupMembershipsTable } from "@/lib/db/schema";
import { contributionTypes } from "@/lib/validation/members";
import {
  createMemberAction,
  importMembersAction,
  recordContributionAction,
  createLoginForMemberAction,
  updateMemberRoleAction,
  type MemberActionState,
} from "@/app/(dashboard)/dashboard/members/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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

type Membership = typeof groupMembershipsTable.$inferSelect;
type Member = typeof membersTable.$inferSelect & { membership: Membership | null };

const ASSIGNABLE_ROLES = ["admin", "treasurer", "secretary", "member"] as const;
const ROLE_LABELS: Record<(typeof ASSIGNABLE_ROLES)[number], string> = {
  admin: "Admin",
  treasurer: "Treasurer",
  secretary: "Secretary",
  member: "Member",
};

function ksh(n: string | number) {
  return `Ksh ${Number(n).toLocaleString()}`;
}

function totalSavings(m: Member) {
  return Number(m.capital) + Number(m.security) + Number(m.personalSavings);
}

function AddMemberForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<MemberActionState, FormData>(
    async (prev, formData) => {
      const result = await createMemberAction(prev, formData);
      if (!result) setOpen(false);
      return result;
    },
    null,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <UserPlus className="size-5" /> Add Member
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a new member</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" name="name" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone number</Label>
            <Input id="phone" name="phone" type="tel" placeholder="0712345678" />
          </div>
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium">Already saved something? (optional)</summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="capital">Capital (Ksh)</Label>
                <Input id="capital" name="capital" type="number" min="0" step="1" defaultValue={0} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="security">Security (Ksh)</Label>
                <Input id="security" name="security" type="number" min="0" step="1" defaultValue={0} />
              </div>
            </div>
          </details>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Adding…" : "Add member"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ImportMembersForm() {
  const [state, formAction, pending] = useActionState<MemberActionState, FormData>(
    importMembersAction,
    null,
  );
  return (
    <div>
      <div>
        <form action={formAction} className="flex flex-wrap items-end gap-4">
          <div className="min-w-64 flex-1 space-y-2"><Label htmlFor="member-import">CSV file</Label><Input id="member-import" name="file" type="file" accept=".csv,text/csv" required /></div>
          <Button type="submit" variant="outline" disabled={pending}>{pending ? "Importing..." : "Import CSV"}</Button>
          {state?.error && <p className="basis-full text-sm text-destructive">{state.error}</p>}
        </form>
        <p className="mt-3 text-xs text-muted-foreground">Headers: name, phone, email, capital, security, personal_savings, welfare_balance</p>
      </div>
    </div>
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
      <DialogTrigger render={<Button />}>
        <Plus className="size-5" /> Add Money
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add money — {member.name}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="memberId" value={member.id} />
          <div className="space-y-2">
            <Label htmlFor={`type-${member.id}`}>What is it for?</Label>
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
            <Label htmlFor={`reference-${member.id}`}>M-Pesa code (optional)</Label>
            <Input id={`reference-${member.id}`} name="reference" placeholder="M-Pesa code" />
          </div>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Saving…" : "Save"}
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

function RoleCell({ member, editable }: { member: Member; editable: boolean }) {
  const [isPending, startTransition] = useTransition();

  if (!member.membership) {
    return <span className="text-sm text-muted-foreground">No login</span>;
  }

  if (!editable) {
    return (
      <Badge variant="secondary" className="capitalize">
        {member.membership.role}
      </Badge>
    );
  }

  function change(role: (typeof ASSIGNABLE_ROLES)[number] | null) {
    if (!role) return;
    startTransition(async () => {
      const result = await updateMemberRoleAction(member.membership!.id, role);
      if (result?.error) toast.error(result.error);
      else toast.success(`${member.name} is now ${ROLE_LABELS[role]}`);
    });
  }

  return (
    <Select
      value={member.membership.role}
      onValueChange={change}
      items={ROLE_LABELS}
    >
      <SelectTrigger className="w-32" disabled={isPending}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ASSIGNABLE_ROLES.map((r) => (
          <SelectItem key={r} value={r}>
            {ROLE_LABELS[r]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q
    ? members.filter((m) => m.name.toLowerCase().includes(q) || (m.phone ?? "").includes(q))
    : members;
  const groupTotal = members.reduce((sum, m) => sum + totalSavings(m), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-base text-muted-foreground">
          {members.length} members · {ksh(groupTotal)} saved together
        </p>
        {canEdit && <AddMemberForm />}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or phone"
          className="pl-10"
          aria-label="Search members"
        />
      </div>

      {shown.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            {members.length === 0 ? "No members yet. Tap Add Member to start." : "Nobody matches that search."}
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {shown.map((m) => {
          const fines = Number(m.totalFines);
          return (
            <Card key={m.id}>
              <CardContent className="space-y-3 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold">{m.name}</p>
                    <p className="text-sm text-muted-foreground">{m.phone ?? "No phone"}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold tabular-nums">{ksh(totalSavings(m))}</p>
                    {fines > 0 ? (
                      <Badge variant="destructive">Owes {ksh(fines)} fines</Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">No fines</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {canEdit && <RecordContributionDialog member={m} showWelfare={showWelfare} />}
                  <Link
                    href={`/dashboard/statement?member_id=${m.id}`}
                    className={buttonVariants({ variant: "outline" })}
                  >
                    View history
                  </Link>
                </div>

                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground">More details</summary>
                  <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-muted p-2"><p className="text-xs text-muted-foreground">Capital</p><p className="font-medium">{ksh(m.capital)}</p></div>
                      <div className="rounded-lg bg-muted p-2"><p className="text-xs text-muted-foreground">Security</p><p className="font-medium">{ksh(m.security)}</p></div>
                      <div className="rounded-lg bg-muted p-2"><p className="text-xs text-muted-foreground">Savings</p><p className="font-medium">{ksh(m.personalSavings)}</p></div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span>Role:</span>
                      <RoleCell member={m} editable={isAdmin} />
                      {m.membership?.rulesAcceptedAt && <Badge variant="secondary">Accepted rules</Badge>}
                      {canEdit && isAdmin && !m.userId && <CreateLoginDialog member={m} />}
                    </div>
                  </div>
                </details>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {canEdit && (
        <details className="rounded-xl border p-4">
          <summary className="cursor-pointer text-base font-medium">Add many members from a file</summary>
          <div className="mt-4">
            <ImportMembersForm />
          </div>
        </details>
      )}
    </div>
  );
}
