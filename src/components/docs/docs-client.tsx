"use client";

import { useState, useEffect, useCallback } from "react";
import { FileText, Plus, Trash2, Pin, Search, MoreVertical } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

type Doc = {
  id: string;
  title: string;
  icon: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; firstName: string; lastName: string; avatarUrl: string | null };
  workspace: { id: string; name: string };
};

type Workspace = { id: string; name: string };
type BoardOption = { id: string; name: string; groups: Array<{ id: string; name: string }> };
type BoardItemOption = { id: string; name: string; groupId: string };
type DocEmbed = {
  id: string;
  boardId: string;
  itemId: string | null;
  embedType: string;
  embedData: { groupId?: string; itemId?: string };
  board: { id: string; name: string };
  item: { id: string; name: string } | null;
  createdAt: string;
};

const DOC_ICONS = ["📄", "📝", "📋", "📌", "💡", "🎯", "📊", "🗓️", "🔧", "🎨", "🚀", "📦"];

interface DocsClientProps {
  workspaces: Workspace[];
}

export function DocsClient({ workspaces }: DocsClientProps) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeDoc, setActiveDoc] = useState<Doc | null>(null);
  const [docContent, setDocContent] = useState<string>("");
  const [showNewDoc, setShowNewDoc] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState("");
  const [newDocIcon, setNewDocIcon] = useState("📄");
  const [newDocWorkspace, setNewDocWorkspace] = useState(workspaces[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [boards, setBoards] = useState<BoardOption[]>([]);
  const [boardItems, setBoardItems] = useState<BoardItemOption[]>([]);
  const [embeds, setEmbeds] = useState<DocEmbed[]>([]);
  const [showEmbedDialog, setShowEmbedDialog] = useState(false);
  const [embedBoardId, setEmbedBoardId] = useState("");
  const [embedGroupId, setEmbedGroupId] = useState("");
  const [embedItemId, setEmbedItemId] = useState("");
  const [embedPreviewById, setEmbedPreviewById] = useState<Record<string, { title: string; rows: string[] }>>({});

  const loadDocs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/docs");
      if (res.ok) {
        const json = await res.json();
        setDocs(json.docs);
      }
    } catch (err) {
      console.error("Failed to load docs:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  const openDoc = async (doc: Doc) => {
    setActiveDoc(doc);
    // Extract plain text from content JSON for editing
    const content = (doc as Record<string, unknown>)["content"] as Record<string, unknown> | null;
    if (content) {
      const text = extractText(content);
      setDocContent(text);
    } else {
      setDocContent("");
    }
  };

  const loadEmbeds = useCallback(async (docId: string) => {
    try {
      const res = await fetch(`/api/docs/${docId}/embeds`);
      if (!res.ok) return;
      const json = await res.json();
      setEmbeds(json.embeds ?? []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!activeDoc) {
      setBoards([]);
      setBoardItems([]);
      setEmbeds([]);
      return;
    }
    loadEmbeds(activeDoc.id);
    fetch(`/api/boards?workspaceId=${activeDoc.workspace.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setBoards(data?.boards ?? []))
      .catch(() => {});
  }, [activeDoc, loadEmbeds]);

  useEffect(() => {
    if (!embedBoardId) {
      setBoardItems([]);
      return;
    }
    fetch(`/api/boards/${embedBoardId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const board = data?.board as { groups?: Array<{ id: string; items?: Array<{ id: string; name: string }> }> } | undefined;
        const items =
          board?.groups?.flatMap((group) =>
            (group.items ?? []).map((item) => ({ id: item.id, name: item.name, groupId: group.id }))
          ) ?? [];
        setBoardItems(items);
      })
      .catch(() => {});
  }, [embedBoardId]);

  const extractText = (node: Record<string, unknown>): string => {
    if (node.text) return node.text as string;
    if (Array.isArray(node.content)) {
      return (node.content as Record<string, unknown>[])
        .map(extractText)
        .join(node.type === "paragraph" ? "\n" : "");
    }
    return "";
  };

  const saveDoc = async () => {
    if (!activeDoc) return;
    setSaving(true);
    try {
      // Build simple content JSON from text
      const paragraphs = docContent.split("\n").map((line) => ({
        type: "paragraph",
        content: line ? [{ type: "text", text: line }] : [],
      }));
      await fetch(`/api/docs/${activeDoc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: { type: "doc", content: paragraphs },
        }),
      });
    } catch (err) {
      console.error("Save error:", err);
    } finally {
      setSaving(false);
    }
  };

  const createEmbed = async () => {
    if (!activeDoc || !embedBoardId) return;
    try {
      const res = await fetch(`/api/docs/${activeDoc.id}/embeds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          boardId: embedBoardId,
          itemId: embedItemId || null,
          embedType: "BOARD_VIEW",
          embedData: {
            ...(embedGroupId ? { groupId: embedGroupId } : {}),
            ...(embedItemId ? { itemId: embedItemId } : {}),
          },
        }),
      });
      if (!res.ok) return;
      setShowEmbedDialog(false);
      setEmbedBoardId("");
      setEmbedGroupId("");
      setEmbedItemId("");
      loadEmbeds(activeDoc.id);
    } catch {
      // ignore
    }
  };

  const removeEmbed = async (embedId: string) => {
    if (!activeDoc) return;
    try {
      const res = await fetch(`/api/docs/${activeDoc.id}/embeds?embedId=${embedId}`, { method: "DELETE" });
      if (!res.ok) return;
      setEmbeds((prev) => prev.filter((entry) => entry.id !== embedId));
    } catch {
      // ignore
    }
  };

  const createDoc = async () => {
    if (!newDocTitle.trim() || !newDocWorkspace) return;
    try {
      const res = await fetch("/api/docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: newDocWorkspace,
          title: newDocTitle.trim(),
          icon: newDocIcon,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        setDocs((prev) => [json.doc, ...prev]);
        setShowNewDoc(false);
        setNewDocTitle("");
        openDoc(json.doc);
      }
    } catch (err) {
      console.error("Create doc error:", err);
    }
  };

  const deleteDoc = async (docId: string) => {
    await fetch(`/api/docs/${docId}`, { method: "DELETE" });
    setDocs((prev) => prev.filter((d) => d.id !== docId));
    if (activeDoc?.id === docId) setActiveDoc(null);
  };

  const togglePin = async (doc: Doc) => {
    await fetch(`/api/docs/${doc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !doc.pinned }),
    });
    setDocs((prev) =>
      prev.map((d) => (d.id === doc.id ? { ...d, pinned: !d.pinned } : d))
    );
  };

  const filtered = docs.filter((d) =>
    d.title.toLowerCase().includes(search.toLowerCase())
  );
  const pinned = filtered.filter((d) => d.pinned);
  const unpinned = filtered.filter((d) => !d.pinned);

  return (
    <div className="flex h-full gap-6">
      {/* Doc list sidebar */}
      <div className="w-80 shrink-0 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Docs</h1>
          <Button size="sm" onClick={() => setShowNewDoc(true)}>
            <Plus className="mr-1 h-4 w-4" /> New
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search docs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground py-8 text-center">Loading...</div>
        ) : (
          <div className="space-y-4">
            {pinned.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                  📌 Pinned
                </h3>
                <div className="space-y-1">
                  {pinned.map((doc) => (
                    <DocListItem
                      key={doc.id}
                      doc={doc}
                      active={activeDoc?.id === doc.id}
                      onOpen={() => openDoc(doc)}
                      onPin={() => togglePin(doc)}
                      onDelete={() => deleteDoc(doc.id)}
                    />
                  ))}
                </div>
              </div>
            )}
            <div>
              {pinned.length > 0 && (
                <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                  All Docs
                </h3>
              )}
              <div className="space-y-1">
                {unpinned.map((doc) => (
                  <DocListItem
                    key={doc.id}
                    doc={doc}
                    active={activeDoc?.id === doc.id}
                    onOpen={() => openDoc(doc)}
                    onPin={() => togglePin(doc)}
                    onDelete={() => deleteDoc(doc.id)}
                  />
                ))}
              </div>
            </div>
            {filtered.length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No docs yet. Create one to get started.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Editor area */}
      <div className="flex-1 min-w-0">
        {activeDoc ? (
          <Card className="h-full">
            <CardHeader className="border-b">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{activeDoc.icon}</span>
                <div className="flex-1">
                  <CardTitle>{activeDoc.title}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    {activeDoc.workspace.name} · Updated {new Date(activeDoc.updatedAt).toLocaleDateString()}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setShowEmbedDialog(true)}>
                  Embed Board
                </Button>
                <Badge variant="secondary">{saving ? "Saving..." : "Auto-saved"}</Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <textarea
                className="min-h-[60vh] w-full resize-none border-0 bg-transparent text-sm leading-relaxed focus:outline-none"
                value={docContent}
                onChange={(e) => setDocContent(e.target.value)}
                onBlur={saveDoc}
                placeholder="Start writing..."
              />
              {embeds.length > 0 && (
                <div className="mt-6 space-y-3">
                  <h3 className="text-sm font-semibold">Embedded Boards</h3>
                  {embeds.map((embed) => (
                    <div key={embed.id} className="rounded-lg border bg-muted/20 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">
                          {embed.board.name}
                          {embed.item ? ` · ${embed.item.name}` : ""}
                        </p>
                        <Button size="sm" variant="ghost" onClick={() => removeEmbed(embed.id)}>
                          Remove
                        </Button>
                      </div>
                      <div className="rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground">
                        Preview: board iframe-like snapshot
                        {embed.embedData?.groupId ? ` · Group ${embed.embedData.groupId}` : ""}
                        {embed.embedData?.itemId ? ` · Item ${embed.embedData.itemId}` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="flex h-full items-center justify-center rounded-lg border-2 border-dashed text-muted-foreground">
            <div className="text-center">
              <FileText className="mx-auto mb-2 h-12 w-12" />
              <p className="text-lg font-medium">Select or create a doc</p>
              <p className="text-sm mt-1">Docs are rich text documents connected to your workspace</p>
            </div>
          </div>
        )}
      </div>

      <Dialog open={showEmbedDialog} onOpenChange={setShowEmbedDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Embed Board View</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Board</label>
              <select
                className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
                value={embedBoardId}
                onChange={(e) => {
                  setEmbedBoardId(e.target.value);
                  setEmbedGroupId("");
                  setEmbedItemId("");
                }}
              >
                <option value="">Select board</option>
                {boards.map((board) => (
                  <option key={board.id} value={board.id}>{board.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Group filter (optional)</label>
              <select
                className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
                value={embedGroupId}
                onChange={(e) => {
                  setEmbedGroupId(e.target.value);
                  setEmbedItemId("");
                }}
                disabled={!embedBoardId}
              >
                <option value="">All groups</option>
                {(boards.find((board) => board.id === embedBoardId)?.groups ?? []).map((group) => (
                  <option key={group.id} value={group.id}>{group.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Item filter (optional)</label>
              <select
                className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
                value={embedItemId}
                onChange={(e) => setEmbedItemId(e.target.value)}
                disabled={!embedBoardId}
              >
                <option value="">All items</option>
                {boardItems
                  .filter((item) => !embedGroupId || item.groupId === embedGroupId)
                  .map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEmbedDialog(false)}>Cancel</Button>
            <Button onClick={createEmbed} disabled={!embedBoardId}>Embed</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Doc Dialog */}
      <Dialog open={showNewDoc} onOpenChange={setShowNewDoc}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Icon</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {DOC_ICONS.map((icon) => (
                  <button
                    key={icon}
                    onClick={() => setNewDocIcon(icon)}
                    className={`h-10 w-10 rounded-lg text-xl flex items-center justify-center border transition-colors ${
                      newDocIcon === icon
                        ? "border-mamba-600 bg-mamba-50 dark:bg-mamba-900/20"
                        : "hover:bg-accent"
                    }`}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>
            <Input
              placeholder="Document title"
              value={newDocTitle}
              onChange={(e) => setNewDocTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createDoc()}
            />
            <div>
              <label className="text-sm font-medium">Workspace</label>
              <select
                className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
                value={newDocWorkspace}
                onChange={(e) => setNewDocWorkspace(e.target.value)}
              >
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewDoc(false)}>Cancel</Button>
            <Button onClick={createDoc} disabled={!newDocTitle.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DocListItem({
  doc,
  active,
  onOpen,
  onPin,
  onDelete,
}: {
  doc: Doc;
  active: boolean;
  onOpen: () => void;
  onPin: () => void;
  onDelete: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div
      className={`group flex items-center gap-2 rounded-lg px-3 py-2 cursor-pointer transition-colors ${
        active
          ? "bg-mamba-50 text-mamba-700 dark:bg-mamba-900/20"
          : "hover:bg-accent"
      }`}
      onClick={onOpen}
    >
      <span className="text-lg">{doc.icon}</span>
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-medium">{doc.title}</p>
        <p className="truncate text-xs text-muted-foreground">{doc.workspace.name}</p>
      </div>
      <div className="relative">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-accent rounded"
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </button>
        {showMenu && (
          <div className="absolute right-0 top-6 z-10 w-32 rounded-lg border bg-card shadow-lg">
            <button
              onClick={(e) => { e.stopPropagation(); onPin(); setShowMenu(false); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
            >
              <Pin className="h-3.5 w-3.5" /> {doc.pinned ? "Unpin" : "Pin"}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); setShowMenu(false); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-accent"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
