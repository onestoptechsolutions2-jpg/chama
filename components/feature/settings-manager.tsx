"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import type { groups as groupsTable } from "@/lib/db/schema";
import { updateSettingsAction, type SettingsActionState } from "@/app/(dashboard)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Group = typeof groupsTable.$inferSelect;

export function SettingsManager({ group, isAdmin }: { group: Group; isAdmin: boolean }) {
  const [state, formAction, pending] = useActionState<SettingsActionState, FormData>(
    updateSettingsAction,
    null,
  );

  useEffect(() => {
    if (state && "ok" in state) toast.success("Settings saved");
    if (state && "error" in state) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction}>
      <Tabs defaultValue="group">
        <TabsList>
          <TabsTrigger value="group">Group</TabsTrigger>
          <TabsTrigger value="contributions">Contributions</TabsTrigger>
          <TabsTrigger value="fines">Fines</TabsTrigger>
        </TabsList>

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
      </Tabs>

      {isAdmin && (
        <Button type="submit" disabled={pending} className="mt-4">
          {pending ? "Saving…" : "Save settings"}
        </Button>
      )}
    </form>
  );
}
