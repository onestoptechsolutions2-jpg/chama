"use client";

import { useActionState } from "react";
import { createOnboardingGroupAction, type CreateGroupState } from "@/app/super-admin/groups/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function OnboardingPage() {
  const [state, formAction, pending] = useActionState<CreateGroupState, FormData>(
    createOnboardingGroupAction,
    null,
  );

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Set up your group</h1>
        <p className="text-sm text-muted-foreground">
          Start with the basics. You can finish rules, officials, and member invitations from the dashboard.
        </p>
      </div>
        <Card>
          <CardHeader><CardTitle>Group details</CardTitle></CardHeader>
          <CardContent>
            <form action={formAction} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="onboarding-name">Group name</Label>
                <Input id="onboarding-name" name="name" placeholder="Kilimani Circle" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="onboarding-type">Group type</Label>
                <Select name="type" defaultValue="chama" items={{ chama: "Chama", welfare: "Welfare", hybrid: "Hybrid", selfhelp: "Self-help" }}>
                  <SelectTrigger id="onboarding-type" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="chama">Chama</SelectItem>
                    <SelectItem value="welfare">Welfare</SelectItem>
                    <SelectItem value="hybrid">Hybrid</SelectItem>
                    <SelectItem value="selfhelp">Self-help</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="onboarding-description">What is your group about?</Label>
                <Input id="onboarding-description" name="description" placeholder="Monthly savings and table banking" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="onboarding-phone">Best contact phone</Label>
                <Input id="onboarding-phone" name="contactPersonPhone" autoComplete="tel" placeholder="0712345678" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="onboarding-role">Your role in the group</Label>
                <Input id="onboarding-role" name="contactPersonRole" placeholder="Chairperson" />
              </div>
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium">Choose what you want to manage first</legend>
                <label className="flex items-center gap-3 text-sm"><input type="checkbox" name="loansEnabled" className="size-4" /> Loans and table banking</label>
                <label className="flex items-center gap-3 text-sm"><input type="checkbox" name="welfareEnabled" className="size-4" /> Welfare fund</label>
                <label className="flex items-center gap-3 text-sm"><input type="checkbox" name="mgrEnabled" className="size-4" /> Merry-go-round</label>
                <label className="flex items-center gap-3 text-sm"><input type="checkbox" name="projectsEnabled" className="size-4" /> Group projects</label>
              </fieldset>
              {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? "Creating your group..." : "Create my group"}
              </Button>
            </form>
          </CardContent>
        </Card>
    </div>
  );
}
