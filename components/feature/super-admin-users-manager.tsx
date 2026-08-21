"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  invitePlatformUserAction,
  setPlatformUserActiveAction,
  updatePlatformRoleAction,
} from "@/app/super-admin/users/actions";
import { platformRoleLabel, type PlatformRole } from "@/lib/domain/super-admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { users as usersTable } from "@/lib/db/schema";

type UserRow = typeof usersTable.$inferSelect;

type AuditLogRow = {
  id: number;
  eventType: string;
  fromPlatformRole: "owner" | "support" | null;
  toPlatformRole: "owner" | "support" | null;
  note: string | null;
  createdAt: Date;
};

type RoleOption = {
  value: string;
  label: string;
};

const ROLE_OPTIONS: RoleOption[] = [
  { value: "none", label: "None" },
  { value: "support", label: "Support" },
  { value: "owner", label: "Owner" },
];

export function SuperAdminUsersManager({
  users,
  auditLogs,
}: {
  users: UserRow[];
  auditLogs: AuditLogRow[];
}) {
  const [savingId, setSavingId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePhone, setInvitePhone] = useState("");
  const [creating, setCreating] = useState(false);

  const filteredUsers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((user) =>
      [user.name, user.email, user.phone].some((value) =>
        typeof value === "string" && value.toLowerCase().includes(needle),
      ),
    );
  }, [query, users]);

  async function handleRoleChange(userId: number, role: string) {
    setSavingId(userId);
    const result = await updatePlatformRoleAction(userId, role);
    setSavingId(null);
    if (result && "error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success("Platform permissions updated");
  }

  async function handleInvite() {
    if (!inviteName.trim() || !inviteEmail.trim()) {
      toast.error("Name and email are required");
      return;
    }
    setCreating(true);
    const result = await invitePlatformUserAction({
      name: inviteName,
      email: inviteEmail,
      phone: invitePhone || null,
    });
    setCreating(false);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }

    if (result.password) {
      toast.success(`Invite created. Temporary password: ${result.password}`);
    } else {
      toast.success("User activated and ready to sign in");
    }

    setInviteName("");
    setInviteEmail("");
    setInvitePhone("");
  }

  async function handleToggleActive(userId: number, active: boolean) {
    setSavingId(userId);
    const result = await setPlatformUserActiveAction(userId, active);
    setSavingId(null);
    if (result && "error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success(active ? "Platform account reactivated" : "Platform account deactivated");
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="grid gap-4 md:grid-cols-[1.25fr_1fr_1fr]">
            <div className="space-y-2">
              <Label htmlFor="platform-user-search">Search users</Label>
              <Input
                id="platform-user-search"
                placeholder="Name, email, or phone"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-name">Name</Label>
              <Input
                id="invite-name"
                placeholder="New platform user"
                value={inviteName}
                onChange={(event) => setInviteName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="name@example.com"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
            <div className="space-y-2">
              <Label htmlFor="invite-phone">Phone</Label>
              <Input
                id="invite-phone"
                placeholder="Optional phone"
                value={invitePhone}
                onChange={(event) => setInvitePhone(event.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleInvite} disabled={creating} className="w-full">
                {creating ? "Creating..." : "Invite user"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Platform role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No users match the current search.
                  </TableCell>
                </TableRow>
              )}
              {filteredUsers.map((user) => {
                const currentValue = user.platformRole ?? "none";
                return (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.name}</TableCell>
                    <TableCell>{user.email ?? "—"}</TableCell>
                    <TableCell>{user.phone ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={user.platformRole === "owner" ? "default" : "secondary"}>
                        {platformRoleLabel(user.platformRole as PlatformRole | null)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.active ? "outline" : "secondary"}>
                        {user.active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="space-y-2 text-right">
                      <div className="flex justify-end gap-2">
                        <Select
                          value={currentValue}
                          onValueChange={(next) => handleRoleChange(user.id, next ?? "none")}
                          disabled={savingId === user.id}
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLE_OPTIONS.map((role) => (
                              <SelectItem key={role.value} value={role.value}>
                                {role.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant={user.active ? "secondary" : "default"}
                          size="sm"
                          onClick={() => handleToggleActive(user.id, !user.active)}
                          disabled={savingId === user.id}
                        >
                          {savingId === user.id
                            ? "Working..."
                            : user.active
                              ? "Deactivate"
                              : "Activate"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Recent audit log
          </h3>
          <div className="space-y-3">
            {auditLogs.length === 0 && (
              <p className="text-sm text-muted-foreground">No platform events yet.</p>
            )}
            {auditLogs.map((entry) => (
              <div key={entry.id} className="rounded-md border p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium capitalize">{entry.eventType.replace(/_/g, " ")}</span>
                  <span className="text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="mt-1 text-muted-foreground">
                  {entry.note ?? "Platform access was updated."}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
