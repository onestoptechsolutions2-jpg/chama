"use client";

import { useActionState, useState } from "react";
import { welfareClaimTypes } from "@/lib/validation/welfare";
import { submitWelfareRequestAction, type WelfareActionState } from "@/app/(dashboard)/welfare/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * The unified "Request Help" flow — a single submission can carry any
 * combination of the three amounts (check the ones that apply), which is
 * exactly what turns into a combined grant + advance on the server side
 * (see submitWelfareRequestAction / disburseWelfareRequest).
 */
export function WelfareRequestForm({
  maxEmergencyGrant,
  maxLongTermGrant,
  maxAdvance,
}: {
  maxEmergencyGrant: number;
  maxLongTermGrant: number;
  maxAdvance: number;
}) {
  const [state, formAction, pending] = useActionState<WelfareActionState, FormData>(
    submitWelfareRequestAction,
    null,
  );
  const [wantEmergency, setWantEmergency] = useState(false);
  const [wantLongTerm, setWantLongTerm] = useState(false);
  const [wantAdvance, setWantAdvance] = useState(false);
  const nothingSelected = !wantEmergency && !wantLongTerm && !wantAdvance;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Request help</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reason">Reason</Label>
            <Select
              name="reason"
              defaultValue="other"
              items={Object.fromEntries(welfareClaimTypes.map((t) => [t, t]))}
            >
              <SelectTrigger id="reason" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {welfareClaimTypes.map((t) => (
                  <SelectItem key={t} value={t} className="capitalize">
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                className="size-4"
                checked={wantEmergency}
                onChange={(e) => setWantEmergency(e.target.checked)}
              />
              Emergency assistance — non-repayable, up to Ksh {maxEmergencyGrant.toLocaleString()}
            </label>
            {wantEmergency && (
              <Input
                name="requestedEmergencyAmount"
                type="number"
                min="1"
                max={maxEmergencyGrant}
                step="1"
                placeholder="Amount (Ksh)"
              />
            )}

            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                className="size-4"
                checked={wantLongTerm}
                onChange={(e) => setWantLongTerm(e.target.checked)}
              />
              Long-term welfare support — non-repayable, up to Ksh {maxLongTermGrant.toLocaleString()}
            </label>
            {wantLongTerm && (
              <Input
                name="requestedLongTermAmount"
                type="number"
                min="1"
                max={maxLongTermGrant}
                step="1"
                placeholder="Amount (Ksh)"
              />
            )}

            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                className="size-4"
                checked={wantAdvance}
                onChange={(e) => setWantAdvance(e.target.checked)}
              />
              Welfare advance — must be repaid, up to Ksh {maxAdvance.toLocaleString()}
            </label>
            {wantAdvance && (
              <Input
                name="requestedAdvanceAmount"
                type="number"
                min="1"
                max={maxAdvance}
                step="1"
                placeholder="Amount (Ksh)"
              />
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="beneficiaryName">Beneficiary name (optional)</Label>
              <Input id="beneficiaryName" name="beneficiaryName" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="beneficiaryRel">Relationship (optional)</Label>
              <Input id="beneficiaryRel" name="beneficiaryRel" placeholder="self, spouse, child…" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Tell us what happened</Label>
            <Textarea id="description" name="description" />
          </div>

          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" disabled={pending || nothingSelected}>
            {pending ? "Submitting…" : "Submit request"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
