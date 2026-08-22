"use client";

import { useMemo, useState, useActionState, useTransition } from "react";
import type { rules as rulesTable } from "@/lib/db/schema";
import { ruleCategories } from "@/lib/validation/rules";
import { visibleRuleTemplates, type RuleTemplate } from "@/lib/domain/rule-templates";
import type { ProductFlags } from "@/lib/domain/products";
import {
  createRuleAction,
  deactivateRuleAction,
  type RuleActionState,
} from "@/app/(dashboard)/dashboard/rules/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

type Rule = typeof rulesTable.$inferSelect;

function ksh(n: string | number) {
  return `Ksh ${Number(n).toLocaleString()}`;
}

function DeactivateButton({ ruleId }: { ruleId: number }) {
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={isPending}
      onClick={() => startTransition(() => deactivateRuleAction(ruleId))}
    >
      Deactivate
    </Button>
  );
}

function TemplateBrowser({
  templates,
  onPick,
}: {
  templates: RuleTemplate[];
  onPick: (template: RuleTemplate) => void;
}) {
  const [open, setOpen] = useState(false);
  const byCategory = useMemo(() => {
    const map = new Map<string, RuleTemplate[]>();
    for (const t of templates) {
      const list = map.get(t.category) ?? [];
      list.push(t);
      map.set(t.category, list);
    }
    return map;
  }, [templates]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" />}>
        Browse templates
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Rule templates</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Common rules for the vehicles this group has active. Pick one to load it into the form
          below, then edit the wording, category, or penalty to fit your group before saving —
          nothing is added until you do.
        </p>
        <div className="space-y-6">
          {[...byCategory.entries()].map(([category, categoryTemplates]) => (
            <div key={category} className="space-y-2">
              <h3 className="text-sm font-semibold capitalize">{category}</h3>
              <div className="space-y-2">
                {categoryTemplates.map((t) => (
                  <div key={t.id} className="rounded-md border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-medium">{t.title}</p>
                        <p className="text-sm text-muted-foreground">{t.description}</p>
                        {t.suggestedPenaltyAmount !== undefined && (
                          <p className="text-xs text-muted-foreground">
                            Suggested penalty: {ksh(t.suggestedPenaltyAmount)}
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="shrink-0"
                        onClick={() => {
                          onPick(t);
                          setOpen(false);
                        }}
                      >
                        Use this
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddRuleForm({
  templates,
  template,
  onClearTemplate,
  onPickTemplate,
}: {
  templates: RuleTemplate[];
  template: RuleTemplate | null;
  onClearTemplate: () => void;
  onPickTemplate: (template: RuleTemplate) => void;
}) {
  const [state, formAction, pending] = useActionState<RuleActionState, FormData>(
    createRuleAction,
    null,
  );

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Add a rule</CardTitle>
        <TemplateBrowser templates={templates} onPick={onPickTemplate} />
      </CardHeader>
      <CardContent>
        {template && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-dashed p-3 text-sm">
            <span className="text-muted-foreground">
              Loaded from the &ldquo;{template.title}&rdquo; template — edit anything below before
              saving.
            </span>
            <Button type="button" size="sm" variant="ghost" onClick={onClearTemplate}>
              Clear
            </Button>
          </div>
        )}
        {/* Keying on the template forces a remount, so defaultValue actually
            resets to the newly-picked template's text — plain uncontrolled
            inputs otherwise ignore a changed defaultValue after first render. */}
        <form key={template?.id ?? "blank"} action={formAction} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select
                name="category"
                defaultValue={template?.category ?? "general"}
                items={Object.fromEntries(ruleCategories.map((c) => [c, c.replace("_", " ")]))}
              >
                <SelectTrigger id="category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ruleCategories.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">
                      {c.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">Title (optional)</Label>
              <Input
                id="title"
                name="title"
                placeholder="Monthly Contribution"
                defaultValue={template?.title ?? ""}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              required
              defaultValue={template?.description ?? ""}
            />
          </div>
          <div className="space-y-2 sm:w-48">
            <Label htmlFor="penaltyAmount">Penalty amount (Ksh, optional)</Label>
            <Input
              id="penaltyAmount"
              name="penaltyAmount"
              type="number"
              min="0"
              step="1"
              defaultValue={template?.suggestedPenaltyAmount ?? ""}
            />
          </div>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" disabled={pending}>
            {pending ? "Adding…" : "Add rule"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function RulesManager({
  rules,
  isAdmin,
  rulesAcceptedAt,
  products,
}: {
  rules: Rule[];
  isAdmin: boolean;
  rulesAcceptedAt: Date | null;
  products: ProductFlags;
}) {
  const [template, setTemplate] = useState<RuleTemplate | null>(null);
  const templates = useMemo(() => visibleRuleTemplates(products), [products]);
  const byCategory = new Map<string, Rule[]>();
  for (const rule of rules) {
    const list = byCategory.get(rule.category) ?? [];
    list.push(rule);
    byCategory.set(rule.category, list);
  }

  return (
    <div className="space-y-6">
      {rulesAcceptedAt && (
        <p className="text-sm text-muted-foreground">
          You accepted these rules on {new Date(rulesAcceptedAt).toLocaleDateString()}, the day
          you joined this group — binding automatically, not a separate step.
        </p>
      )}
      {isAdmin && (
        <AddRuleForm
          templates={templates}
          template={template}
          onPickTemplate={setTemplate}
          onClearTemplate={() => setTemplate(null)}
        />
      )}

      {rules.length === 0 && (
        <p className="text-sm text-muted-foreground">No rules recorded yet.</p>
      )}

      {[...byCategory.entries()].map(([category, categoryRules]) => (
        <Card key={category}>
          <CardHeader>
            <CardTitle className="text-base capitalize">{category}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {categoryRules.map((rule) => (
              <div
                key={rule.id}
                className="flex items-start justify-between gap-4 rounded-md border p-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">#{rule.ruleNumber}</Badge>
                    {rule.title && <span className="font-medium">{rule.title}</span>}
                  </div>
                  <p className="text-sm text-muted-foreground">{rule.description}</p>
                  {rule.penaltyAmount && (
                    <p className="text-xs text-muted-foreground">
                      Penalty: {ksh(rule.penaltyAmount)}
                    </p>
                  )}
                </div>
                {isAdmin && <DeactivateButton ruleId={rule.id} />}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
