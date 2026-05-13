"use client";

import { useState } from "react";
import { Bell, Check, CheckCheck, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, formatRelativeTime } from "@/lib/utils";

interface Notification {
  id: string; title: string; body: string | null; type: string;
  isRead: boolean; actionUrl: string | null; createdAt: string;
}

export function NotificationsClient({ notifications: initial }: { notifications: Notification[] }) {
  const [notifications, setNotifications] = useState(initial);

  const markAllRead = async () => {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAllRead: true }),
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const markRead = async (id: string) => {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isRead: true }),
    });
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
  };

  const unread = notifications.filter((n) => !n.isRead).length;

  const typeIcons: Record<string, string> = {
    ASSIGNMENT: "👤",
    MENTION: "💬",
    STATUS_CHANGE: "🔄",
    DUE_DATE: "📅",
    AUTOMATION: "⚡",
    SYSTEM: "🔔",
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="h-6 w-6" /> Notifications
            {unread > 0 && (
              <Badge className="bg-mamba-600">{unread}</Badge>
            )}
          </h1>
          <p className="text-muted-foreground text-sm">Stay up to date with your team</p>
        </div>
        {unread > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead}>
            <CheckCheck className="h-3 w-3 mr-1" /> Mark all read
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {notifications.map((n) => (
          <Card
            key={n.id}
            className={cn(
              "cursor-pointer transition-colors hover:bg-accent/50",
              !n.isRead && "border-l-4 border-l-mamba-500 bg-mamba-50/50"
            )}
            onClick={() => { if (!n.isRead) markRead(n.id); }}
          >
            <CardContent className="flex items-start gap-3 py-3 px-4">
              <span className="text-lg">{typeIcons[n.type] || "🔔"}</span>
              <div className="flex-1 min-w-0">
                <p className={cn("text-sm", !n.isRead && "font-semibold")}>{n.title}</p>
                {n.body && <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-[10px] text-muted-foreground">{formatRelativeTime(n.createdAt)}</span>
                {n.actionUrl && (
                  <a href={n.actionUrl} className="text-muted-foreground hover:text-foreground">
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {notifications.length === 0 && (
          <div className="py-12 text-center text-muted-foreground">
            <Bell className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p>No notifications yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
