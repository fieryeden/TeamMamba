"use client";

import Link from "next/link";
import { useState } from "react";
import {
  FolderKanban, Plus, TrendingUp, Users, Activity, ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn, formatRelativeTime } from "@/lib/utils";

interface DashboardClientProps {
  user: { id: string; firstName: string; lastName: string; email: string; avatarUrl: string | null };
  workspaces: Array<{
    id: string; name: string; description: string | null; icon: string | null;
    boards: Array<{ id: string; name: string; boardKind: string; _count: { items: number } }>;
    _count: { members: number };
  }>;
  recentActivities: Array<{
    id: string; action: string; details: unknown; createdAt: string;
    user: { id: string; firstName: string; lastName: string; avatarUrl: string | null };
    board: { id: string; name: string };
  }>;
}

export function DashboardClient({ user, workspaces, recentActivities }: DashboardClientProps) {
  const [showNewWorkspace, setShowNewWorkspace] = useState(false);

  const totalItems = workspaces.reduce(
    (sum, ws) => sum + ws.boards.reduce((s, b) => s + b._count.items, 0), 0
  );
  const totalBoards = workspaces.reduce((sum, ws) => sum + ws.boards.length, 0);

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold">Welcome back, {user.firstName} 👋</h1>
        <p className="text-muted-foreground">Here&apos;s what&apos;s happening across your workspaces.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-mamba-50 text-mamba-600">
                <FolderKanban className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalBoards}</p>
                <p className="text-xs text-muted-foreground">Total Boards</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <Activity className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalItems}</p>
                <p className="text-xs text-muted-foreground">Total Items</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{workspaces.reduce((s, ws) => s + ws._count.members, 0)}</p>
                <p className="text-xs text-muted-foreground">Team Members</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{workspaces.length}</p>
                <p className="text-xs text-muted-foreground">Workspaces</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Workspaces */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {workspaces.map((ws) => (
          <Card key={ws.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  {ws.icon && <span>{ws.icon}</span>}
                  {ws.name}
                </CardTitle>
                <Link href={`/dashboard/workspace/${ws.id}`}>
                  <Button variant="ghost" size="sm">
                    Open <ChevronRight className="ml-1 h-3 w-3" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {ws.boards.slice(0, 5).map((board) => (
                  <Link
                    key={board.id}
                    href={`/dashboard/board/${board.id}`}
                    className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <FolderKanban className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{board.name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{board._count.items} items</span>
                  </Link>
                ))}
                {ws.boards.length === 0 && (
                  <p className="py-4 text-center text-sm text-muted-foreground">No boards yet</p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}

        {/* New workspace card */}
        <Card className="border-dashed cursor-pointer hover:border-mamba-400 transition-colors" onClick={() => setShowNewWorkspace(true)}>
          <CardContent className="flex flex-col items-center justify-center py-8">
            <Plus className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm font-medium text-muted-foreground">Create Workspace</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentActivities.slice(0, 10).map((activity) => (
              <div key={activity.id} className="flex items-center gap-3 text-sm">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-bold">
                  {activity.user.firstName[0]}{activity.user.lastName[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="font-medium">{activity.user.firstName} {activity.user.lastName}</span>
                  {" "}
                  <span className="text-muted-foreground">
                    {activity.action.replace(/_/g, " ").toLowerCase()}
                  </span>
                  {" "}
                  <span className="font-medium">{activity.board.name}</span>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatRelativeTime(activity.createdAt)}
                </span>
              </div>
            ))}
            {recentActivities.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">No recent activity</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
