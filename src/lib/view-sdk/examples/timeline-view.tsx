"use client";

/**
 * Example custom view plugin — Compact Timeline
 * Demonstrates the Board Views SDK by registering a custom view
 * that shows items in a compact horizontal timeline format.
 */

import { useMemo } from "react";
import { registerView } from "@/lib/view-sdk";
import type { BoardViewProps } from "@/lib/view-sdk";

export function CompactTimelineView({ groups, columns }: BoardViewProps) {
  const allItems = useMemo(() => groups.flatMap(g => g.items.map((i: any) => ({ ...i, groupName: g.name }))), [groups]);
  const dateCol = columns.find((c: any) => c.columnType === "DATE" || c.columnType === "TIMELINE");

  return (
    <div className="space-y-4 p-4">
      <h3 className="text-sm font-medium">Compact Timeline</h3>
      <div className="space-y-1">
        {allItems.slice(0, 20).map((item: any) => (
          <div key={item.id} className="flex items-center gap-3 rounded-md border px-3 py-2 text-xs hover:bg-accent/30">
            <span className="truncate font-medium w-1/3">{item.name}</span>
            <span className="text-muted-foreground w-1/4">{item.groupName}</span>
            {dateCol && (
              <span className="text-muted-foreground">
                {item.columnValues?.find((cv: any) => cv.column?.id === dateCol.id)?.value?.start
                  ? new Date(item.columnValues.find((cv: any) => cv.column?.id === dateCol.id).value.start).toLocaleDateString()
                  : "—"}
              </span>
            )}
          </div>
        ))}
        {allItems.length > 20 && (
          <p className="text-xs text-muted-foreground text-center py-2">+{allItems.length - 20} more items</p>
        )}
      </div>
    </div>
  );
}

// Auto-register this view when the module is imported
if (typeof window !== "undefined") {
  registerView({
    id: "COMPACT_TIMELINE",
    name: "Compact Timeline",
    icon: "📅",
    description: "A compact timeline view showing items horizontally",
    component: CompactTimelineView,
  });
}
