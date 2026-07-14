import Link from "next/link";
import { getVisibleNavItems } from "@/lib/nav-config";
import type { GroupType, MembershipRole } from "@/lib/auth/session";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ROLE_SUMMARY: Record<MembershipRole, string> = {
  admin:
    "Full access to this group's operations — everything below, plus approving pending join requests and changing Settings.",
  treasurer:
    "The same operational access as an admin in this app today — members, fines, meetings, loans, settings, and approving pending members.",
  secretary:
    "Records and meetings — members, fines, meetings, and settings, but not loan approvals or pending-member approvals.",
  member:
    "A participant, not staff — apply for a loan (if enabled for this group type), claim your MGR slot, submit welfare claims or contribute to projects (if enabled), and see your own statement.",
};

const GROUP_TYPE_SUMMARY: Record<GroupType, string> = {
  chama: "Loans and Merry-Go-Round are enabled; Welfare and Projects are not.",
  welfare: "Welfare claims are enabled; Loans, Merry-Go-Round, and Projects are not.",
  hybrid: "Every feature — Loans, Merry-Go-Round, Welfare, and Projects — is enabled.",
  selfhelp: "Loans and Projects are enabled; Merry-Go-Round and Welfare are not.",
};

export function RoleGuide({
  role,
  groupType,
  groupName,
}: {
  role: MembershipRole;
  groupType: GroupType;
  groupName: string;
}) {
  const items = getVisibleNavItems({ role, groupType }).filter(
    (item) => item.href !== "/" && item.href !== "/guide",
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">{groupName}</CardTitle>
            <Badge variant="secondary" className="capitalize">
              {role}
            </Badge>
            <Badge variant="outline" className="capitalize">
              {groupType}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>{ROLE_SUMMARY[role]}</p>
          <p>{GROUP_TYPE_SUMMARY[groupType]}</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className="block">
              <Card className="h-full transition-colors hover:bg-muted/50">
                <CardHeader className="flex-row items-center gap-2 space-y-0">
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <CardTitle className="text-sm">{item.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{item.guide}</p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">A few things that apply everywhere</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Belong to more than one group?</span>{" "}
            Switch between them from the dropdown at the top of the sidebar — everything on
            every page is scoped to whichever group is currently selected there.
          </p>
          <p>
            <span className="font-medium text-foreground">Want to join another group?</span>{" "}
            Browse <Link href="/discover" className="underline underline-offset-4">public groups</Link>{" "}
            and send a join request — an admin or treasurer there will need to approve it before
            you get access.
          </p>
          <p>
            <span className="font-medium text-foreground">MGR agreement.</span> The first time
            you interact with a Merry-Go-Round cycle, you&apos;ll be asked to sign a one-time
            agreement for that cycle before you can claim a slot — this covers the platform&apos;s
            5% fee on payouts and the group&apos;s own rotation terms.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
