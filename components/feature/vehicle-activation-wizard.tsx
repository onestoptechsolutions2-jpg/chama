"use client";

import { useState } from "react";
import { toast } from "sonner";
import { RULE_TEMPLATES, type RuleCategory } from "@/lib/domain/rule-templates";
import { activateProductAction, type ActivateProductState } from "@/app/(dashboard)/settings/actions";
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

type ActivatableProduct = "loans" | "mgr" | "welfare" | "projects";

const VEHICLE_COPY: Record<ActivatableProduct, { label: string; intro: string }> = {
  loans: {
    label: "Table Banking",
    intro:
      "Members can apply for loans against their savings, with guarantors, interest, and repayment tracking. This is usually the biggest change to how a group operates — worth setting your own terms before members start borrowing.",
  },
  mgr: {
    label: "Merry-Go-Round",
    intro:
      "A rotating payout schedule — members contribute each cycle and take turns receiving the pot. Rotation order, contribution amount, and cycle schedule are configured separately in MGR → Config after this.",
  },
  welfare: {
    label: "Welfare",
    intro:
      "Members can submit claims (bereavement, medical, and similar) against a shared welfare fund, tracked separately from the group's savings.",
  },
  projects: {
    label: "Investment",
    intro:
      "Track group-funded projects — target vs. collected amounts, and who's contributed toward each one.",
  },
};

const DEFAULT_LOAN_SETTINGS = {
  loanInterestRate: "20",
  loanMaxMultiplier: "3",
  loanRepaymentMonths: "6",
  loanLatePenalty: "500",
};

export function VehicleActivationWizard({ product }: { product: ActivatableProduct }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [loanSettings, setLoanSettings] = useState(DEFAULT_LOAN_SETTINGS);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copy = VEHICLE_COPY[product];
  const templates = RULE_TEMPLATES.filter((t) => t.category === (product as RuleCategory));
  const hasConfigStep = product === "loans";
  const stepTitles = hasConfigStep
    ? ["Activate", "Set your terms", "Starter rules", "Review"]
    : ["Activate", "Starter rules", "Review"];
  const lastStep = stepTitles.length - 1;

  function reset() {
    setStep(0);
    setLoanSettings(DEFAULT_LOAN_SETTINGS);
    setSelectedTemplateIds(new Set());
    setError(null);
  }

  function toggleTemplate(id: string) {
    setSelectedTemplateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function finish() {
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.set("product", product);
    if (hasConfigStep) {
      fd.set("loanInterestRate", loanSettings.loanInterestRate);
      fd.set("loanMaxMultiplier", loanSettings.loanMaxMultiplier);
      fd.set("loanRepaymentMonths", loanSettings.loanRepaymentMonths);
      fd.set("loanLatePenalty", loanSettings.loanLatePenalty);
    }
    for (const id of selectedTemplateIds) fd.append("templateIds", id);

    const result: ActivateProductState = await activateProductAction(null, fd);
    setPending(false);
    if (result && "error" in result) {
      setError(result.error);
      return;
    }
    toast.success(`${copy.label} activated`);
    setOpen(false);
    reset();
  }

  const rulesStepIndex = hasConfigStep ? 2 : 1;
  const isRulesStep = step === rulesStepIndex;
  const isReviewStep = step === lastStep;
  const isConfigStep = hasConfigStep && step === 1;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<Button type="button" size="sm" />}>Activate</DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Activate {copy.label}</DialogTitle>
        </DialogHeader>

        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Step {step + 1} of {stepTitles.length} — {stepTitles[step]}
        </p>

        {step === 0 && <p className="text-sm text-muted-foreground">{copy.intro}</p>}

        {isConfigStep && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              These become the terms new loans are computed against — every member&apos;s loan limit,
              interest, and due date. You can change them again later in Settings.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="wizard-interest">Interest rate (%)</Label>
                <Input
                  id="wizard-interest"
                  type="number"
                  min="0"
                  step="0.1"
                  value={loanSettings.loanInterestRate}
                  onChange={(e) =>
                    setLoanSettings((s) => ({ ...s, loanInterestRate: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wizard-multiplier">Loan limit (× total savings)</Label>
                <Input
                  id="wizard-multiplier"
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={loanSettings.loanMaxMultiplier}
                  onChange={(e) =>
                    setLoanSettings((s) => ({ ...s, loanMaxMultiplier: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wizard-months">Repayment period (months)</Label>
                <Input
                  id="wizard-months"
                  type="number"
                  min="1"
                  step="1"
                  value={loanSettings.loanRepaymentMonths}
                  onChange={(e) =>
                    setLoanSettings((s) => ({ ...s, loanRepaymentMonths: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wizard-penalty">Late penalty (Ksh)</Label>
                <Input
                  id="wizard-penalty"
                  type="number"
                  min="0"
                  step="1"
                  value={loanSettings.loanLatePenalty}
                  onChange={(e) =>
                    setLoanSettings((s) => ({ ...s, loanLatePenalty: e.target.value }))
                  }
                />
              </div>
            </div>
          </div>
        )}

        {isRulesStep && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Optional — pick any starter rules to add as-is. You can edit or deactivate them
              later from the Rules page.
            </p>
            <div className="space-y-2">
              {templates.map((t) => (
                <label
                  key={t.id}
                  className="flex items-start gap-3 rounded-md border p-3 text-sm"
                >
                  <input
                    type="checkbox"
                    className="mt-1 size-4"
                    checked={selectedTemplateIds.has(t.id)}
                    onChange={() => toggleTemplate(t.id)}
                  />
                  <span>
                    <span className="block font-medium">{t.title}</span>
                    <span className="block text-muted-foreground">{t.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        {isReviewStep && (
          <div className="space-y-3 text-sm">
            {hasConfigStep && (
              <div className="rounded-md border p-3">
                <p className="font-medium">Loan terms</p>
                <p className="text-muted-foreground">
                  {loanSettings.loanInterestRate}% interest, up to{" "}
                  {loanSettings.loanMaxMultiplier}× savings, {loanSettings.loanRepaymentMonths}-month
                  repayment, Ksh {loanSettings.loanLatePenalty} late penalty.
                </p>
              </div>
            )}
            <div className="rounded-md border p-3">
              <p className="font-medium">Starter rules</p>
              <p className="text-muted-foreground">
                {selectedTemplateIds.size === 0
                  ? "None selected — you can add rules any time from the Rules page."
                  : `${selectedTemplateIds.size} rule${selectedTemplateIds.size === 1 ? "" : "s"} will be added.`}
              </p>
            </div>
            {product === "mgr" && (
              <p className="text-muted-foreground">
                After this, set your rotation schedule in MGR → Config.
              </p>
            )}
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
              {pending ? "Activating…" : `Activate ${copy.label}`}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
