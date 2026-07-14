import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { groups, groupMemberships } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { JoinRequestForm } from "@/components/feature/join-request-form";

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const groupId = Number(id);
  if (!Number.isInteger(groupId)) notFound();

  const group = await db.query.groups.findFirst({
    where: and(eq(groups.id, groupId), eq(groups.isPublic, true), eq(groups.active, true)),
    columns: {
      id: true,
      name: true,
      type: true,
      description: true,
      meetingDay: true,
      meetingTime: true,
      meetingVenue: true,
      requireApproval: true,
      currency: true,
    },
  });
  if (!group) notFound();

  const session = await getSession();
  const existingMembership = session
    ? await db.query.groupMemberships.findFirst({
        where: and(
          eq(groupMemberships.userId, session.user.id),
          eq(groupMemberships.groupId, groupId),
        ),
      })
    : null;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 space-y-6">
      <Link href="/discover" className="text-sm text-muted-foreground underline underline-offset-4">
        ← Back to discovery
      </Link>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-xl">{group.name}</CardTitle>
            <Badge variant="secondary" className="capitalize shrink-0">
              {group.type}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {group.description || "No description provided."}
          </p>
          {group.meetingDay && (
            <p className="text-sm">
              <span className="text-muted-foreground">Meets:</span> {group.meetingDay}
              {group.meetingTime ? ` at ${group.meetingTime}` : ""}
              {group.meetingVenue ? ` · ${group.meetingVenue}` : ""}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {group.requireApproval
              ? "Join requests are reviewed by the group's admins."
              : "Join requests here are typically approved quickly."}
          </p>
        </CardContent>
      </Card>

      {!session ? (
        <Card>
          <CardContent className="pt-6 space-y-3">
            <p className="text-sm">Sign in or create an account to request to join.</p>
            <div className="flex gap-2">
              <Link href={`/login?next=/discover/${groupId}`} className={buttonVariants()}>
                Sign in
              </Link>
              <Link
                href={`/register?next=/discover/${groupId}`}
                className={buttonVariants({ variant: "outline" })}
              >
                Create account
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : existingMembership?.status === "active" ? (
        <Card>
          <CardContent className="pt-6 text-sm">
            You&apos;re already a member of this group.{" "}
            <Link href="/" className="underline underline-offset-4">
              Go to dashboard
            </Link>
          </CardContent>
        </Card>
      ) : existingMembership?.status === "pending" ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Your request to join is pending review.
          </CardContent>
        </Card>
      ) : existingMembership?.status === "suspended" ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Your membership here is suspended. Contact the group&apos;s admin.
          </CardContent>
        </Card>
      ) : (
        <JoinRequestForm groupId={group.id} />
      )}
    </div>
  );
}
