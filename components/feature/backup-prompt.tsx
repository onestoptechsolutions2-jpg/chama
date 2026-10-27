"use client";

import { useState, useTransition } from "react";
import { dismissBackupPromptAction } from "@/app/(dashboard)/dashboard/backups/actions";
import { Button, buttonVariants } from "@/components/ui/button";

/**
 * Shown to a group's officials when today's backup is ready and they haven't
 * downloaded it yet. Download or "Not now"; it comes back with tomorrow's.
 */
export function BackupPrompt({ backup }: { backup: { id: number; date: string; sizeKb: number } }) {
  const [hidden, setHidden] = useState(false);
  const [pending, start] = useTransition();
  if (hidden) return null;
  return (
    <div role="dialog" aria-label="Today's backup" className="fixed inset-x-0 bottom-20 z-40 mx-auto max-w-md px-4 md:bottom-6">
      <div className="space-y-3 rounded-xl border bg-background p-4 shadow-lg">
        <div>
          <p className="font-semibold">Today&apos;s backup is ready</p>
          <p className="text-sm text-muted-foreground">
            The group&apos;s full record for {backup.date} in one Excel file ({backup.sizeKb} KB). Keep a copy safe — it holds members&apos; details
            and money.
          </p>
        </div>
        <div className="flex gap-2">
          <a href={`/api/backups/${backup.id}`} className={buttonVariants()} onClick={() => setTimeout(() => setHidden(true), 500)}>
            Download
          </a>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setHidden(true);
                await dismissBackupPromptAction(backup.id);
              })
            }
          >
            Not now
          </Button>
        </div>
      </div>
    </div>
  );
}
