"use client";

import { formatDate } from "@/lib/domain/dates";
import { useTransition } from "react";
import { toast } from "sonner";
import { mergeUsersAction } from "@/app/super-admin/users/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { displayPhone } from "@/lib/domain/identity";

export type DuplicateSet = {
  key: string;
  users: { id: number; name: string; phone: string | null; email: string | null; createdAt: string; groups: number }[];
};

/**
 * Accounts that share a phone or email — one person, several logins. Owners
 * pick which account to keep; the others are merged into it.
 */
export function DuplicateUsersPanel({ sets, canMerge }: { sets: DuplicateSet[]; canMerge: boolean }) {
  const [pending, startTransition] = useTransition();
  if (sets.length === 0) return null;

  function keep(set: DuplicateSet, keepId: number) {
    startTransition(async () => {
      for (const u of set.users.filter((x) => x.id !== keepId)) {
        const result = await mergeUsersAction(keepId, u.id);
        if ("error" in result) {
          toast.error(result.error);
          return;
        }
      }
      toast.success("Accounts merged");
    });
  }

  return (
    <Card className="border-amber-500/50">
      <CardHeader>
        <CardTitle className="text-base">Possible duplicates ({sets.length})</CardTitle>
        <p className="text-sm text-muted-foreground">
          These accounts share a phone or email. Keep one; the others are merged into it and deactivated.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {sets.map((set) => (
          <div key={set.key} className="space-y-2 rounded-lg border p-3">
            {set.users.map((u) => (
              <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div>
                  <span className="font-medium">{u.name}</span> <span className="text-muted-foreground">#{u.id}</span>
                  <div className="text-muted-foreground">
                    {[displayPhone(u.phone), u.email].filter(Boolean).join(" · ")} · {u.groups} group(s) · since{" "}
                    {formatDate(u.createdAt)}
                  </div>
                </div>
                {canMerge && (
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => keep(set, u.id)}>
                    Keep this one
                  </Button>
                )}
              </div>
            ))}
          </div>
        ))}
        {!canMerge && <p className="text-sm text-muted-foreground">Only an owner can merge accounts.</p>}
      </CardContent>
    </Card>
  );
}
