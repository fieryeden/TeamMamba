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
