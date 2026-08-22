import { desc, eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { subscriptionInvoices, groupWallets } from "@/lib/db/schema";
import { computeSubscriptionQuote } from "@/lib/domain/billing";
import { computeGroupBillingInputs } from "./data";
import { PageHeader } from "@/components/feature/page-header";
import { BillingManager } from "@/components/feature/billing-manager";

export default async function BillingPage() {
  const session = await requireRole("admin", "treasurer");
  const groupId = session.activeMembership.groupId;
  const isAdmin = session.activeMembership.role === "admin";

  const { quote, invoices, walletBalance } = await withTenant(groupId, async (tx) => {
    const inputs = await computeGroupBillingInputs(tx, groupId);
    const quote = computeSubscriptionQuote(inputs);

    const invoices = await tx
      .select()
      .from(subscriptionInvoices)
      .where(eq(subscriptionInvoices.groupId, groupId))
      .orderBy(desc(subscriptionInvoices.periodStart))
      .limit(24);

    const wallet = await tx.query.groupWallets.findFirst({
      where: eq(groupWallets.groupId, groupId),
    });

    return { quote, invoices, walletBalance: wallet?.balance ?? "0" };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing"
        description="What this group owes for the platform, computed from members, active vehicles, and real financial activity — not a flat number."
      />
      <BillingManager quote={quote} invoices={invoices} walletBalance={walletBalance} isAdmin={isAdmin} />
    </div>
  );
}
