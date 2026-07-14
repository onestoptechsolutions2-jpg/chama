import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { logoutAction } from "@/app/(auth)/actions";
import { Button, buttonVariants } from "@/components/ui/button";

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requirePlatformAdmin();

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between gap-4 border-b p-4">
        <div className="flex items-center gap-6">
          <span className="font-semibold">Chama Platform · Super Admin</span>
          <nav className="flex gap-4 text-sm">
            <Link href="/super-admin/groups" className="text-muted-foreground hover:text-foreground">
              Groups
            </Link>
            <Link href="/super-admin/stats" className="text-muted-foreground hover:text-foreground">
              Stats
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{session.user.name}</span>
          <Link href="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Back to app
          </Link>
          <form action={logoutAction}>
            <Button type="submit" variant="ghost" size="sm">
              Log out
            </Button>
          </form>
        </div>
      </header>
      <main className="p-4 md:p-6">{children}</main>
    </div>
  );
}
