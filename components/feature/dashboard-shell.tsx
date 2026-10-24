"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, ChevronsUpDown, LogOut, ShieldCheck, Bell } from "lucide-react";
import { getVisibleNavItems, navSections, type NavItem } from "@/lib/nav-config";
import type { Session } from "@/lib/auth/session";
import { switchGroupAction } from "@/app/(dashboard)/actions";
import { logoutAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function NotificationBell({ unread }: { unread: number }) {
  return (
    <Link
      href="/dashboard/notifications"
      title="Notifications"
      className="relative inline-flex size-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <Bell className="size-5" />
      {unread > 0 && (
        <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const active = usePathname() === item.href;
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-base font-medium ${
        active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
      }`}
    >
      <Icon className="size-5" />
      {item.label}
    </Link>
  );
}

function GroupSwitcher({ session }: { session: Session }) {
  const [pending, startTransition] = useTransition();
  if (session.memberships.length < 2) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" className="w-full justify-between" disabled={pending} />}
      >
        <span className="truncate">{session.activeMembership?.groupName ?? "Choose a group"}</span>
        <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {session.memberships.map((m) => (
          <DropdownMenuItem
            key={m.groupId}
            onClick={() => startTransition(() => void switchGroupAction(m.groupId))}
          >
            {m.groupName}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Sidebar({
  session,
  items,
  unread,
  onNavigate,
}: {
  session: Session;
  items: NavItem[];
  unread: number;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <span className="text-lg font-semibold">{session.activeMembership?.groupName ?? "Chama"}</span>
        <NotificationBell unread={unread} />
      </div>
      <GroupSwitcher session={session} />

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {navSections.map((section) => {
          const group = items.filter((i) => i.section === section.id);
          if (group.length === 0) return null;
          return (
            <div key={section.id} className="mb-3">
              <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
                {section.label}
              </p>
              {group.map((i) => (
                <NavLink key={i.href} item={i} onNavigate={onNavigate} />
              ))}
            </div>
          );
        })}
        {session.user.platformRole && (
          <Link
            href="/super-admin/groups"
            onClick={onNavigate}
            className="mt-2 flex min-h-12 items-center gap-3 rounded-xl px-3 text-base text-muted-foreground hover:bg-muted"
          >
            <ShieldCheck className="size-5" />
            Super Admin
          </Link>
        )}
      </nav>

      <div className="flex items-center gap-3 rounded-md border p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{session.user.name}</p>
          <p className="truncate text-xs capitalize text-muted-foreground">
            {session.activeMembership?.role ?? "no group"}
          </p>
        </div>
        <form action={logoutAction}>
          <Button type="submit" variant="ghost" size="icon" title="Log out">
            <LogOut className="size-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}

/** Hrefs offered in the phone's bottom bar, in priority order; the first four
 * this user can actually see are shown, then a Menu button for everything else. */
const BOTTOM_BAR = [
  "/dashboard",
  "/dashboard/collect",
  "/dashboard/members",
  "/dashboard/loans",
  "/dashboard/loans/apply",
  "/dashboard/statement",
  "/dashboard/welfare",
  "/dashboard/mgr",
];

function BottomBar({ items, onMenu }: { items: NavItem[]; onMenu: () => void }) {
  const pathname = usePathname();
  const tabs = BOTTOM_BAR.map((href) => items.find((i) => i.href === href))
    .filter((i): i is NavItem => !!i)
    .slice(0, 4);
  const base = "flex flex-1 flex-col items-center gap-1 py-2 text-xs font-medium";

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-card md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {tabs.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`${base} ${active ? "text-primary" : "text-muted-foreground"}`}
          >
            <Icon className="size-6" />
            {item.shortLabel ?? item.label}
          </Link>
        );
      })}
      <button type="button" onClick={onMenu} className={`${base} text-muted-foreground`}>
        <Menu className="size-6" />
        Menu
      </button>
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
  const [open, setOpen] = useState(false);
  const items = getVisibleNavItems(
    session.activeMembership
      ? { role: session.activeMembership.role, products: session.activeMembership.products }
      : null,
  );

  return (
    <div className="tailadmin flex min-h-screen bg-background">
      <aside className="hidden w-[290px] shrink-0 border-r bg-card md:block">
        <Sidebar session={session} items={items} unread={unreadNotifications} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b bg-card p-3 md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger render={<Button variant="ghost" size="icon" title="Menu" />}>
              <Menu className="size-5" />
            </SheetTrigger>
            <SheetContent side="left" className="w-[290px] p-0">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <Sidebar
                session={session}
                items={items}
                unread={unreadNotifications}
                onNavigate={() => setOpen(false)}
              />
            </SheetContent>
          </Sheet>
          <span className="truncate font-semibold">
            {session.activeMembership?.groupName ?? "Chama"}
          </span>
          <span className="ml-auto">
            <NotificationBell unread={unreadNotifications} />
          </span>
        </header>

        <main className="flex-1 p-4 pb-24 md:p-6 md:pb-6">{children}</main>

        <BottomBar items={items} onMenu={() => setOpen(true)} />
      </div>
    </div>
  );
}
