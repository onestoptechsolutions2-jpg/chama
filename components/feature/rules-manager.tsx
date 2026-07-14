"use client";

import { useActionState, useTransition } from "react";
import type { rules as rulesTable } from "@/lib/db/schema";
import { ruleCategories } from "@/lib/validation/rules";
import {
  createRuleAction,
  deactivateRuleAction,
  type RuleActionState,
} from "@/app/(dashboard)/rules/actions";
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

function AddRuleForm() {
  const [state, formAction, pending] = useActionState<RuleActionState, FormData>(
    createRuleAction,
    null,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Add a rule</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select
                name="category"
                defaultValue="general"
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
              <Input id="title" name="title" placeholder="Monthly Contribution" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" required />
          </div>
          <div className="space-y-2 sm:w-48">
            <Label htmlFor="penaltyAmount">Penalty amount (Ksh, optional)</Label>
            <Input id="penaltyAmount" name="penaltyAmount" type="number" min="0" step="1" />
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

export function RulesManager({ rules, isAdmin }: { rules: Rule[]; isAdmin: boolean }) {
  const byCategory = new Map<string, Rule[]>();
  for (const rule of rules) {
    const list = byCategory.get(rule.category) ?? [];
    list.push(rule);
    byCategory.set(rule.category, list);
  }

  return (
    <div className="space-y-6">
      {isAdmin && <AddRuleForm />}

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
