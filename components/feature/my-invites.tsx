import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { ROLE_LABELS } from "@/lib/domain/invites";
import type { MyInvite } from "@/lib/invites/data";

export function MyInvites({ invites }: { invites: MyInvite[] }) {
  if (invites.length === 0) return null;
  return (
    <div className="space-y-2">
      {invites.map((i) => (
        <Card key={i.token} className="border-primary/40 bg-primary/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
            <p className="text-sm">
              {i.inviterName ?? "Someone"} invited you to <strong>{i.groupName}</strong> as {ROLE_LABELS[i.role]}.
            </p>
            <Link href={`/invite/${i.token}`} className={buttonVariants({ size: "sm" })}>
              Open invite
            </Link>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
