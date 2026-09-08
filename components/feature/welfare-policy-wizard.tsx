"use client";

import { useState } from "react";
import { toast } from "sonner";
import { validateAllocationSplit } from "@/lib/domain/welfare-policy";
import {
  updateWelfarePolicyAction,
  type SettingsActionState,
} from "@/app/(dashboard)/dashboard/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type WelfarePolicy = {
  fundingMethod: string;
  fundingFixedAmount: string | null;
  fundingPct: string | null;
  emergencyAllocationPct: string;
  longTermAllocationPct: string;
  advanceAllocationPct: string;
  maxEmergencyGrant: string;
  maxLongTermGrant: string;
  maxAdvance: string;
  maxOutstandingAdvancePerMember: string;
  minEmergencyReserveFloor: string;
  maxClaimsPerMemberPerYear: number;
  cooldownDays: number;
  minTenureMonths: number;
  advanceFeePct: string;
  advanceMaxRepaymentMonths: number;
  tier1MaxAmount: string;
  tier2MaxAmount: string;
  allowOverdraft: boolean;
};

const FUNDING_METHODS = [
  { value: "manual", label: "Manual only — no automatic funding" },
  { value: "fixed_amount", label: "Fixed amount per welfare contribution" },
  { value: "pct_collections", label: "% of welfare collections" },
  { value: "pct_contribution", label: "% of each welfare contribution" },
];

const stepTitles = ["Funding", "Reserves & caps", "Approval tiers", "Review"];

function toFormState(policy: WelfarePolicy) {
  return {
    fundingMethod: policy.fundingMethod,
    fundingFixedAmount: policy.fundingFixedAmount ?? "",
    fundingPct: policy.fundingPct ?? "",
    emergencyAllocationPct: policy.emergencyAllocationPct,
    longTermAllocationPct: policy.longTermAllocationPct,
    advanceAllocationPct: policy.advanceAllocationPct,
    maxEmergencyGrant: policy.maxEmergencyGrant,
    maxLongTermGrant: policy.maxLongTermGrant,
    maxAdvance: policy.maxAdvance,
    maxOutstandingAdvancePerMember: policy.maxOutstandingAdvancePerMember,
    minEmergencyReserveFloor: policy.minEmergencyReserveFloor,
    maxClaimsPerMemberPerYear: String(policy.maxClaimsPerMemberPerYear),
    cooldownDays: String(policy.cooldownDays),
    minTenureMonths: String(policy.minTenureMonths),
    advanceFeePct: policy.advanceFeePct,
    advanceMaxRepaymentMonths: String(policy.advanceMaxRepaymentMonths),
    tier1MaxAmount: policy.tier1MaxAmount,
    tier2MaxAmount: policy.tier2MaxAmount,
    allowOverdraft: policy.allowOverdraft,
  };
}

type FormState = ReturnType<typeof toFormState>;

/**
 * Edits an existing group's welfare policy — funding, reserve splits, caps,
 * and approval tiers — the one form/action this schema
 * (lib/validation/welfare-policy.ts's updateWelfarePolicySchema) never had
 * a UI for until now. Mirrors vehicle-activation-wizard.tsx's established
 * pattern exactly: Dialog + local step state + one combined terminal
 * Server Action call, never one action per step.
 */
