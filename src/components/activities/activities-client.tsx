"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Activity as ActivityIcon, Filter } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatRelativeTime } from "@/lib/utils";

type Activity = {
  id: string;
  action: string;
  details: unknown;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string; avatarUrl: string | null };
  board: { id: string; name: string };
  item: { id: string; name: string } | null;
};

const ACTION_OPTIONS = [
  "ITEM_CREATED",
  "ITEM_UPDATED",
  "ITEM_DELETED",
  "ITEM_MOVED",
  "STATUS_CHANGED",
  "ASSIGNEE_ADDED",
  "ASSIGNEE_REMOVED",
  "COMMENT_ADDED",
  "COLUMN_VALUE_CHANGED",
  "GROUP_CREATED",
  "GROUP_DELETED",
  "BOARD_CREATED",
  "BOARD_UPDATED",
  "AUTOMATION_TRIGGERED",
  "ITEM_MOVED_TO_BOARD",
];

function actionLabel(action: string) {
  return action.replace(/_/g, " ").toLowerCase();
}

function toDescription(activity: Activity) {
  const userName = `${activity.user.firstName} ${activity.user.lastName}`;
  const itemName = activity.item?.name ? ` "${activity.item.name}"` : "";
  return `${userName} ${actionLabel(activity.action)}${itemName}`;
}

export function ActivitiesClient({
  initialActivities,
  boards,
  initialTake,
}: {
  initialActivities: Activity[];
  boards: Array<{ id: string; name: string }>;
  initialTake: number;
}) {
  const [activities, setActivities] = useState<Activity[]>(initialActivities);
  const [boardFilter, setBoardFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(initialActivities.length >= initialTake);

  const filteredBoardId = boardFilter === "all" ? "" : boardFilter;
  const filteredAction = typeFilter === "all" ? "" : typeFilter;

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ take: String(initialTake) });
    if (filteredBoardId) params.set("boardId", filteredBoardId);
    if (filteredAction) params.set("action", filteredAction);
    return params.toString();
  }, [filteredBoardId, filteredAction, initialTake]);

  const loadFiltered = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/activities?${queryString}`);
      if (!res.ok) return;
      const json = await res.json();
      setActivities((json.activities ?? []) as Activity[]);
      setHasMore((json.activities ?? []).length >= initialTake);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({
        take: String(initialTake),
        skip: String(activities.length),
      });
      if (filteredBoardId) params.set("boardId", filteredBoardId);
      if (filteredAction) params.set("action", filteredAction);

      const res = await fetch(`/api/activities?${params.toString()}`);
      if (!res.ok) return;
      const json = await res.json();
      const next = (json.activities ?? []) as Activity[];
      setActivities((prev) => [...prev, ...next]);
      setHasMore(next.length >= initialTake);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ActivityIcon className="h-6 w-6" /> Activity
          </h1>
          <p className="text-muted-foreground text-sm">Live updates across your boards</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={boardFilter} onValueChange={setBoardFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All boards" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All boards</SelectItem>
              {boards.map((board) => (
                <SelectItem key={board.id} value={board.id}>{board.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[190px]">
              <SelectValue placeholder="All activity types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All activity types</SelectItem>
              {ACTION_OPTIONS.map((action) => (
                <SelectItem key={action} value={action}>{actionLabel(action)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={loadFiltered} disabled={loading}>
            <Filter className="mr-1 h-4 w-4" /> {loading ? "Filtering..." : "Apply"}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {activities.map((activity) => {
          const initials = `${activity.user.firstName[0] ?? ""}${activity.user.lastName[0] ?? ""}`;
          return (
            <Card key={activity.id}>
              <CardContent className="flex items-start gap-3 py-3 px-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-mamba-100 text-xs font-bold text-mamba-700">
                  {initials}
                </div>
                <div className="flex-1 min-w-0 text-sm">
                  <p>
                    {toDescription(activity)} in{" "}
                    <Link href={`/board/${activity.board.id}`} className="font-medium hover:underline">
                      {activity.board.name}
                    </Link>
                    {activity.item && (
                      <>
                        {" · "}
                        <Link href={`/board/${activity.board.id}?item=${activity.item.id}`} className="text-mamba-700 hover:underline">
                          {activity.item.name}
                        </Link>
                      </>
                    )}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatRelativeTime(activity.createdAt)}
                </span>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {activities.length === 0 && (
        <div className="py-12 text-center text-sm text-muted-foreground">No activity yet.</div>
      )}

      {hasMore && activities.length > 0 && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading..." : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
