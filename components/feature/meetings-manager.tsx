"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { meetings as meetingsTable } from "@/lib/db/schema";
import { meetingTypes } from "@/lib/validation/meetings";
import { createMeetingAction, type MeetingActionState } from "@/app/(dashboard)/meetings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Meeting = typeof meetingsTable.$inferSelect;

function ScheduleMeetingForm() {
  const [state, formAction, pending] = useActionState<MeetingActionState, FormData>(
    createMeetingAction,
    null,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Schedule a meeting</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="meetingDate">Date</Label>
            <Input id="meetingDate" name="meetingDate" type="date" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="meetingType">Type</Label>
            <Select
              name="meetingType"
              defaultValue="regular"
              items={Object.fromEntries(
                meetingTypes.map((t) => [t, t[0].toUpperCase() + t.slice(1)]),
              )}
            >
              <SelectTrigger id="meetingType" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {meetingTypes.map((t) => (
                  <SelectItem key={t} value={t} className="capitalize">
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="venue">Venue</Label>
            <Input id="venue" name="venue" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="agenda">Agenda</Label>
            <Input id="agenda" name="agenda" />
          </div>
          {state?.error && (
            <p className="sm:col-span-2 lg:col-span-4 text-sm text-destructive">
              {state.error}
            </p>
          )}
          <Button type="submit" disabled={pending} className="lg:col-span-4 lg:w-fit">
            {pending ? "Scheduling…" : "Schedule meeting"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function MeetingsManager({ meetings }: { meetings: Meeting[] }) {
  return (
    <div className="space-y-6">
      <ScheduleMeetingForm />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All meetings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {meetings.length === 0 && (
            <p className="text-sm text-muted-foreground">No meetings scheduled yet.</p>
          )}
          {meetings.map((m) => (
            <Link
              key={m.id}
              href={`/meetings/${m.id}`}
              className="flex items-center justify-between rounded-md border p-3 text-sm hover:bg-muted"
            >
              <div>
                <span className="font-medium">{m.meetingDate}</span>
                <span className="ml-2 capitalize text-muted-foreground">{m.meetingType}</span>
                {m.venue && <span className="ml-2 text-muted-foreground">· {m.venue}</span>}
              </div>
              <span className="text-muted-foreground">Mark attendance →</span>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
