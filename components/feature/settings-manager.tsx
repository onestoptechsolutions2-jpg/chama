"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import type { groups as groupsTable } from "@/lib/db/schema";
import type { ProductFlags } from "@/lib/domain/products";
import {
  updateSettingsAction,
  updateProductAccessAction,
  updateCapitalPolicyAction,
  updateLoanSettingsAction,
  type SettingsActionState,
} from "@/app/(dashboard)/dashboard/settings/actions";
import { VehicleActivationWizard } from "@/components/feature/vehicle-activation-wizard";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";

type Group = typeof groupsTable.$inferSelect;

const PRODUCT_INFO: {
  key: keyof ProductFlags;
  name: string;
  label: string;
  description: string;
  href: string;
}[] = [
  { key: "loans", name: "loansEnabled", label: "Table Banking (Loans)", description: "Loan applications, approvals, and repayments.", href: "/dashboard/loans" },
  { key: "mgr", name: "mgrEnabled", label: "Merry-Go-Round", description: "Rotation cycles, turns, and payouts.", href: "/dashboard/mgr" },
  { key: "welfare", name: "welfareEnabled", label: "Welfare", description: "Welfare claims and the welfare fund.", href: "/dashboard/welfare" },
  { key: "projects", name: "projectsEnabled", label: "Investment (Projects)", description: "Table-banking / group projects and contributions.", href: "/dashboard/projects" },
];

