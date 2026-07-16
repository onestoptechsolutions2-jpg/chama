"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, ChevronsUpDown, LogOut, ShieldCheck } from "lucide-react";
import { getVisibleNavItems, type NavItem } from "@/lib/nav-config";
import type { Session } from "@/lib/auth/session";
import { switchGroupAction } from "@/app/(dashboard)/actions";
import { logoutAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function GroupSwitcher({ session }: { session: Session }) {
  const [isPending, startTransition] = useTransition();
  if (session.memberships.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            className="w-full justify-between"
            disabled={isPending}
            data-tour="group-switcher"
          />
        }
      >
        <span className="truncate">
          {session.activeMembership?.groupName ?? "Select a group"}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Your groups</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {session.memberships.map((m) => (
          <DropdownMenuItem
            key={m.groupId}
            onClick={() =>
              startTransition(() => {
                switchGroupAction(m.groupId);
              })
            }
          >
            <span className="flex-1 truncate">{m.groupName}</span>
            <Badge variant="secondary" className="ml-2 capitalize">
              {m.role}
            </Badge>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarContent({
  session,
  navItems,
  onNavigate,
}: {
  session: Session;
  navItems: NavItem[];
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="px-1 text-lg font-semibold">Chama Platform</div>
      <GroupSwitcher session={session} />
      <div className="flex-1 overflow-y-auto">
        <NavLinks items={navItems} onNavigate={onNavigate} />
      </div>
      {session.user.platformRole && (
        <Link
          href="/super-admin/groups"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ShieldCheck className="h-4 w-4" />
          Super Admin
        </Link>
      )}
      <div className="flex items-center gap-3 rounded-md border p-3">
        <Avatar>
          <AvatarFallback>{initials(session.user.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{session.user.name}</p>
          <p className="truncate text-xs capitalize text-muted-foreground">
            {session.activeMembership?.role ?? "no group"}
          </p>
        </div>
        <form action={logoutAction}>
          <Button type="submit" variant="ghost" size="icon" title="Log out">
            <LogOut className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}

export function DashboardShell({
  session,
  children,
}: {
  session: Session;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navItems = getVisibleNavItems(
    session.activeMembership
      ? { role: session.activeMembership.role, products: session.activeMembership.products }
      : null,
  );

  return (
    <div className="flex min-h-screen">
      <aside
        className="hidden w-64 shrink-0 border-r bg-background md:block"
        data-tour="sidebar"
      >
        <SidebarContent session={session} navItems={navItems} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b p-3 md:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger render={<Button variant="ghost" size="icon" />}>
              <Menu className="h-5 w-5" />
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <SidebarContent
                session={session}
                navItems={navItems}
                onNavigate={() => setMobileOpen(false)}
              />
            </SheetContent>
          </Sheet>
          <span className="font-semibold">Chama Platform</span>
        </header>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
