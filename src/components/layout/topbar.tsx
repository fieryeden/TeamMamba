"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell, Search, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useRouter } from "next/navigation";

interface TopBarProps {
  user: { firstName: string; lastName: string };
  workspaces?: Array<{ id: string; name: string }>;
}

export function TopBar({ user, workspaces: initialWorkspaces }: TopBarProps) {
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNewBoard, setShowNewBoard] = useState(false);
  const [boardName, setBoardName] = useState("");
  const [selectedWorkspace, setSelectedWorkspace] = useState("");
  const [workspaces, setWorkspaces] = useState(initialWorkspaces || []);
  const [creating, setCreating] = useState(false);

  // Fetch unread notification count
  const fetchUnread = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.unreadCount || 0);
      }
    } catch {
      // silent fail
    }
  }, []);

  useEffect(() => {
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000); // poll every 30s
    return () => clearInterval(interval);
  }, [fetchUnread]);

  // Fetch workspaces for board creation dropdown
  useEffect(() => {
    if (showNewBoard && workspaces.length === 0) {
      fetch("/api/workspaces")
        .then((r) => r.json())
        .then((data) => {
          if (data.workspaces) {
            setWorkspaces(data.workspaces);
            if (data.workspaces.length > 0 && !selectedWorkspace) {
              setSelectedWorkspace(data.workspaces[0].id);
            }
          }
        })
        .catch(() => {});
    }
  }, [showNewBoard]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateBoard = async () => {
    if (!boardName.trim() || !selectedWorkspace) return;
    setCreating(true);
    try {
      const res = await fetch("/api/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: selectedWorkspace,
          name: boardName.trim(),
          boardKind: "KANBAN",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setShowNewBoard(false);
        setBoardName("");
        router.push(`/board/${data.board.id}`);
      }
    } catch (err) {
      console.error("Failed to create board:", err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <header className="flex h-14 items-center justify-between border-b bg-card px-6">
        <div className="flex items-center gap-4 flex-1">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search boards, items, people..." className="pl-9 bg-muted/50 border-0" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            onClick={() => router.push("/notifications")}
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-mamba-500 text-[8px] font-bold text-white flex items-center justify-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Button>
          <Button
            size="sm"
            className="bg-mamba-600 hover:bg-mamba-700"
            onClick={() => setShowNewBoard(true)}
          >
            <Plus className="mr-1 h-4 w-4" /> New Board
          </Button>
        </div>
      </header>

      {/* New Board Dialog */}
      <Dialog open={showNewBoard} onOpenChange={setShowNewBoard}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Board</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Board Name</label>
              <Input
                placeholder="e.g. Sprint Planning, Bug Tracker..."
                value={boardName}
                onChange={(e) => setBoardName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateBoard()}
                autoFocus
              />
            </div>
            {workspaces.length > 0 && (
              <div className="space-y-1">
                <label className="text-sm font-medium">Workspace</label>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={selectedWorkspace}
                  onChange={(e) => setSelectedWorkspace(e.target.value)}
                >
                  {workspaces.map((ws) => (
                    <option key={ws.id} value={ws.id}>
                      {ws.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {workspaces.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No workspaces found. Create a workspace first.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowNewBoard(false)}>Cancel</Button>
            <Button
              onClick={handleCreateBoard}
              disabled={creating || !boardName.trim() || !selectedWorkspace}
              className="bg-mamba-600 hover:bg-mamba-700"
            >
              {creating ? "Creating..." : "Create Board"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
