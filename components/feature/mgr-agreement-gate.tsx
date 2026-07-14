"use client";

import { useActionState } from "react";
import { signAgreementAction, type MgrActionState } from "@/app/(dashboard)/mgr/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const DEFAULT_PLATFORM_TERMS = `By participating in this group's Merry-Go-Round (MGR) rotation, you agree that
Chama Platform charges a 5% platform fee on each payout you receive, collected via
M-Pesa STK push at the time of disbursement. The platform is not a party to, and
accepts no liability for, the group's internal rotation agreement between members.`;

function GroupTermsBlock({ groupTerms }: { groupTerms: string | null }) {
  return (
    <p className="whitespace-pre-wrap text-sm text-muted-foreground">
      {groupTerms ??
        "Members contribute the agreed amount each cycle and take turns receiving the pooled payout, in the order slots are claimed or assigned. Missing a contribution may result in a fine per the group's rules."}
    </p>
  );
}

export function MgrAgreementGate({
  cycleId,
  platformTerms,
  groupTerms,
}: {
  cycleId: number;
  platformTerms: string | null;
  groupTerms: string | null;
}) {
  const [state, formAction, pending] = useActionState<MgrActionState, FormData>(
    (prev, formData) => signAgreementAction(cycleId, prev, formData),
    null,
  );

  return (
    <Card className="border-primary">
      <CardHeader>
        <CardTitle>Agree to participate in this MGR cycle</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-5">
          <div className="space-y-2">
            <p className="text-sm font-medium">Platform terms</p>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {platformTerms ?? DEFAULT_PLATFORM_TERMS}
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="platformTerms" required className="size-4" />
              I have read and agree to the platform terms
            </label>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Group terms</p>
            <GroupTermsBlock groupTerms={groupTerms} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="groupTerms" required className="size-4" />
              I have read and agree to the group&apos;s rotation terms
            </label>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Financial acknowledgement</p>
            <p className="text-sm text-muted-foreground">
              I understand that contributions are due each cycle and that missing a
              contribution may delay my payout or result in a fine.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="financialAcknowledged" required className="size-4" />
              I acknowledge and accept these financial obligations
            </label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="digitalSignature">Type your full name to sign</Label>
            <Input id="digitalSignature" name="digitalSignature" required />
          </div>

          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" disabled={pending}>
            {pending ? "Signing…" : "Sign & continue"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
