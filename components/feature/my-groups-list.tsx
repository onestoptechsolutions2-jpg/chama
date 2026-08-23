"use client";

import { useTransition } from "react";
import Link from "next/link";
import type { ActiveMembership } from "@/lib/auth/session";
import { switchGroupAction } from "@/app/(dashboard)/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";

export function MyGroupsList({
  memberships,
  activeGroupId,
}: {
  memberships: ActiveMembership[];
  activeGroupId: number | null;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">My Groups</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {memberships.map((m) => {
          const active = m.groupId === activeGroupId;
          return (
            <div
              key={m.groupId}
              className={`flex items-center justify-between gap-3 rounded-lg border p-3 text-sm ${active ? "border-primary/40 bg-primary/5" : ""}`}
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{m.groupName}</p>
                <p className="capitalize text-muted-foreground">
                  {m.groupType} · <span className="capitalize">{m.role}</span>
                </p>
              </div>
              {active ? (
                <Badge variant="secondary" className="shrink-0">Active</Badge>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  disabled={isPending}
                  onClick={() => startTransition(() => switchGroupAction(m.groupId))}
                >
                  Switch
                </Button>
              )}
            </div>
          );
        })}
        <Link href="/discover" className={`${buttonVariants({ variant: "ghost", size: "sm" })} w-full`}>
          Discover more groups
        </Link>
      </CardContent>
    </Card>
  );
}
