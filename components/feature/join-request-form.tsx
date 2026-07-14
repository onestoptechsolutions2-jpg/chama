"use client";

import { useActionState } from "react";
import { requestToJoinAction, type JoinRequestState } from "@/app/(public)/discover/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function JoinRequestForm({ groupId }: { groupId: number }) {
  const [state, formAction, pending] = useActionState<JoinRequestState, FormData>(
    requestToJoinAction,
    null,
  );

  if (state && "ok" in state) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm">
          Request sent — you&apos;ll get access once an admin approves it.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Request to join</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="groupId" value={groupId} />
          <div className="space-y-2">
            <Label htmlFor="message">Message to the admins (optional)</Label>
            <Textarea id="message" name="message" placeholder="A little about why you'd like to join" />
          </div>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" disabled={pending}>
            {pending ? "Sending…" : "Send join request"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
