import Link from "next/link";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { withPlatformAdmin } from "@/lib/db/rls";
import { groupInvites } from "@/lib/db/schema";
import { displayPhone } from "@/lib/domain/identity";
import { ROLE_LABELS } from "@/lib/domain/invites";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { AcceptInviteButton } from "./accept-button";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Looked up by its secret token only — nothing else about the group leaks.
  const invite = await withPlatformAdmin((tx) =>
    tx.query.groupInvites.findFirst({
      where: eq(groupInvites.token, token),
      with: { group: { columns: { name: true } }, inviter: { columns: { name: true } } },
    }),
  );
  const session = await getSession();
  const next = encodeURIComponent(`/invite/${token}`);

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center p-4">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{invite ? `Join ${invite.group.name}` : "Invite not found"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!invite ? (
            <p className="text-muted-foreground">This link is not valid. Ask the group to send a new invite.</p>
          ) : invite.status !== "pending" ? (
            <p className="text-muted-foreground">This invite has already been {invite.status}.</p>
          ) : (
            <>
              <p>
                {invite.inviter?.name ?? "The group"} invited <strong>{invite.name}</strong> to join as{" "}
                <strong>{ROLE_LABELS[invite.role]}</strong>.
              </p>
              {invite.phone && (
                <p className="text-sm text-muted-foreground">For phone {displayPhone(invite.phone)}.</p>
              )}
              {session ? (
                <AcceptInviteButton token={token} />
              ) : (
                <div className="flex flex-col gap-2">
                  <Link href={`/register?next=${next}`} className={buttonVariants()}>
                    I&apos;m new — create my account
                  </Link>
                  <Link href={`/login?next=${next}`} className={buttonVariants({ variant: "outline" })}>
                    I already have an account — sign in
                  </Link>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
