"use client";

import { useEffect, useState } from "react";
import { Users, Clock, Filter } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

type WorkloadUser = {
  user: { id: string; firstName: string; lastName: string; avatarUrl: string | null; email: string };
  items: { id: string; name: string; boardName: string; status: string | null; timeSpent: number }[];
  totalItems: number;
  totalTimeSeconds: number;
  runningTimers: number;
};

type Board = { id: string; name: string };

export function WorkloadClient() {
  const [workload, setWorkload] = useState<WorkloadUser[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [boardFilter, setBoardFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWorkload();
  }, [boardFilter]);

  const loadWorkload = async () => {
    setLoading(true);
    try {
      const params = boardFilter ? `?boardId=${boardFilter}` : "";
      const res = await fetch(`/api/workload${params}`);
      if (res.ok) {
        const json = await res.json();
        setWorkload(json.workload);
        setBoards(json.boards);
      }
    } catch (err) {
      console.error("Failed to load workload:", err);
    } finally {
      setLoading(false);
    }
  };

  const maxItems = Math.max(...workload.map((w) => w.totalItems), 1);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const STATUS_COLORS: Record<string, string> = {
    Done: "bg-green-500",
    "In Progress": "bg-blue-500",
    Stuck: "bg-red-500",
    "Not Started": "bg-gray-400",
    "Working on it": "bg-yellow-500",
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Loading workload...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Workload</h1>
          <p className="text-muted-foreground">See who's busy and who has capacity</p>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            className="rounded-lg border bg-transparent px-3 py-1.5 text-sm"
            value={boardFilter}
            onChange={(e) => setBoardFilter(e.target.value)}
          >
            <option value="">All Boards</option>
            {boards.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Users className="h-8 w-8 text-mamba-600" />
              <div>
                <p className="text-2xl font-bold">{workload.length}</p>
                <p className="text-sm text-muted-foreground">Team members</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Users className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{workload.reduce((sum, w) => sum + w.totalItems, 0)}</p>
                <p className="text-sm text-muted-foreground">Total assignments</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Clock className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">
                  {formatTime(workload.reduce((sum, w) => sum + w.totalTimeSeconds, 0))}
                </p>
                <p className="text-sm text-muted-foreground">Total time tracked</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Workload bars */}
      <div className="space-y-4">
        {workload.map((wu) => {
          const pct = (wu.totalItems / maxItems) * 100;
          const barColor =
            pct > 80 ? "bg-red-500" : pct > 50 ? "bg-yellow-500" : "bg-green-500";

          return (
            <Card key={wu.user.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-mamba-100 text-mamba-700 font-bold text-sm">
                      {wu.user.firstName[0]}{wu.user.lastName[0]}
                    </div>
                    <div>
                      <CardTitle className="text-base">
                        {wu.user.firstName} {wu.user.lastName}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">{wu.user.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-muted-foreground">
                      {wu.totalItems} item{wu.totalItems !== 1 ? "s" : ""}
                    </span>
                    <span className="text-muted-foreground">
                      {formatTime(wu.totalTimeSeconds)}
                    </span>
                    {wu.runningTimers > 0 && (
                      <Badge variant="secondary" className="bg-green-100 text-green-700">
                        {wu.runningTimers} active
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <div className="h-3 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${barColor}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                    <span>Capacity</span>
                    <span>{Math.round(pct)}%</span>
                  </div>
                </div>

                {/* Assigned items */}
                <div className="space-y-1.5">
                  {wu.items.slice(0, 10).map((item) => (
                    <div key={item.id} className="flex items-center gap-2 text-sm">
                      <div
                        className={`h-2 w-2 rounded-full ${
                          STATUS_COLORS[item.status ?? ""] ?? "bg-gray-300"
                        }`}
                      />
                      <span className="flex-1 truncate">{item.name}</span>
                      <span className="text-xs text-muted-foreground">{item.boardName}</span>
                      {item.timeSpent > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {formatTime(item.timeSpent)}
                        </span>
                      )}
                    </div>
                  ))}
                  {wu.items.length > 10 && (
                    <p className="text-xs text-muted-foreground pl-4">
                      +{wu.items.length - 10} more
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {workload.length === 0 && (
        <div className="flex h-48 items-center justify-center text-muted-foreground">
          No team members found. Add members to your boards to see workload data.
        </div>
      )}
    </div>
  );
}
