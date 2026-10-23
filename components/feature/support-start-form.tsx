"use client";

import { useActionState } from "react";
import { startSupportSessionAction } from "@/app/super-admin/support/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Super-admin: open this group as support (as its admin, or as one member). */
export function SupportStartForm({
  groupId,
  people,
  canAct,
}: {
  groupId: number;
  people: { userId: number; name: string; role: string }[];
  canAct: boolean;
}) {
  const [state, formAction, pending] = useActionState(startSupportSessionAction.bind(null, groupId), null);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Open as support</CardTitle>
        <p className="text-sm text-muted-foreground">
          See the group exactly as a member or its admin does, for 30 minutes. The group&apos;s admins are told, and everything you
          do is in its Activity log.
        </p>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="support-reason">Why (shown to the group)</Label>
            <Input id="support-reason" name="reason" placeholder="Treasurer asked for help matching payments" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="support-as">See it as</Label>
            <select id="support-as" name="asUserId" className="h-10 w-full rounded-md border bg-background px-2 text-sm">
              <option value="">The group admin</option>
              {people.map((p) => (
                <option key={p.userId} value={p.userId}>
                  {p.name} ({p.role})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="support-mode">Mode</Label>
            <select id="support-mode" name="mode" defaultValue="view" className="h-10 w-full rounded-md border bg-background px-2 text-sm">
              <option value="view">View only</option>
              {canAct && <option value="act">Make changes for them</option>}
            </select>
          </div>
          {state?.error && <p className="text-sm text-destructive sm:col-span-2">{state.error}</p>}
          <Button type="submit" disabled={pending} className="sm:col-span-2 sm:justify-self-start">
            {pending ? "Opening…" : "Open group"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
