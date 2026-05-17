"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  getPushSubscription,
  requestNotificationPermission,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push-notifications";

type PermissionState = NotificationPermission | "unsupported";

export function NotificationPermission({ userId }: { userId: string }) {
  const [permission, setPermission] = useState<PermissionState>("default");
  const [hasSubscription, setHasSubscription] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) {
      setPermission("unsupported");
      return;
    }

    setPermission(Notification.permission);
    getPushSubscription()
      .then((sub) => setHasSubscription(Boolean(sub)))
      .catch(() => setHasSubscription(false));
  }, []);

  const enable = async () => {
    setLoading(true);
    setMessage("");
    try {
      const nextPermission = await requestNotificationPermission();
      setPermission(nextPermission);
      if (nextPermission !== "granted") {
        setMessage("Permission was not granted.");
        return;
      }

      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) {
        setMessage("Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY.");
        return;
      }

      const subscription = await subscribeToPush(key);
      if (!subscription) {
        setMessage("Unable to subscribe to push notifications.");
        return;
      }

      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        setMessage("Invalid push subscription payload.");
        return;
      }

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: {
            p256dh: json.keys.p256dh,
            auth: json.keys.auth,
          },
          userId,
        }),
      });

      if (!res.ok) {
        setMessage("Subscription created locally, but server sync failed.");
        return;
      }

      setHasSubscription(true);
      setMessage("Push notifications enabled.");
    } catch {
      setMessage("Failed to enable notifications.");
    } finally {
      setLoading(false);
    }
  };

  const disable = async () => {
    setLoading(true);
    setMessage("");
    try {
      const ok = await unsubscribeFromPush();
      if (!ok) {
        setMessage("Failed to remove push subscription.");
        return;
      }
      setHasSubscription(false);
      setMessage("Push subscription removed.");
    } catch {
      setMessage("Failed to remove push subscription.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Browser Push Notifications</p>
          <p className="text-xs text-muted-foreground">
            Permission: {permission}{hasSubscription ? " · Subscribed" : " · Not subscribed"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={enable} disabled={loading || permission === "unsupported"}>
            {loading ? "Working..." : "Enable Notifications"}
          </Button>
          {hasSubscription && (
            <Button size="sm" variant="outline" onClick={disable} disabled={loading}>
              Disable
            </Button>
          )}
        </div>
      </div>
      {permission === "unsupported" && (
        <p className="mt-2 text-xs text-muted-foreground">This browser does not support notifications.</p>
      )}
      {message && <p className="mt-2 text-xs text-muted-foreground">{message}</p>}
    </div>
  );
}
