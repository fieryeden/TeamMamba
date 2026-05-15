"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ScrollText, Filter, User, Clock, ArrowDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type AuditLog = {
  id: string;
  action: string;
  createdAt: string;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  user: { id: string; firstName: string; lastName: string; avatarUrl: string | null; email: string };
  board: { id: string; name: string } | null;
};

interface AuditLogViewerProps {
  boardId?: string;
  workspaceId?: string;
}

const ACTION_COLORS: Record<string, string> = {
  BOARD_CREATED: "bg-green-100 text-green-700",
  BOARD_UPDATED: "bg-blue-100 text-blue-700",
  BOARD_DELETED: "bg-red-100 text-red-700",
  ITEM_CREATED: "bg-green-100 text-green-700",
  ITEM_UPDATED: "bg-yellow-100 text-yellow-700",
  ITEM_DELETED: "bg-red-100 text-red-700",
  ITEM_MOVED_TO_BOARD: "bg-purple-100 text-purple-700",
  COLUMN_VALUE_CHANGED: "bg-yellow-100 text-yellow-700",
  COMMENT_CREATED: "bg-blue-100 text-blue-700",
  DOC_CREATED: "bg-green-100 text-green-700",
  DOC_UPDATED: "bg-yellow-100 text-yellow-700",
  DOC_DELETED: "bg-red-100 text-red-700",
  MILESTONE_CREATED: "bg-green-100 text-green-700",
  WEBHOOK_CREATED: "bg-purple-100 text-purple-700",
  MEMBER_ADDED: "bg-blue-100 text-blue-700",
  MEMBER_REMOVED: "bg-red-100 text-red-700",
};

export function AuditLogViewer({ boardId, workspaceId }: AuditLogViewerProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const loadLogs = useCallback(async (cursor?: string) => {
    try {
      const params = new URLSearchParams();
      if (boardId) params.set("boardId", boardId);
      if (workspaceId) params.set("workspaceId", workspaceId);
      if (actionFilter) params.set("action", actionFilter);
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(`/api/audit-logs?${params}`);
      if (res.ok) {
        const json = await res.json();
        if (cursor) {
          setLogs((prev) => [...prev, ...json.logs]);
        } else {
          setLogs(json.logs);
        }
        setNextCursor(json.nextCursor);
      }
    } catch (err) {
      console.error("Load audit logs error:", err);
    } finally {
      setLoading(false);
    }
  }, [boardId, workspaceId, actionFilter]);

  useEffect(() => {
    setLoading(true);
    loadLogs();
  }, [loadLogs]);

  const loadMore = () => {
    if (nextCursor) loadLogs(nextCursor);
  };

  const ACTIONS = [
    "BOARD_CREATED", "BOARD_UPDATED", "BOARD_DELETED",
    "ITEM_CREATED", "ITEM_UPDATED", "ITEM_DELETED", "ITEM_MOVED_TO_BOARD",
    "COLUMN_VALUE_CHANGED", "COMMENT_CREATED",
    "DOC_CREATED", "DOC_UPDATED", "DOC_DELETED",
    "MILESTONE_CREATED", "WEBHOOK_CREATED",
    "MEMBER_ADDED", "MEMBER_REMOVED",
  ];

  return (
    <div className="space-y-4" ref={containerRef}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-mamba-600" /> Audit Log
        </h3>
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <select
            className="rounded-lg border bg-transparent px-2 py-1 text-xs"
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setLoading(true); }}
          >
            <option value="">All actions</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
      </div>

      {loading && logs.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">Loading...</p>
      ) : logs.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">No audit logs found.</p>
      ) : (
        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {logs.map((log) => (
            <div
              key={log.id}
              className="flex items-start gap-3 rounded-lg border p-2.5 text-sm"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                {log.user.firstName[0]}{log.user.lastName[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">
                    {log.user.firstName} {log.user.lastName}
                  </span>
                  <Badge
                    variant="secondary"
                    className={`text-[10px] font-mono ${ACTION_COLORS[log.action] ?? ""}`}
                  >
                    {log.action}
                  </Badge>
                  {log.board && (
                    <span className="text-xs text-muted-foreground">
                      on {log.board.name}
                    </span>
                  )}
                </div>
                {log.details && Object.keys(log.details).length > 0 && (
                  <p className="mt-0.5 text-xs text-muted-foreground truncate">
                    {JSON.stringify(log.details).substring(0, 120)}
                  </p>
                )}
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {new Date(log.createdAt).toLocaleString()}
                  {log.ipAddress && (
                    <>
                      <span>·</span>
                      <span>{log.ipAddress}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}

          {nextCursor && (
            <div className="py-2 text-center">
              <Button variant="ghost" size="sm" onClick={loadMore}>
                <ArrowDown className="mr-1 h-3.5 w-3.5" /> Load more
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
