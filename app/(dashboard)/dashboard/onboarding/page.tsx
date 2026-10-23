"use client";

import { useActionState, useState } from "react";
import { createOnboardingGroupAction, type CreateGroupState } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SEGMENTS, SEGMENT_ORDER, type Segment } from "@/lib/domain/segments";

export default function OnboardingPage() {
  const [state, formAction, pending] = useActionState<CreateGroupState, FormData>(createOnboardingGroupAction, null);
  const [segment, setSegment] = useState<Segment | null>(null);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Start your group</h1>
        <p className="text-sm text-muted-foreground">
          Pick the kind of group you are. We set up the right money rules and a starter rule book — you can change
          everything later in Settings.
        </p>
      </div>
      <form action={formAction} className="space-y-6">
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-medium">What kind of group are you?</legend>
          {SEGMENT_ORDER.map((key) => {
            const s = SEGMENTS[key];
            const chosen = segment === key;
            return (
              <label
                key={key}
                className={`cursor-pointer rounded-xl border p-4 transition ${chosen ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-primary/50"}`}
              >
                <input
                  type="radio"
                  name="segment"
                  value={key}
                  className="sr-only"
                  checked={chosen}
                  onChange={() => setSegment(key)}
                />
                <span className="block font-semibold">{s.label}</span>
                <span className="block text-sm text-muted-foreground">{s.pitch}</span>
              </label>
            );
          })}
        </fieldset>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Group details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="onboarding-name">Group name</Label>
              <Input id="onboarding-name" name="name" placeholder="Umoja Women Group" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="onboarding-description">What is your group about? (optional)</Label>
              <Input id="onboarding-description" name="description" placeholder="Weekly savings and table banking" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="onboarding-role">Your role in the group</Label>
              <Input id="onboarding-role" name="contactPersonRole" placeholder="Chairperson" />
            </div>
          </CardContent>
        </Card>

        {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
        <Button type="submit" className="w-full" size="lg" disabled={pending || !segment}>
          {pending ? "Creating your group…" : "Create my group"}
        </Button>
      </form>
    </div>
  );
}
