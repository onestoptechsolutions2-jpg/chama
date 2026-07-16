"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import type { groups as groupsTable } from "@/lib/db/schema";
import type { ProductFlags } from "@/lib/domain/products";
import {
  updateSettingsAction,
  updateProductAccessAction,
  type SettingsActionState,
} from "@/app/(dashboard)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Group = typeof groupsTable.$inferSelect;

const PRODUCT_TOGGLES: { key: keyof ProductFlags; name: string; label: string; description: string }[] = [
  { key: "loans", name: "loansEnabled", label: "Loans", description: "Loan applications, approvals, and repayments." },
  { key: "mgr", name: "mgrEnabled", label: "Merry-Go-Round", description: "Rotation cycles, turns, and payouts." },
  { key: "welfare", name: "welfareEnabled", label: "Welfare", description: "Welfare claims and the welfare fund." },
  { key: "projects", name: "projectsEnabled", label: "Projects", description: "Table-banking / group projects and contributions." },
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

  return (
    <form action={formAction}>
      <TabsContent value="products">
        <Card>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Turn products on or off for this group. Turning one off only hides it — existing
              data is kept and reappears if you turn it back on.
            </p>
            {PRODUCT_TOGGLES.map((p) => (
              <label key={p.key} className="flex items-start gap-3">
                <input
                  type="checkbox"
                  name={p.name}
                  defaultChecked={products[p.key]}
                  disabled={!isAdmin}
                  className="mt-1 size-4"
                />
                <span>
                  <span className="block text-sm font-medium">{p.label}</span>
                  <span className="block text-sm text-muted-foreground">{p.description}</span>
                </span>
              </label>
            ))}
          </CardContent>
        </Card>
      </TabsContent>
      {isAdmin && (
        <Button type="submit" disabled={pending} className="mt-4">
          {pending ? "Saving…" : "Save products"}
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
        <TabsTrigger value="products">Products</TabsTrigger>
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

      <ProductsForm products={products} isAdmin={isAdmin} />
    </Tabs>
  );
}
