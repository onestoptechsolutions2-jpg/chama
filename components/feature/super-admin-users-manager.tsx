"use client";

import { useState } from "react";
import { toast } from "sonner";
import { updatePlatformRoleAction } from "@/app/super-admin/users/actions";
import { platformRoleLabel, type PlatformRole } from "@/lib/domain/super-admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

type RoleOption = {
  value: string;
  label: string;
};

const ROLE_OPTIONS: RoleOption[] = [
  { value: "none", label: "None" },
  { value: "support", label: "Support" },
  { value: "owner", label: "Owner" },
];

export function SuperAdminUsersManager({ users }: { users: UserRow[] }) {
  const [savingId, setSavingId] = useState<number | null>(null);

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

  return (
    <Card>
      <CardContent className="overflow-x-auto pt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Platform role</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No users yet.
                </TableCell>
              </TableRow>
            )}
            {users.map((user) => {
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
                  <TableCell className="text-right">
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
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
