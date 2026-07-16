import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth/session";
import { withTenant } from "@/lib/db/rls";
import { groupWallets, walletTransactions } from "@/lib/db/schema";
import { PageHeader } from "@/components/feature/page-header";
import { WalletManager } from "@/components/feature/wallet-manager";

export default async function WalletPage() {
  const session = await requireRole("admin", "treasurer");
  const groupId = session.activeMembership.groupId;

  const { wallet, transactions } = await withTenant(groupId, async (tx) => {
    const wallet = await tx.query.groupWallets.findFirst({
      where: eq(groupWallets.groupId, groupId),
    });
    const transactions = await tx.query.walletTransactions.findMany({
      where: eq(walletTransactions.groupId, groupId),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
      limit: 50,
    });
    return { wallet, transactions };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Wallet"
        description="A prepaid balance for the platform's own fees only — never member savings, contributions, or loan funds."
      />
      <WalletManager balance={wallet?.balance ?? "0"} transactions={transactions} />
    </div>
  );
}
