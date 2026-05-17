"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Plus, FolderKanban, MoreHorizontal, Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

interface WorkspaceClientProps {
  workspace: {
    id: string; name: string; description: string | null; icon: string | null;
    owner: { id: string; firstName: string; lastName: string; avatarUrl: string | null };
    members: Array<{ user: { id: string; firstName: string; lastName: string; avatarUrl: string | null } }>;
    boards: Array<{ id: string; name: string; boardKind: string; _count: { items: number } }>;
  };
}

export function WorkspaceClient({ workspace }: WorkspaceClientProps) {
  const [boards, setBoards] = useState(workspace.boards);
  const [showNewBoard, setShowNewBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [newBoardKind, setNewBoardKind] = useState("KANBAN");

  const handleCreateBoard = async () => {
    if (!newBoardName.trim()) return;
    try {
      const res = await fetch("/api/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: workspace.id,
          name: newBoardName,
          boardKind: newBoardKind,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setBoards((prev) => [...prev, data.board]);
        setNewBoardName("");
        setShowNewBoard(false);
      }
    } catch (err) {
      console.error("Failed to create board:", err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Workspace Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            {workspace.icon && <span>{workspace.icon}</span>}
            {workspace.name}
          </h1>
          {workspace.description && (
            <p className="text-muted-foreground mt-1">{workspace.description}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* Members */}
          <div className="flex -space-x-2">
            {workspace.members.slice(0, 5).map((m) => (
              <Avatar key={m.user.id} className="h-8 w-8 border-2 border-background">
                <AvatarFallback className="text-[10px]">
                  {m.user.firstName[0]}{m.user.lastName[0]}
                </AvatarFallback>
              </Avatar>
            ))}
            {workspace.members.length > 5 && (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
                +{workspace.members.length - 5}
              </div>
            )}
          </div>
          <Button onClick={() => setShowNewBoard(true)} className="bg-mamba-600 hover:bg-mamba-700">
            <Plus className="mr-1 h-4 w-4" /> New Board
          </Button>
        </div>
      </div>

      {/* Boards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {boards.map((board) => (
          <Link key={board.id} href={`/board/${board.id}`}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer group">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FolderKanban className="h-4 w-4 text-mamba-500" />
                    {board.name}
                  </CardTitle>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreHorizontal className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem className="text-destructive">
                        <Trash2 className="h-3 w-3 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{board._count.items} items</p>
                <div className="mt-2 flex items-center gap-1">
                  <span className="text-[10px] rounded-full bg-muted px-2 py-0.5 font-medium">
                    {board.boardKind}
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}

        {/* Add Board */}
        <Card
          className="border-dashed cursor-pointer hover:border-mamba-400 transition-colors"
          onClick={() => setShowNewBoard(true)}
        >
          <CardContent className="flex flex-col items-center justify-center py-8">
            <Plus className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm font-medium text-muted-foreground">Add Board</p>
          </CardContent>
        </Card>
      </div>

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
                placeholder="e.g. Sprint Planning, Product Roadmap..."
                value={newBoardName}
                onChange={(e) => setNewBoardName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateBoard()}
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Board Type</label>
              <div className="grid grid-cols-4 gap-2">
                {["KANBAN", "TABLE", "TIMELINE", "GANTT"].map((kind) => (
                  <button
                    key={kind}
                    className={`rounded-lg border p-3 text-xs font-medium transition-colors ${
                      newBoardKind === kind
                        ? "border-mamba-500 bg-mamba-50 text-mamba-700"
                        : "hover:bg-accent"
                    }`}
                    onClick={() => setNewBoardKind(kind)}
                  >
                    {kind === "KANBAN" && "📋"}{kind === "TABLE" && "📊"}{kind === "TIMELINE" && "📅"}{kind === "GANTT" && "🗂️"}
                    <br />{kind.charAt(0) + kind.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowNewBoard(false)}>Cancel</Button>
            <Button onClick={handleCreateBoard} className="bg-mamba-600 hover:bg-mamba-700">Create Board</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
