"use client";

import { useActionState, useState } from "react";
import { welfareClaimTypes } from "@/lib/validation/welfare";
import type { BenefitItem } from "@/lib/domain/welfare-benefits";
import { submitWelfareRequestAction, type WelfareActionState } from "@/app/(dashboard)/dashboard/welfare/actions";
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
  benefits = [],
  funeralOffer = false,
}: {
  maxEmergencyGrant: number;
  maxLongTermGrant: number;
  maxAdvance: number;
  /** The group's benefit table; when present, members pick an event and the amount is fixed. */
  benefits?: BenefitItem[];
  /** Offer the Family Compass opt-in (only used when the claim is a bereavement). */
  funeralOffer?: boolean;
}) {
  const [state, formAction, pending] = useActionState<WelfareActionState, FormData>(
    submitWelfareRequestAction,
    null,
  );
  const [wantEmergency, setWantEmergency] = useState(false);
  const [wantLongTerm, setWantLongTerm] = useState(false);
  const [wantAdvance, setWantAdvance] = useState(false);
  const [benefitId, setBenefitId] = useState<string>(benefits.length ? "" : "other");
  const benefit = benefits.find((b) => b.id === benefitId) ?? null;
  const nothingSelected = benefit ? false : !wantEmergency && !wantLongTerm && !wantAdvance;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Request help</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          {benefits.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">What happened?</legend>
              {benefits.map((b) => (
                <label key={b.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                  <span className="flex items-center gap-2">
                    <input type="radio" name="benefitChoice" checked={benefitId === b.id} onChange={() => setBenefitId(b.id)} />
                    {b.label}
                  </span>
                  <span className="font-medium tabular-nums">Ksh {b.amount.toLocaleString()}</span>
                </label>
              ))}
              <label className="flex items-center gap-2 rounded-md border p-2 text-sm">
                <input type="radio" name="benefitChoice" checked={benefitId === "other"} onChange={() => setBenefitId("other")} />
                Something else
              </label>
            </fieldset>
          )}
          {benefit && (
            <>
              <input type="hidden" name="benefitId" value={benefit.id} />
              <input type="hidden" name="reason" value={benefit.reason} />
              <input type="hidden" name="requestedEmergencyAmount" value={benefit.amount} />
              <p className="rounded-md bg-muted/50 p-3 text-sm">
                The group pays <strong>Ksh {benefit.amount.toLocaleString()}</strong> for this, once it is approved.
              </p>
            </>
          )}
          {benefitId === "other" && (
          <>
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

          </>
          )}

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

          {funeralOffer && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="partnerContactOk" className="mt-0.5 size-4" />
              <span>
                If this is about a death: Family Compass may text me an offer to prepare a funeral programme. Nothing about me is shared with
                them.
              </span>
            </label>
          )}
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" disabled={pending || nothingSelected || benefitId === ""}>
            {pending ? "Submitting…" : "Submit request"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
