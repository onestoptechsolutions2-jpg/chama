import { requireSession } from "@/lib/auth/session";
import { DashboardShell } from "@/components/feature/dashboard-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();

  return <DashboardShell session={session}>{children}</DashboardShell>;
}
