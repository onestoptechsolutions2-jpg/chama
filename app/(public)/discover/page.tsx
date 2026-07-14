import Link from "next/link";
import { and, count, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { groups, groupMemberships } from "@/lib/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

export default async function DiscoverPage() {
  const publicGroups = await db.query.groups.findMany({
    where: and(eq(groups.isPublic, true), eq(groups.active, true)),
    columns: {
      id: true,
      name: true,
      type: true,
      description: true,
      meetingDay: true,
      meetingVenue: true,
      requireApproval: true,
      maxMembers: true,
    },
    orderBy: (g, { asc }) => [asc(g.name)],
  });

  const counts = publicGroups.length
    ? await db
        .select({ groupId: groupMemberships.groupId, memberCount: count() })
        .from(groupMemberships)
        .where(
          and(
            inArray(
              groupMemberships.groupId,
              publicGroups.map((g) => g.id),
            ),
            eq(groupMemberships.status, "active"),
          ),
        )
        .groupBy(groupMemberships.groupId)
    : [];
  const countByGroup = new Map(counts.map((c) => [c.groupId, c.memberCount]));

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Discover a group</h1>
        <p className="text-sm text-muted-foreground">
          Browse public chamas, welfare groups, and self-help groups accepting new members.
        </p>
      </div>

      {publicGroups.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            No public groups are open for discovery right now.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {publicGroups.map((g) => {
          const memberCount = countByGroup.get(g.id) ?? 0;
          const full = g.maxMembers ? memberCount >= g.maxMembers : false;
          return (
            <Card key={g.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{g.name}</CardTitle>
                  <Badge variant="secondary" className="capitalize shrink-0">
                    {g.type}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground line-clamp-3">
                  {g.description || "No description provided."}
                </p>
                <p className="text-xs text-muted-foreground">
                  {memberCount} member{memberCount === 1 ? "" : "s"}
                  {g.meetingDay ? ` · Meets ${g.meetingDay}` : ""}
                  {full ? " · Full" : ""}
                </p>
                {full ? (
                  <p className="text-sm font-medium text-muted-foreground">Group full</p>
                ) : (
                  <Link
                    href={`/discover/${g.id}`}
                    className={buttonVariants({ size: "sm", variant: "outline" })}
                  >
                    View &amp; request to join
                  </Link>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
