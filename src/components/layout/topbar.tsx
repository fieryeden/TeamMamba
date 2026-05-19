"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell, Search, Plus, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useRouter } from "next/navigation";
import { BOARD_TEMPLATES } from "@/lib/board-templates";

interface TopBarProps {
  user: { firstName: string; lastName: string };
  workspaces?: Array<{ id: string; name: string; color?: string | null }>;
  onToggleSidebar?: () => void;
}

export function TopBar({ user, workspaces: initialWorkspaces, onToggleSidebar }: TopBarProps) {
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNewBoard, setShowNewBoard] = useState(false);
  const [boardName, setBoardName] = useState("");
  const [selectedWorkspace, setSelectedWorkspace] = useState("");
  const [workspaces, setWorkspaces] = useState(initialWorkspaces || []);
  const [creating, setCreating] = useState(false);
  const [templateKey, setTemplateKey] = useState<string>("");
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<{
    boards: Array<{ id: string; name: string }>;
    items: Array<{ id: string; name: string; boardId: string; board: { name: string } }>;
    workspaces: Array<{ id: string; name: string }>;
  }>({ boards: [], items: [], workspaces: [] });
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);

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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setShowSearch(true);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        setShowNewBoard(true);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        window.dispatchEvent(new Event("tm:new-item"));
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "/") {
        event.preventDefault();
        setShowShortcutHelp(true);
        return;
      }
      if (event.key === "Escape") {
        setShowSearch(false);
        setShowShortcutHelp(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
          templateKey: templateKey || undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setShowNewBoard(false);
        setBoardName("");
        setTemplateKey("");
        router.push(`/board/${data.board.id}`);
      }
    } catch (err) {
      console.error("Failed to create board:", err);
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    if (!showSearch) return;
    if (!searchQuery.trim()) {
      setSearchResults({ boards: [], items: [], workspaces: [] });
      setActiveSearchIndex(0);
      return;
    }

    const timeout = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
          setActiveSearchIndex(0);
        }
      } finally {
        setSearchLoading(false);
      }
    }, 180);

    return () => clearTimeout(timeout);
  }, [searchQuery, showSearch]);

  const searchableEntries = [
    ...searchResults.boards.map((board) => ({
      key: `board-${board.id}`,
      label: board.name,
      subtitle: "Board",
      navigate: () => router.push(`/board/${board.id}`),
    })),
    ...searchResults.items.map((item) => ({
      key: `item-${item.id}`,
      label: item.name,
      subtitle: `Item • ${item.board.name}`,
      navigate: () => router.push(`/board/${item.boardId}`),
    })),
    ...searchResults.workspaces.map((workspace) => ({
      key: `workspace-${workspace.id}`,
      label: workspace.name,
      subtitle: "Workspace",
      navigate: () => router.push(`/workspace/${workspace.id}`),
    })),
  ];

  return (
    <>
      <header className="flex h-14 items-center justify-between border-b bg-card px-6">
        <div className="flex items-center gap-4 flex-1">
          <Button variant="ghost" size="icon" className="h-10 w-10 md:hidden" onClick={onToggleSidebar}>
            <Menu className="h-5 w-5" />
          </Button>
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search boards, items, workspaces... (Cmd+K)"
              className="h-10 cursor-pointer pl-9 bg-muted/50 border-0"
              onFocus={() => setShowSearch(true)}
              onClick={() => setShowSearch(true)}
              readOnly
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="relative h-10 w-10"
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
            className="h-10 bg-mamba-600 hover:bg-mamba-700"
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
            <div className="space-y-1">
              <label className="text-sm font-medium">Create from Template</label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={templateKey}
                onChange={(event) => setTemplateKey(event.target.value)}
              >
                <option value="">Blank board</option>
                {BOARD_TEMPLATES.map((template) => (
                  <option key={template.key} value={template.key}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>
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

      <Dialog open={showSearch} onOpenChange={setShowSearch}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Search</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              autoFocus
              placeholder="Type to search..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (!searchableEntries.length) return;
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActiveSearchIndex((prev) => (prev + 1) % searchableEntries.length);
                  return;
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActiveSearchIndex((prev) => (prev - 1 + searchableEntries.length) % searchableEntries.length);
                  return;
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  searchableEntries[activeSearchIndex]?.navigate();
                  setShowSearch(false);
                }
              }}
            />

            <div className="max-h-80 space-y-3 overflow-auto rounded-md border p-2">
              {searchLoading && <p className="text-xs text-muted-foreground">Searching...</p>}

              {searchResults.boards.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground">Boards</p>
                  {searchResults.boards.map((board) => {
                    const entryIndex = searchableEntries.findIndex((entry) => entry.key === `board-${board.id}`);
                    return (
                    <button
                      key={board.id}
                      className={`block w-full rounded px-2 py-1 text-left text-sm hover:bg-accent ${
                        activeSearchIndex === entryIndex ? "bg-accent" : ""
                      }`}
                      onClick={() => {
                        setShowSearch(false);
                        router.push(`/board/${board.id}`);
                      }}
                    >
                      {board.name}
                    </button>
                    );
                  })}
                </div>
              )}

              {searchResults.items.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground">Items</p>
                  {searchResults.items.map((item) => {
                    const entryIndex = searchableEntries.findIndex((entry) => entry.key === `item-${item.id}`);
                    return (
                    <button
                      key={item.id}
                      className={`block w-full rounded px-2 py-1 text-left text-sm hover:bg-accent ${
                        activeSearchIndex === entryIndex ? "bg-accent" : ""
                      }`}
                      onClick={() => {
                        setShowSearch(false);
                        router.push(`/board/${item.boardId}`);
                      }}
                    >
                      {item.name}
                      <span className="ml-2 text-xs text-muted-foreground">in {item.board.name}</span>
                    </button>
                    );
                  })}
                </div>
              )}

              {searchResults.workspaces.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground">Workspaces</p>
                  {searchResults.workspaces.map((workspace) => {
                    const entryIndex = searchableEntries.findIndex((entry) => entry.key === `workspace-${workspace.id}`);
                    return (
                    <button
                      key={workspace.id}
                      className={`block w-full rounded px-2 py-1 text-left text-sm hover:bg-accent ${
                        activeSearchIndex === entryIndex ? "bg-accent" : ""
                      }`}
                      onClick={() => {
                        setShowSearch(false);
                        router.push(`/workspace/${workspace.id}`);
                      }}
                    >
                      {workspace.name}
                    </button>
                    );
                  })}
                </div>
              )}

              {!searchLoading &&
                searchQuery.trim() &&
                searchResults.boards.length === 0 &&
                searchResults.items.length === 0 &&
                searchResults.workspaces.length === 0 && (
                  <p className="text-xs text-muted-foreground">No results found.</p>
                )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showShortcutHelp} onOpenChange={setShowShortcutHelp}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Keyboard Shortcuts</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p><strong>Cmd/Ctrl + K</strong> Search</p>
            <p><strong>Cmd/Ctrl + N</strong> New item</p>
            <p><strong>Cmd/Ctrl + Shift + N</strong> New board</p>
            <p><strong>Cmd/Ctrl + /</strong> Open this help</p>
            <p><strong>Arrow Up/Down</strong> Navigate search results</p>
            <p><strong>Enter</strong> Open selected result</p>
            <p><strong>Esc</strong> Close dialogs</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