export function WelfarePolicyWizard({ policy }: { policy: WelfarePolicy }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(() => toFormState(policy));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastStep = stepTitles.length - 1;

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function reset() {
    setStep(0);
    setForm(toFormState(policy));
    setError(null);
  }

  const splitError = validateAllocationSplit({
    emergencyPct: Number(form.emergencyAllocationPct) || 0,
    longTermPct: Number(form.longTermAllocationPct) || 0,
    advancePct: Number(form.advanceAllocationPct) || 0,
  });

  async function finish() {
    if (splitError) {
      setStep(1);
      setError(splitError);
      return;
    }
    setPending(true);
    setError(null);
    const fd = new FormData();
    for (const [key, value] of Object.entries(form)) {
      if (key === "allowOverdraft") continue;
      fd.set(key, String(value));
    }
    if (form.allowOverdraft) fd.set("allowOverdraft", "on");

    const result: SettingsActionState = await updateWelfarePolicyAction(null, fd);
    setPending(false);
    if (result && "error" in result) {
      setError(result.error);
      return;
    }
    toast.success("Welfare policy updated");
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button type="button" size="sm" variant="outline" />}>Edit policy</DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Welfare policy</DialogTitle>
        </DialogHeader>

        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Step {step + 1} of {stepTitles.length} — {stepTitles[step]}
        </p>

        {step === 0 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              How money automatically routes into the collective welfare fund. Manual top-ups
              (Welfare page) always work regardless of this setting.
            </p>
            <div className="space-y-2">
              <Label htmlFor="fundingMethod">Funding method</Label>
              <Select
                value={form.fundingMethod}
                onValueChange={(v) => set("fundingMethod", v ?? form.fundingMethod)}
                items={Object.fromEntries(FUNDING_METHODS.map((m) => [m.value, m.label]))}
              >
                <SelectTrigger id="fundingMethod" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FUNDING_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.fundingMethod === "fixed_amount" && (
              <div className="space-y-2">
                <Label htmlFor="fundingFixedAmount">Fixed amount (Ksh)</Label>
                <Input
                  id="fundingFixedAmount"
                  type="number"
                  min="0"
                  value={form.fundingFixedAmount}
                  onChange={(e) => set("fundingFixedAmount", e.target.value)}
                />
              </div>
            )}
            {(form.fundingMethod === "pct_collections" || form.fundingMethod === "pct_contribution") && (
              <div className="space-y-2">
                <Label htmlFor="fundingPct">Percentage (%)</Label>
                <Input
                  id="fundingPct"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={form.fundingPct}
                  onChange={(e) => set("fundingPct", e.target.value)}
                />
              </div>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              How the fund splits across its three reserves — must sum to 100% — plus the
              per-request caps and the emergency-reserve floor that triggers a low-reserve
              warning to officials.
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="emergencyAllocationPct">Emergency %</Label>
                <Input
                  id="emergencyAllocationPct"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={form.emergencyAllocationPct}
                  onChange={(e) => set("emergencyAllocationPct", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="longTermAllocationPct">Long-term %</Label>
                <Input
                  id="longTermAllocationPct"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={form.longTermAllocationPct}
                  onChange={(e) => set("longTermAllocationPct", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="advanceAllocationPct">Advance %</Label>
                <Input
                  id="advanceAllocationPct"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={form.advanceAllocationPct}
                  onChange={(e) => set("advanceAllocationPct", e.target.value)}
                />
              </div>
            </div>
            {splitError && <p className="text-sm text-destructive">{splitError}</p>}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="maxEmergencyGrant">Max emergency grant (Ksh)</Label>
                <Input
                  id="maxEmergencyGrant"
                  type="number"
                  min="0"
                  value={form.maxEmergencyGrant}
                  onChange={(e) => set("maxEmergencyGrant", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxLongTermGrant">Max long-term grant (Ksh)</Label>
                <Input
                  id="maxLongTermGrant"
                  type="number"
                  min="0"
                  value={form.maxLongTermGrant}
                  onChange={(e) => set("maxLongTermGrant", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxAdvance">Max advance (Ksh)</Label>
                <Input
                  id="maxAdvance"
                  type="number"
                  min="0"
                  value={form.maxAdvance}
                  onChange={(e) => set("maxAdvance", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxOutstandingAdvancePerMember">Max outstanding advance/member (Ksh)</Label>
                <Input
                  id="maxOutstandingAdvancePerMember"
                  type="number"
                  min="0"
                  value={form.maxOutstandingAdvancePerMember}
                  onChange={(e) => set("maxOutstandingAdvancePerMember", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="minEmergencyReserveFloor">Emergency reserve floor (Ksh)</Label>
                <Input
                  id="minEmergencyReserveFloor"
                  type="number"
                  min="0"
                  value={form.minEmergencyReserveFloor}
                  onChange={(e) => set("minEmergencyReserveFloor", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="advanceFeePct">Advance fee (%)</Label>
                <Input
                  id="advanceFeePct"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={form.advanceFeePct}
                  onChange={(e) => set("advanceFeePct", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="advanceMaxRepaymentMonths">Advance repayment period (months)</Label>
                <Input
                  id="advanceMaxRepaymentMonths"
                  type="number"
                  min="1"
                  value={form.advanceMaxRepaymentMonths}
                  onChange={(e) => set("advanceMaxRepaymentMonths", e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              How a request is decided: up to the tier1 amount is a single staff decision; above
              it, officials must co-sign. Plus eligibility rules applied at submission.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="tier1MaxAmount">Tier 1 max (single staff, Ksh)</Label>
                <Input
                  id="tier1MaxAmount"
                  type="number"
                  min="0"
                  value={form.tier1MaxAmount}
                  onChange={(e) => set("tier1MaxAmount", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tier2MaxAmount">Tier 2 max (2 officials, Ksh)</Label>
                <Input
                  id="tier2MaxAmount"
                  type="number"
                  min="0"
                  value={form.tier2MaxAmount}
                  onChange={(e) => set("tier2MaxAmount", e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Above this, all 3 officials must co-sign.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="minTenureMonths">Minimum tenure (months)</Label>
                <Input
                  id="minTenureMonths"
                  type="number"
                  min="0"
                  value={form.minTenureMonths}
                  onChange={(e) => set("minTenureMonths", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxClaimsPerMemberPerYear">Max claims/member/year</Label>
                <Input
                  id="maxClaimsPerMemberPerYear"
                  type="number"
                  min="0"
                  value={form.maxClaimsPerMemberPerYear}
                  onChange={(e) => set("maxClaimsPerMemberPerYear", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cooldownDays">Cooldown between requests (days)</Label>
                <Input
                  id="cooldownDays"
                  type="number"
                  min="0"
                  value={form.cooldownDays}
                  onChange={(e) => set("cooldownDays", e.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 pt-6 text-sm font-medium">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={form.allowOverdraft}
                  onChange={(e) => set("allowOverdraft", e.target.checked)}
                />
                Allow a reserve to go negative when disbursing
              </label>
            </div>
          </div>
        )}

        {step === lastStep && (
          <div className="space-y-3 text-sm">
            <div className="rounded-md border p-3">
              <p className="font-medium">Funding</p>
              <p className="text-muted-foreground">
                {FUNDING_METHODS.find((m) => m.value === form.fundingMethod)?.label}
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="font-medium">Reserve split</p>
              <p className="text-muted-foreground">
                Emergency {form.emergencyAllocationPct}%, long-term {form.longTermAllocationPct}%,
                advance {form.advanceAllocationPct}%.
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="font-medium">Approval tiers</p>
              <p className="text-muted-foreground">
                Up to Ksh {Number(form.tier1MaxAmount).toLocaleString()} — single staff. Up to Ksh{" "}
                {Number(form.tier2MaxAmount).toLocaleString()} — 2 officials. Above that — all 3.
              </p>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-between pt-2">
          <Button
            type="button"
            variant="outline"
            disabled={step === 0 || pending}
            onClick={() => setStep((s) => s - 1)}
          >
            Back
          </Button>
          {step < lastStep ? (
            <Button type="button" onClick={() => setStep((s) => s + 1)}>
              Next
            </Button>
          ) : (
            <Button type="button" onClick={finish} disabled={pending}>
              {pending ? "Saving…" : "Save policy"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
