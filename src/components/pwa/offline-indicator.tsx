"use client";

import { useOffline } from "@/lib/offline";
import { WifiOff, Cloud } from "lucide-react";

export function OfflineIndicator() {
  const { isOnline, pendingMutations } = useOffline();

  if (isOnline && pendingMutations === 0) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm shadow-lg">
      {!isOnline ? (
        <>
          <WifiOff className="h-4 w-4 text-amber-500" />
          <span className="text-amber-600 font-medium">Offline</span>
          {pendingMutations > 0 && (
            <span className="text-xs text-muted-foreground">
              ({pendingMutations} pending)
            </span>
          )}
        </>
      ) : pendingMutations > 0 ? (
        <>
          <Cloud className="h-4 w-4 text-blue-500 animate-pulse" />
          <span className="text-blue-600 font-medium">Syncing {pendingMutations} changes...</span>
        </>
      ) : null}
    </div>
  );
}
