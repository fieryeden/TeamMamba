"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Edit2, FolderKanban, MoreHorizontal, Plus, Trash2, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

interface Workspace {
  id: string; name: string; description: string | null; icon: string | null; color: string | null;
  owner: { id: string; firstName: string; lastName: string };
  boards: Array<{ id: string; name: string; boardKind: string; _count: { items: number } }>;
  _count: { boards: number; members: number };
}

export function WorkspacesClient({ workspaces: initial }: { workspaces: Workspace[] }) {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState(initial);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#579bfc");
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingDescription, setEditingDescription] = useState("");
  const [editingColor, setEditingColor] = useState("#579bfc");

  const handleCreate = async () => {
    if (!name.trim()) return;
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: description || undefined, color }),
      });
      const data = await res.json();
      if (res.ok) {
        setWorkspaces((prev) => [
          ...prev,
          { ...data.workspace, color: data.workspace.color ?? color, boards: [], _count: { boards: 0, members: 1 } },
        ]);
        setName("");
        setDescription("");
        setColor("#579bfc");
        setShowNew(false);
      }
    } catch (err) {
      console.error("Failed to create workspace:", err);
    }
  };

  const openEditWorkspace = (workspace: Workspace) => {
    setEditingWorkspaceId(workspace.id);
    setEditingName(workspace.name);
    setEditingDescription(workspace.description ?? "");
    setEditingColor(workspace.color ?? "#579bfc");
  };

  const saveWorkspaceEdit = async () => {
    if (!editingWorkspaceId) return;
    const nextName = editingName.trim();
    if (!nextName) return;

    const res = await fetch(`/api/workspaces/${editingWorkspaceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: nextName,
        description: editingDescription.trim() || "",
        color: editingColor,
      }),
    });
    if (!res.ok) return;

    setWorkspaces((prev) =>
      prev.map((workspace) =>
        workspace.id === editingWorkspaceId
          ? {
              ...workspace,
              name: nextName,
              description: editingDescription.trim() || null,
              color: editingColor,
            }
          : workspace
      )
    );
    setEditingWorkspaceId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Workspaces</h1>
        <Button onClick={() => setShowNew(true)} className="bg-mamba-600 hover:bg-mamba-700">
          <Plus className="h-4 w-4 mr-1" /> New Workspace
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {workspaces.map((ws) => (
          <Card
            key={ws.id}
            className="hover:shadow-md transition-shadow cursor-pointer group border-l-4"
            style={{ borderLeftColor: ws.color ?? "#579bfc" }}
            onClick={() => router.push(`/workspace/${ws.id}`)}
            onDoubleClick={() => openEditWorkspace(ws)}
          >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    {ws.icon && <span>{ws.icon}</span>}
                    {ws.name}
                  </CardTitle>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreHorizontal className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditWorkspace(ws);
                        }}
                      >
                        <Edit2 className="h-3 w-3 mr-2" /> Rename / Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={(e) => e.stopPropagation()}>
                        <Trash2 className="h-3 w-3 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                {ws.description && <p className="text-sm text-muted-foreground mb-2 line-clamp-2">{ws.description}</p>}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <FolderKanban className="h-3 w-3" /> {ws._count.boards} boards
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" /> {ws._count.members} members
                  </span>
                </div>
                <div className="mt-3 space-y-1">
                  {ws.boards.slice(0, 4).map((board) => (
                    <Link
                      key={board.id}
                      href={`/board/${board.id}`}
                      className="block rounded-md border bg-background px-2 py-1.5 text-xs hover:bg-accent/50"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="font-medium">{board.name}</span>
                      <span className="ml-2 text-muted-foreground">{board._count.items} items</span>
                    </Link>
                  ))}
                  {ws.boards.length === 0 && (
                    <p className="text-xs text-muted-foreground">No boards yet</p>
                  )}
                </div>
              </CardContent>
            </Card>
        ))}

        <Card
          className="border-dashed cursor-pointer hover:border-mamba-400 transition-colors"
          onClick={() => setShowNew(true)}
        >
          <CardContent className="flex flex-col items-center justify-center py-8">
            <Plus className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm font-medium text-muted-foreground">Create Workspace</p>
          </CardContent>
        </Card>
      </div>

      {/* New Workspace Dialog */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Workspace</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Name</label>
              <Input
                placeholder="e.g. Engineering, Marketing..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Description</label>
              <Input
                placeholder="Optional description..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Accent Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  className="h-8 w-10 rounded border p-0.5"
                  value={color}
                  onChange={(event) => setColor(event.target.value)}
                />
                <span className="text-xs text-muted-foreground">{color}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button onClick={handleCreate} className="bg-mamba-600 hover:bg-mamba-700">Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingWorkspaceId)} onOpenChange={(open) => !open && setEditingWorkspaceId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Workspace</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Name</label>
              <Input value={editingName} onChange={(event) => setEditingName(event.target.value)} autoFocus />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Description</label>
              <Input value={editingDescription} onChange={(event) => setEditingDescription(event.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Accent Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  className="h-8 w-10 rounded border p-0.5"
                  value={editingColor}
                  onChange={(event) => setEditingColor(event.target.value)}
                />
                <span className="text-xs text-muted-foreground">{editingColor}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingWorkspaceId(null)}>Cancel</Button>
            <Button onClick={saveWorkspaceEdit} className="bg-mamba-600 hover:bg-mamba-700">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
