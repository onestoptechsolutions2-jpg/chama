"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { members as membersTable } from "@/lib/db/schema";
import { attendanceStatuses } from "@/lib/validation/meetings";
import { saveAttendanceAction } from "@/app/(dashboard)/meetings/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Member = typeof membersTable.$inferSelect;
type Status = (typeof attendanceStatuses)[number];

export function AttendanceForm({
  meetingId,
  members,
  initialStatus,
}: {
  meetingId: number;
  members: Member[];
  initialStatus: Record<number, string>;
}) {
  const [status, setStatus] = useState<Record<number, Status>>(() => {
    const base: Record<number, Status> = {};
    for (const m of members) {
      base[m.id] = (initialStatus[m.id] as Status) ?? "present";
    }
    return base;
  });
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const records = members.map((m) => ({ memberId: m.id, status: status[m.id] }));
      const result = await saveAttendanceAction(meetingId, records);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Attendance saved");
      }
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3">
        {members.length === 0 && (
          <p className="text-sm text-muted-foreground">No members to mark attendance for.</p>
        )}
        {members.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-4 border-b pb-3 last:border-0">
            <span className="font-medium">{m.name}</span>
            <Select
              value={status[m.id]}
              onValueChange={(v) => setStatus((s) => ({ ...s, [m.id]: v as Status }))}
              items={Object.fromEntries(
                attendanceStatuses.map((s) => [s, s[0].toUpperCase() + s.slice(1)]),
              )}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {attendanceStatuses.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
        {members.length > 0 && (
          <Button onClick={save} disabled={isPending}>
            {isPending ? "Saving…" : "Save attendance"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
