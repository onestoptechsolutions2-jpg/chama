"use client";

import { useActionState, useState } from "react";
import type { groups as groupsTable } from "@/lib/db/schema";
import { groupTypes } from "@/lib/validation/groups";
import { createGroupAction, type CreateGroupState } from "@/app/super-admin/groups/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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

type Group = typeof groupsTable.$inferSelect;

function CreateGroupDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<CreateGroupState, FormData>(
    async (prev, formData) => {
      const result = await createGroupAction(prev, formData);
      if (!result) setOpen(false);
      return result;
    },
    null,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>New group</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a new group</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="type">Type</Label>
            <Select
              name="type"
              defaultValue="chama"
              items={Object.fromEntries(groupTypes.map((t) => [t, t]))}
            >
              <SelectTrigger id="type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {groupTypes.map((t) => (
                  <SelectItem key={t} value={t} className="capitalize">
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input id="description" name="description" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="isPublic">Visibility</Label>
              <Select
                name="isPublic"
                defaultValue="true"
                items={{ true: "Public", false: "Private" }}
              >
                <SelectTrigger id="isPublic" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Public</SelectItem>
                  <SelectItem value="false">Private</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="requireApproval">Joining</Label>
              <Select
                name="requireApproval"
                defaultValue="true"
                items={{ true: "Requires approval", false: "Auto-approve" }}
              >
                <SelectTrigger id="requireApproval" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Requires approval</SelectItem>
                  <SelectItem value="false">Auto-approve</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="maxMembers">Max members (optional)</Label>
            <Input id="maxMembers" name="maxMembers" type="number" min="1" step="1" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="adminEmail">Initial admin&apos;s email</Label>
            <Input id="adminEmail" name="adminEmail" type="email" required />
            <p className="text-xs text-muted-foreground">
              Must belong to an existing account — they&apos;ll become this group&apos;s admin.
            </p>
          </div>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Creating…" : "Create group"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SuperAdminGroupsManager({ groups }: { groups: Group[] }) {
  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <CreateGroupDialog />
      </div>
      <Card>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Visibility</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No groups yet.
                  </TableCell>
                </TableRow>
              )}
              {groups.map((g) => (
                <TableRow key={g.id}>
                  <TableCell className="font-medium">{g.name}</TableCell>
                  <TableCell className="capitalize">{g.type}</TableCell>
                  <TableCell>
                    <Badge variant={g.isPublic ? "secondary" : "outline"}>
                      {g.isPublic ? "Public" : "Private"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={g.active ? "secondary" : "destructive"}>
                      {g.active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(g.createdAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
