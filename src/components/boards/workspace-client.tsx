"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Edit2, Plus, FolderKanban, MoreHorizontal, Trash2, ChevronDown, ChevronRight, Palette,
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
import { BroadcastModal } from "@/components/boards/broadcast-modal";
import { WorkspaceGovernance } from "@/components/boards/workspace-governance";

interface WorkspaceClientProps {
  workspace: {
    id: string; name: string; description: string | null; icon: string | null; color: string | null; logoUrl: string | null; customDomain: string | null;
    owner: { id: string; firstName: string; lastName: string; avatarUrl: string | null };
    members: Array<{ user: { id: string; firstName: string; lastName: string; avatarUrl: string | null } }>;
    boards: Array<{ id: string; name: string; boardKind: string; color: string | null; _count: { items: number } }>;
  };
}

export function WorkspaceClient({ workspace }: WorkspaceClientProps) {
  const [workspaceName, setWorkspaceName] = useState(workspace.name);
  const [workspaceDescription, setWorkspaceDescription] = useState(workspace.description ?? "");
  const [workspaceColor, setWorkspaceColor] = useState(workspace.color ?? "#579bfc");
  const [editingWorkspaceName, setEditingWorkspaceName] = useState(false);
  const [boards, setBoards] = useState(workspace.boards);
  const [showNewBoard, setShowNewBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [newBoardKind, setNewBoardKind] = useState("KANBAN");
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [workspaceLogoUrl, setWorkspaceLogoUrl] = useState(workspace.logoUrl ?? "");
  const [workspaceCustomDomain, setWorkspaceCustomDomain] = useState(workspace.customDomain ?? "");
  const [brandingCollapsed, setBrandingCollapsed] = useState(true);
  const [governanceCollapsed, setGovernanceCollapsed] = useState(true);

  const patchWorkspace = async (patch: { name?: string; description?: string; color?: string; logoUrl?: string | null; customDomain?: string | null }) => {
    const res = await fetch(`/api/workspaces/${workspace.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    return res.ok;
  };

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
        <div className="space-y-2 rounded-lg border-l-4 px-3 py-2" style={{ borderLeftColor: workspaceColor }}>
          {editingWorkspaceName ? (
            <Input
              className="h-9 w-[320px] text-2xl font-bold"
              value={workspaceName}
              autoFocus
              onChange={(event) => setWorkspaceName(event.target.value)}
              onBlur={async () => {
                const nextName = workspaceName.trim();
                if (!nextName) {
                  setWorkspaceName(workspace.name);
                  setEditingWorkspaceName(false);
                  return;
                }
                const ok = await patchWorkspace({ name: nextName });
                if (!ok) setWorkspaceName(workspace.name);
                setEditingWorkspaceName(false);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.currentTarget.blur();
              }}
            />
          ) : (
            <h1 className="text-2xl font-bold flex items-center gap-2" onDoubleClick={() => setEditingWorkspaceName(true)}>
            {workspace.icon && <span>{workspace.icon}</span>}
            {workspaceName}
            <button
              type="button"
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => setEditingWorkspaceName(true)}
              aria-label="Rename workspace"
            >
              <Edit2 className="h-4 w-4" />
            </button>
            <span className="relative" title="Change workspace color">
              <input
                type="color"
                value={workspaceColor}
                onChange={(e) => {
                  const next = e.target.value;
                  setWorkspaceColor(next);
                  patchWorkspace({ color: next });
                }}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
              <span className="block h-4 w-4 rounded-full border" style={{ backgroundColor: workspaceColor }} />
            </span>
          </h1>
          )}
          <Input
            className="h-8 max-w-lg text-sm"
            value={workspaceDescription}
            placeholder="Workspace description"
            onChange={(event) => setWorkspaceDescription(event.target.value)}
            onBlur={() => {
              patchWorkspace({ description: workspaceDescription.trim() || "" }).catch(() => {});
            }}
          />
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
          <Button variant="outline" onClick={() => setShowBroadcast(true)}>
            📢 Announcement
          </Button>
        </div>
      </div>

      {/* Workspace Branding */}
      <div className="rounded-lg border p-4 space-y-3">
        <button
          type="button"
          className="flex w-full items-center justify-between text-sm font-medium"
          onClick={() => setBrandingCollapsed((v) => !v)}
        >
          Workspace Branding
          {brandingCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {!brandingCollapsed && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Logo URL</label>
              <Input
                className="h-8 text-xs"
                placeholder="https://example.com/logo.png"
                value={workspaceLogoUrl}
                onChange={(e) => setWorkspaceLogoUrl(e.target.value)}
                onBlur={async () => {
                  await patchWorkspace({ logoUrl: workspaceLogoUrl.trim() || null });
                }}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Custom Domain</label>
              <Input
                className="h-8 text-xs"
                placeholder="boards.yourcompany.com"
                value={workspaceCustomDomain}
                onChange={(e) => setWorkspaceCustomDomain(e.target.value)}
                onBlur={async () => {
                  await patchWorkspace({ customDomain: workspaceCustomDomain.trim().toLowerCase() || null });
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Data Governance */}
      <div className="rounded-lg border p-4 space-y-3">
        <button
          type="button"
          className="flex w-full items-center justify-between text-sm font-medium"
          onClick={() => setGovernanceCollapsed((v) => !v)}
        >
          Data Governance
          {governanceCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {!governanceCollapsed && (
          <div className="mt-3">
            <WorkspaceGovernance workspaceId={workspace.id} />
          </div>
        )}
      </div>

      {/* Boards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {boards.map((board) => (
          <Link key={board.id} href={`/board/${board.id}`}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer group border-l-4" style={{ borderLeftColor: board.color ?? workspaceColor }}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <span className="relative shrink-0" title="Change board color">
                      <input
                        type="color"
                        value={board.color ?? workspaceColor}
                        onChange={(e) => {
                          const next = e.target.value;
                          fetch(`/api/boards/${board.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ color: next }),
                          }).then((res) => {
                            if (res.ok) setBoards((prev) => prev.map((b) => b.id === board.id ? { ...b, color: next } : b));
                          });
                        }}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      />
                      <span className="block h-3.5 w-3.5 rounded-full border" style={{ backgroundColor: board.color ?? workspaceColor }} />
                    </span>
                    <CardTitle className="text-base truncate flex-1 min-w-0">
                      {board.name}
                    </CardTitle>
                    <button
                      type="button"
                      className="shrink-0 rounded p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-accent hover:text-foreground transition-opacity"
                      title="Rename board"
                      onClick={async () => {
                        const newName = prompt("Rename board", board.name);
                        if (!newName || !newName.trim() || newName.trim() === board.name) return;
                        const res = await fetch(`/api/boards/${board.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ name: newName.trim() }),
                        });
                        if (res.ok) {
                          setBoards((prev) => prev.map((b) => b.id === board.id ? { ...b, name: newName.trim() } : b));
                        }
                      }}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreHorizontal className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => {
                        const color = prompt("Board color (hex)", board.color ?? workspaceColor);
                        if (!color) return;
                        fetch(`/api/boards/${board.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ color }),
                        }).then((res) => {
                          if (res.ok) setBoards((prev) => prev.map((b) => b.id === board.id ? { ...b, color } : b));
                        });
                      }}>
                        <Palette className="h-3 w-3 mr-2" /> Change Color
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onSelect={async () => {
                        if (!confirm(`Delete "${board.name}"?`)) return;
                        const res = await fetch(`/api/boards/${board.id}`, { method: "DELETE" });
                        if (res.ok) setBoards((prev) => prev.filter((b) => b.id !== board.id));
                      }}>
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
      {showBroadcast && (
        <BroadcastModal workspaceId={workspace.id} onClose={() => setShowBroadcast(false)} />
      )}
    </div>
  );
}
