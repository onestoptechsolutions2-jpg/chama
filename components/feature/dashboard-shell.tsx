"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, MoreHorizontal, ChevronsUpDown, LogOut, ShieldCheck, Bell } from "lucide-react";
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

function NotificationBell({ unreadCount }: { unreadCount: number }) {
  return (
    <Link
      href="/dashboard/notifications"
      className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      title="Notifications"
    >
      <Bell className="h-5 w-5" />
      {unreadCount > 0 && (
        <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </Link>
  );
}

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
  unreadNotifications,
  onNavigate,
}: {
  session: Session;
  navItems: NavItem[];
  unreadNotifications: number;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-center justify-between px-1">
        <span className="text-lg font-semibold">Chama Platform</span>
        <NotificationBell unreadCount={unreadNotifications} />
      </div>
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

/** Fixed bottom tab bar (mobile only) — a few essential destinations plus
 * "More" for everything else, so the primary loop never needs the drawer. */
function BottomTabBar({
  navItems,
  onMore,
}: {
  navItems: NavItem[];
  onMore: () => void;
}) {
  const pathname = usePathname();
  const tabs = navItems.filter((i) => i.primary).slice(0, 4);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden">
      <div className="flex" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {tabs.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium"
            >
              <span
                className={`flex size-9 items-center justify-center rounded-full transition-colors ${
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className={active ? "text-foreground" : "text-muted-foreground"}>{item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onMore}
          className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium"
        >
          <span className="flex size-9 items-center justify-center rounded-full text-muted-foreground">
            <MoreHorizontal className="h-5 w-5" />
          </span>
          <span className="text-muted-foreground">More</span>
        </button>
      </div>
    </nav>
  );
}

export function DashboardShell({
  session,
  unreadNotifications = 0,
  children,
}: {
  session: Session;
  unreadNotifications?: number;
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
        <SidebarContent session={session} navItems={navItems} unreadNotifications={unreadNotifications} />
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
                unreadNotifications={unreadNotifications}
                onNavigate={() => setMobileOpen(false)}
              />
            </SheetContent>
          </Sheet>
          <span className="truncate font-semibold">
            {session.activeMembership?.groupName ?? "Chama Platform"}
          </span>
          <span className="ml-auto">
            <NotificationBell unreadCount={unreadNotifications} />
          </span>
        </header>

        <main className="flex-1 p-4 pb-20 md:p-6 md:pb-6">{children}</main>

        <BottomTabBar navItems={navItems} onMore={() => setMobileOpen(true)} />
      </div>
    </div>
  );
}
