"use client";

import { displayPhone } from "@/lib/domain/identity";
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
  resetMemberPasswordAction,
  deactivateMemberAction,
  reinstateMemberAction,
  updateMemberRoleAction,
  type MemberActionState,
} from "@/app/(dashboard)/dashboard/members/actions";
import { createInviteAction, type InviteActionState } from "@/app/(dashboard)/dashboard/members/invite-actions";
import { InviteResult, InviteRowButton, PendingInvites, type PendingInvite } from "@/components/feature/invite-panel";
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

type AddState = InviteActionState | MemberActionState;

/**
 * One dialog for both cases: a roster-only member (never logs in — gets SMS
 * receipts), or an invite so they join with their own account. Officials
 * always need an invite: an office means using the app.
 */
function AddMemberForm({ canInviteOfficials }: { canInviteOfficials: boolean }) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<(typeof ASSIGNABLE_ROLES)[number]>("member");
  const [state, formAction, pending] = useActionState<AddState, FormData>(async (prev, formData) => {
    if (role !== "member" || formData.get("sendInvite") === "on") {
      return createInviteAction(null, formData);
    }
    const result = await createMemberAction(null, formData);
    if (!result) setOpen(false);
    return result;
  }, null);
  const roles = canInviteOfficials ? ASSIGNABLE_ROLES : (["member"] as const);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setRole("member");
      }}
    >
      <DialogTrigger render={<Button />}>
        <UserPlus className="size-5" /> Add Member
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a member</DialogTitle>
        </DialogHeader>
        {state && "ok" in state ? (
          <InviteResult state={state} />
        ) : (
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" name="name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone number</Label>
              <Input id="phone" name="phone" type="tel" placeholder="0712 345 678" />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <input type="hidden" name="role" value={role} />
              <Select value={role} onValueChange={(v) => v && setRole(v as typeof role)} items={ROLE_LABELS}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {role === "member" ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="sendInvite" defaultChecked />
                Invite them to log in (they can still be added without a phone or login)
              </label>
            ) : (
              <p className="text-sm text-muted-foreground">
                Officials join through an invite with their own account.
              </p>
            )}
            {role === "member" && (
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
            )}
            {state && "error" in state && state.error && <p className="text-sm text-destructive">{state.error}</p>}
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Saving…" : "Add member"}
            </Button>
          </form>
        )}
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
          {state?.message && <p className="basis-full text-sm text-muted-foreground">{state.message}</p>}
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
          {state?.message && <p className="text-sm text-muted-foreground">{state.message}</p>}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Saving…" : "Save"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ member }: { member: Member }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<MemberActionState, FormData>(
    async (prev, formData) => {
      const result = await resetMemberPasswordAction(member.id, prev, formData);
      if (!result) {
        setOpen(false);
        toast.success(`New password saved. Tell ${member.name} in person.`);
      }
      return result;
    },
    null,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" />}>Forgot password</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New password — {member.name}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`reset-password-${member.id}`}>New password (8 or more characters)</Label>
            <Input id={`reset-password-${member.id}`} name="password" type="text" autoComplete="off" required />
          </div>
          <p className="text-sm text-muted-foreground">
            Tell {member.name} the new password. They are signed out on every phone.
          </p>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          {state?.message && <p className="text-sm text-muted-foreground">{state.message}</p>}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Saving…" : "Save new password"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RemoveMemberDialog({ member }: { member: Member }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const result = await deactivateMemberAction(member.id);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      toast.success(`${member.name} was removed`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" className="text-destructive" />}>
        Remove from group
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove {member.name}?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          They will no longer be able to open this group. Their savings history stays on record, and any
          merry-go-round turn they have not been paid for becomes open again.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button variant="destructive" disabled={pending} onClick={remove} className="w-full">
          {pending ? "Removing…" : "Yes, remove"}
        </Button>
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

function RemovedMembers({ removed }: { removed: { id: number; name: string }[] }) {
  const [pending, startTransition] = useTransition();

  function bringBack(id: number, name: string) {
    startTransition(async () => {
      const result = await reinstateMemberAction(id);
      if (result?.error) toast.error(result.error);
      else toast.success(`${name} is back in the group`);
    });
  }

  return (
    <details className="rounded-xl border p-4">
      <summary className="cursor-pointer text-base font-medium">
        Removed members ({removed.length})
      </summary>
      <div className="mt-4 space-y-2">
        {removed.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-3">
            <span>{m.name}</span>
            <Button variant="outline" size="sm" disabled={pending} onClick={() => bringBack(m.id, m.name)}>
              Bring back
            </Button>
          </div>
        ))}
      </div>
    </details>
  );
}

export function MembersManager({
  members,
  removed = [],
  canEdit,
  isAdmin,
  showWelfare,
  invites = [],
}: {
  members: Member[];
  invites?: PendingInvite[];
  removed?: { id: number; name: string }[];
  canEdit: boolean;
  isAdmin: boolean;
  showWelfare: boolean;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q
    ? members.filter((m) => m.name.toLowerCase().includes(q) || (m.phone ?? "").includes(q) || displayPhone(m.phone).replace(/\s/g, "").includes(q.replace(/\s/g, "")))
    : members;
  const groupTotal = members.reduce((sum, m) => sum + totalSavings(m), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-base text-muted-foreground">
          {members.length} members · {ksh(groupTotal)} saved together
        </p>
        {canEdit && <AddMemberForm canInviteOfficials={isAdmin} />}
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
                    <p className="text-sm text-muted-foreground">
                      {m.memberNumber ? `#${m.memberNumber} · ` : ""}
                      {m.phone ? displayPhone(m.phone) : "No phone"}
                    </p>
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
                      {canEdit && !m.userId && <InviteRowButton member={m} />}
                      {isAdmin && m.userId && m.membership?.role !== "admin" && <ResetPasswordDialog member={m} />}
                      {isAdmin && m.membership?.role !== "admin" && <RemoveMemberDialog member={m} />}
                    </div>
                  </div>
                </details>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {canEdit && <PendingInvites invites={invites} />}

      {isAdmin && removed.length > 0 && <RemovedMembers removed={removed} />}

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
