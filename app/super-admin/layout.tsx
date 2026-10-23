import Link from "next/link";
import { requirePlatformPermission } from "@/lib/auth/session";
import { logoutAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/super-admin/support", label: "Support" },
  { href: "/super-admin/groups", label: "Groups" },
  { href: "/super-admin/users", label: "Users" },
  { href: "/super-admin/stats", label: "Stats" },
  { href: "/super-admin/integrations", label: "Integrations" },
];

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requirePlatformPermission("platform.console");

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="truncate font-semibold">
            Chama <span className="hidden text-muted-foreground sm:inline">· Super Admin</span>
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden text-sm text-muted-foreground sm:inline">{session.user.name}</span>
            <form action={logoutAction}>
              <Button type="submit" variant="ghost" size="sm">
                Log out
              </Button>
            </form>
          </div>
        </div>
        {/* Scrolls sideways on a phone instead of pushing the page wider. */}
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 text-sm" aria-label="Super admin">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="shrink-0 rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="p-4 md:p-6">{children}</main>
    </div>
  );
}
