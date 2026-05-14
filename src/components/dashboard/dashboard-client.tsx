"use client";

import Link from "next/link";
import { useState } from "react";
import {
  FolderKanban, Plus, TrendingUp, Users, Activity, ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatRelativeTime } from "@/lib/utils";

interface DashboardClientProps {
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatarUrl: string | null;
    onboardingCompleted?: boolean;
  };
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
  const [showOnboarding, setShowOnboarding] = useState(!user.onboardingCompleted);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const steps = [
    { title: "Create your first board", description: "Use the New Board button to kick off work." },
    { title: "Invite teammates", description: "Add people in Team or Workspace members." },
    { title: "Set up automations", description: "Open Automations to automate repetitive work." },
    { title: "Track progress", description: "Use Timeline/Calendar/Kanban views to stay on track." },
  ];

  const totalItems = workspaces.reduce(
    (sum, ws) => sum + ws.boards.reduce((s, b) => s + b._count.items, 0), 0
  );
  const totalBoards = workspaces.reduce((sum, ws) => sum + ws.boards.length, 0);

  const completeOnboarding = async () => {
    try {
      await fetch("/api/auth", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboardingCompleted: true }),
      });
    } catch {
      // ignore
    } finally {
      setShowOnboarding(false);
    }
  };

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
                <Link href={`/workspace/${ws.id}`}>
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
                    href={`/board/${board.id}`}
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
        <Link href="/workspaces">
          <Card className="border-dashed cursor-pointer hover:border-mamba-400 transition-colors">
            <CardContent className="flex flex-col items-center justify-center py-8">
              <Plus className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm font-medium text-muted-foreground">Create Workspace</p>
            </CardContent>
          </Card>
        </Link>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Getting Started Checklist</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {steps.map((step, index) => (
            <div key={step.title} className="flex items-center justify-between rounded-md border px-3 py-2">
              <div>
                <p className="text-sm font-medium">{step.title}</p>
                <p className="text-xs text-muted-foreground">{step.description}</p>
              </div>
              <span className="text-xs text-muted-foreground">
                {user.onboardingCompleted ? "Done" : onboardingStep > index ? "Done" : "Pending"}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={showOnboarding} onOpenChange={setShowOnboarding}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Welcome to TeamMamba</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm font-semibold">{steps[onboardingStep].title}</p>
            <p className="text-sm text-muted-foreground">{steps[onboardingStep].description}</p>
            <p className="text-xs text-muted-foreground">
              Step {onboardingStep + 1} of {steps.length}
            </p>
          </div>
          <DialogFooter>
            {onboardingStep > 0 && (
              <Button variant="ghost" onClick={() => setOnboardingStep((prev) => Math.max(0, prev - 1))}>
                Back
              </Button>
            )}
            {onboardingStep < steps.length - 1 ? (
              <Button className="bg-mamba-600 hover:bg-mamba-700" onClick={() => setOnboardingStep((prev) => prev + 1)}>
                Next
              </Button>
            ) : (
              <Button className="bg-mamba-600 hover:bg-mamba-700" onClick={completeOnboarding}>
                Finish
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
