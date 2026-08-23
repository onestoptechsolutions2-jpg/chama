"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Info, CheckCircle2, TriangleAlert, OctagonAlert, CheckCheck } from "lucide-react";
import type { notifications as notificationsTable } from "@/lib/db/schema";
import {
  markNotificationReadAction,
  markAllNotificationsReadAction,
} from "@/app/(dashboard)/dashboard/notifications/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Notification = typeof notificationsTable.$inferSelect;

const CATEGORY_ICON = {
  info: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
  action_required: OctagonAlert,
} as const;

const CATEGORY_COLOR = {
  info: "text-muted-foreground",
  success: "text-emerald-600",
  warning: "text-amber-600",
  action_required: "text-destructive",
} as const;

function NotificationRow({ notification }: { notification: Notification }) {
  const [isPending, startTransition] = useTransition();
  const unread = !notification.readAt;
  const Icon = CATEGORY_ICON[notification.category];

  function markRead() {
    if (unread) startTransition(() => markNotificationReadAction(notification.id));
  }

  const content = (
    <div
      className={`flex gap-3 rounded-lg border p-4 transition-colors ${unread ? "bg-accent/40" : ""} ${notification.link ? "hover:bg-accent/60" : ""}`}
    >
      <Icon className={`mt-0.5 size-4 shrink-0 ${CATEGORY_COLOR[notification.category]}`} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-sm ${unread ? "font-semibold" : "font-medium text-muted-foreground"}`}>
            {notification.title}
          </p>
          {unread && <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" />}
        </div>
        {notification.body && (
          <p className="text-sm text-muted-foreground">{notification.body}</p>
        )}
        <p className="text-xs text-muted-foreground">
          {notification.createdAt.toLocaleString()}
        </p>
      </div>
    </div>
  );

  if (notification.link) {
    return (
      <Link href={notification.link} onClick={markRead} className="block" aria-disabled={isPending}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={markRead} className="block w-full text-left" disabled={!unread || isPending}>
      {content}
    </button>
  );
}

export function NotificationsManager({ notifications }: { notifications: Notification[] }) {
  const [isPending, startTransition] = useTransition();
  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return (
    <div className="space-y-4">
      {unreadCount > 0 && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => startTransition(() => markAllNotificationsReadAction())}
          >
            <CheckCheck className="size-4" />
            Mark all read
          </Button>
        </div>
      )}

      {notifications.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            No notifications yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <NotificationRow key={n.id} notification={n} />
          ))}
        </div>
      )}
    </div>
  );
}