function ProductsForm({ products, isAdmin }: { products: ProductFlags; isAdmin: boolean }) {
  const [state, formAction, pending] = useActionState<SettingsActionState, FormData>(
    updateProductAccessAction,
    null,
  );

  useEffect(() => {
    if (state && "ok" in state) toast.success("Products updated");
    if (state && "error" in state) toast.error(state.error);
  }, [state]);

  const active = PRODUCT_INFO.filter((p) => products[p.key]);
  const inactive = PRODUCT_INFO.filter((p) => !products[p.key]);

  return (
    <TabsContent value="products" className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Each vehicle is a financial product this group can run — activating one walks you
        through setting it up rather than just flipping a switch. Turning one off only hides
        it — existing data is kept and reappears if you turn it back on.
      </p>

      {inactive.length > 0 && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <p className="text-sm font-medium">Available to activate</p>
            {inactive.map((p) => (
              <div key={p.key} className="flex items-start justify-between gap-4 rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">{p.label}</p>
                  <p className="text-sm text-muted-foreground">{p.description}</p>
                </div>
                {isAdmin ? (
                  <VehicleActivationWizard product={p.key} />
                ) : (
                  <span className="text-xs text-muted-foreground">Admin only</span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {active.length > 0 && (
        <form action={formAction}>
          <Card>
            <CardContent className="space-y-3 pt-6">
              <p className="text-sm font-medium">Active</p>
              {active.map((p) => (
                <div key={p.key} className="flex items-start justify-between gap-4 rounded-md border p-3">
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      name={p.name}
                      defaultChecked
                      disabled={!isAdmin}
                      className="mt-1 size-4"
                    />
                    <span>
                      <span className="block text-sm font-medium">{p.label}</span>
                      <span className="block text-sm text-muted-foreground">{p.description}</span>
                    </span>
                  </label>
                  <Link href={p.href} className={buttonVariants({ size: "sm", variant: "outline" })}>
                    Manage
                  </Link>
                </div>
              ))}
              {/* Inactive products aren't rendered as checkboxes here, so submitting
                  this form never touches them — updateProductAccessAction reads each
                  field independently and a missing field just means "stays off". */}
            </CardContent>
          </Card>
          {isAdmin && (
            <Button type="submit" disabled={pending} className="mt-4">
              {pending ? "Saving…" : "Save active vehicles"}
            </Button>
          )}
        </form>
      )}
    </TabsContent>
  );
}

function LoanSettingsForm({ group, isAdmin }: { group: Group; isAdmin: boolean }) {
  const [state, formAction, pending] = useActionState<SettingsActionState, FormData>(
    updateLoanSettingsAction,
    null,
  );

  useEffect(() => {
    if (state && "ok" in state) toast.success("Loan terms updated");
    if (state && "error" in state) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction}>
      <TabsContent value="loans">
        <Card>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <p className="text-sm text-muted-foreground sm:col-span-2">
              What every new loan is computed against — a member&apos;s limit, interest, and due
              date. Changing these doesn&apos;t alter loans already issued.
            </p>
            <div className="space-y-2">
              <Label htmlFor="loanInterestRate">Interest rate (%)</Label>
              <Input
                id="loanInterestRate"
                name="loanInterestRate"
                type="number"
                min="0"
                step="0.1"
                defaultValue={group.loanInterestRate}
                disabled={!isAdmin}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="loanMaxMultiplier">Loan limit (× total savings)</Label>
              <Input
                id="loanMaxMultiplier"
                name="loanMaxMultiplier"
                type="number"
                min="0.1"
                step="0.1"
                defaultValue={group.loanMaxMultiplier}
                disabled={!isAdmin}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="loanRepaymentMonths">Repayment period (months)</Label>
              <Input
                id="loanRepaymentMonths"
                name="loanRepaymentMonths"
                type="number"
                min="1"
                step="1"
                defaultValue={group.loanRepaymentMonths}
                disabled={!isAdmin}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="loanLatePenalty">Late penalty (Ksh)</Label>
              <Input
                id="loanLatePenalty"
                name="loanLatePenalty"
                type="number"
                min="0"
                step="1"
                defaultValue={group.loanLatePenalty}
                disabled={!isAdmin}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="loanMinGuarantors">Required guarantors</Label>
              <Input
                id="loanMinGuarantors"
                name="loanMinGuarantors"
                type="number"
                min="0"
                max="10"
                step="1"
                defaultValue={group.loanMinGuarantors}
                disabled={!isAdmin}
              />
              <p className="text-xs text-muted-foreground">
                How many must accept before a self-service application can be approved. 0 means
                guarantors aren&apos;t required.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="loanMaxConcurrentGuarantees">Max loans a member may guarantee at once</Label>
              <Input
                id="loanMaxConcurrentGuarantees"
                name="loanMaxConcurrentGuarantees"
                type="number"
                min="1"
                max="20"
                step="1"
                defaultValue={group.loanMaxConcurrentGuarantees}
                disabled={!isAdmin}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="minLoanAmount">Minimum loan amount (Ksh)</Label>
              <Input
                id="minLoanAmount"
                name="minLoanAmount"
                type="number"
                min="0"
                step="1"
                defaultValue={group.minLoanAmount}
                disabled={!isAdmin}
              />
            </div>
          </CardContent>
        </Card>
      </TabsContent>
      {isAdmin && (
        <Button type="submit" disabled={pending} className="mt-4">
          {pending ? "Saving…" : "Save loan terms"}
        </Button>
      )}
    </form>
  );
}

function CapitalPolicyForm({ group, isAdmin }: { group: Group; isAdmin: boolean }) {
  const [state, formAction, pending] = useActionState<SettingsActionState, FormData>(
    updateCapitalPolicyAction,
    null,
  );

  useEffect(() => {
    if (state && "ok" in state) toast.success("Capital policy updated");
    if (state && "error" in state) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction}>
      <TabsContent value="capital">
        <Card>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              What share of the capital pool (members&apos; combined capital contributions —
              not security or personal savings) the group intends to typically have out on
              loan at once. The Capital Position page flags it when actual deployment drifts
              more than 15 points from this target. Leave blank for no target — nothing is
              flagged either way.
            </p>
            <div className="max-w-xs space-y-2">
              <Label htmlFor="targetLoanDeploymentPct">Target loan deployment (%)</Label>
              <Input
                id="targetLoanDeploymentPct"
                name="targetLoanDeploymentPct"
                type="number"
                min="0"
                max="100"
                step="1"
                placeholder="e.g. 60"
                defaultValue={group.targetLoanDeploymentPct ?? ""}
                disabled={!isAdmin}
              />
            </div>
          </CardContent>
        </Card>
      </TabsContent>
      {isAdmin && (
        <Button type="submit" disabled={pending} className="mt-4">
          {pending ? "Saving…" : "Save capital policy"}
        </Button>
      )}
    </form>
  );
}

export function SettingsManager({
  group,
  isAdmin,
  products,
}: {
  group: Group;
  isAdmin: boolean;
  products: ProductFlags;
}) {
  const [state, formAction, pending] = useActionState<SettingsActionState, FormData>(
    updateSettingsAction,
    null,
  );

  useEffect(() => {
    if (state && "ok" in state) toast.success("Settings saved");
    if (state && "error" in state) toast.error(state.error);
  }, [state]);

  return (
    <Tabs defaultValue="group">
      <TabsList>
        <TabsTrigger value="group">Group</TabsTrigger>
        <TabsTrigger value="contributions">Contributions</TabsTrigger>
        <TabsTrigger value="fines">Fines</TabsTrigger>
        <TabsTrigger value="loans">Loans</TabsTrigger>
        <TabsTrigger value="products">Products</TabsTrigger>
        <TabsTrigger value="capital">Capital policy</TabsTrigger>
      </TabsList>

      <form action={formAction}>
        <TabsContent value="group">
          <Card>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Group name</Label>
                <Input id="name" name="name" defaultValue={group.name} disabled={!isAdmin} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="meetingDay">Meeting day</Label>
                <Input
                  id="meetingDay"
                  name="meetingDay"
                  defaultValue={group.meetingDay ?? ""}
                  placeholder="first_sunday"
                  disabled={!isAdmin}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="meetingTime">Meeting time</Label>
                <Input
                  id="meetingTime"
                  name="meetingTime"
                  defaultValue={group.meetingTime ?? ""}
                  disabled={!isAdmin}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="meetingVenue">Meeting venue</Label>
                <Input
                  id="meetingVenue"
                  name="meetingVenue"
                  defaultValue={group.meetingVenue ?? ""}
                  disabled={!isAdmin}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  name="description"
                  defaultValue={group.description ?? ""}
                  disabled={!isAdmin}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contributions">
          <Card>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sharePrice">Share price (Ksh)</Label>
                <Input
                  id="sharePrice"
                  name="sharePrice"
                  type="number"
                  min="0"
                  defaultValue={group.sharePrice}
                  disabled={!isAdmin}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sharesPerMember">Shares per member</Label>
                <Input
                  id="sharesPerMember"
                  name="sharesPerMember"
                  type="number"
                  min="1"
                  defaultValue={group.sharesPerMember}
                  disabled={!isAdmin}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contributionDay">Contribution day of month</Label>
                <Input
                  id="contributionDay"
                  name="contributionDay"
                  type="number"
                  min="1"
                  max="31"
                  defaultValue={group.contributionDay}
                  disabled={!isAdmin}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="minPersonalSavingsIncrement">Minimum personal savings increment (Ksh)</Label>
                <Input
                  id="minPersonalSavingsIncrement"
                  name="minPersonalSavingsIncrement"
                  type="number"
                  min="0"
                  defaultValue={group.minPersonalSavingsIncrement}
                  disabled={!isAdmin}
                />
                <p className="text-xs text-muted-foreground">
                  Capital and security contributions have no minimum; this only applies to personal savings.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fines">
          <Card>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="fineLateness">Lateness fine (Ksh)</Label>
                <Input
                  id="fineLateness"
                  name="fineLateness"
                  type="number"
                  min="0"
                  defaultValue={group.fineLateness}
                  disabled={!isAdmin}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fineAbsence">Absence fine (Ksh)</Label>
                <Input
                  id="fineAbsence"
                  name="fineAbsence"
                  type="number"
                  min="0"
                  defaultValue={group.fineAbsence}
                  disabled={!isAdmin}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fineRuleViolation">Rule violation fine (Ksh)</Label>
                <Input
                  id="fineRuleViolation"
                  name="fineRuleViolation"
                  type="number"
                  min="0"
                  defaultValue={group.fineRuleViolation}
                  disabled={!isAdmin}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {isAdmin && (
          <Button type="submit" disabled={pending} className="mt-4">
            {pending ? "Saving…" : "Save settings"}
          </Button>
        )}
      </form>

      <LoanSettingsForm group={group} isAdmin={isAdmin} />
      <ProductsForm products={products} isAdmin={isAdmin} />
      <CapitalPolicyForm group={group} isAdmin={isAdmin} />
    </Tabs>
  );
}
