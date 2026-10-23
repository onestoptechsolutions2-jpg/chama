import { eq } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/session";
import Link from "next/link";
import { can } from "@/lib/auth/permissions";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { withTenant } from "@/lib/db/rls";
import { groups } from "@/lib/db/schema";
import { getOrCreateWelfarePolicy } from "@/app/(dashboard)/dashboard/welfare/welfare-data";
import { PageHeader } from "@/components/feature/page-header";
import { SettingsManager } from "@/components/feature/settings-manager";

export default async function SettingsPage() {
  const session = await requirePermission("settings.view");
  const groupId = session.activeMembership.groupId;
  const isAdmin = can(session.activeMembership, "settings.manage");
  const products = session.activeMembership.products;

  const group = await withTenant(groupId, (tx) =>
    tx.query.groups.findFirst({ where: eq(groups.id, groupId) }),
  );
  if (!group) return null;

  const welfarePolicy = products.welfare
    ? await withTenant(groupId, (tx) => getOrCreateWelfarePolicy(tx, groupId))
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description={isAdmin ? "Configure your group." : "View-only — ask an admin to make changes."}
      />
      <SettingsManager group={group} isAdmin={isAdmin} products={products} welfarePolicy={welfarePolicy} />
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-6 text-sm">
          <span className="text-muted-foreground">More tools:</span>
          <Link href="/dashboard/payments" className={buttonVariants({ variant: "outline", size: "sm" })}>
            M-Pesa &amp; payments
          </Link>
          <Link href="/dashboard/access" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Roles &amp; access
          </Link>
          {can(session.activeMembership, "billing.view") && (
            <Link href="/dashboard/wallet" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Prepaid wallet
            </Link>
          )}
          {can(session.activeMembership, "developer.manage") && (
            <Link href="/dashboard/developer" className={buttonVariants({ variant: "outline", size: "sm" })}>
              API keys &amp; webhooks
            </Link>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
