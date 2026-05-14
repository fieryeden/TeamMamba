"use client";

import Link from "next/link";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Calendar,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Filter,
  GripVertical,
  LayoutGrid,
  List,
  MoreHorizontal,
  Plus,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn, formatRelativeTime } from "@/lib/utils";

interface ColumnValue {
  id: string;
  value: unknown;
  column: { id: string; title: string; columnType: string; config: unknown };
}

interface Assignee {
  user: { id: string; firstName: string; lastName: string; avatarUrl: string | null };
}

interface ItemComment {
  id: string;
  body: string;
  parentId?: string | null;
  createdAt: string | Date;
  user: { id: string; firstName: string; lastName: string; avatarUrl: string | null };
  reactions?: Array<{ id: string; emoji: string; userId: string }>;
}

interface ItemUpdate {
  id: string;
  body: string;
  createdAt: string | Date;
  user: { id: string; firstName: string; lastName: string; avatarUrl: string | null };
}

interface ItemActivity {
  id: string;
  action: string;
  createdAt: string | Date;
  user: { id: string; firstName: string; lastName: string; avatarUrl: string | null };
}

interface TimeEntry {
  id: string;
  startTime: string | Date;
  endTime: string | Date | null;
  durationSeconds: number;
  isRunning: boolean;
}

interface Subitem {
  id: string;
  name: string;
  position: number;
  columnValues: ColumnValue[];
}

interface Item {
  id: string;
  name: string;
  position: number;
  groupId: string;
  columnValues: ColumnValue[];
  assignees: Assignee[];
  comments?: ItemComment[];
  updates?: ItemUpdate[];
  activities?: ItemActivity[];
  timeEntries?: TimeEntry[];
  subitems?: Subitem[];
  _count: { comments: number; subitems: number };
}

interface Group {
  id: string;
  name: string;
  color: string;
  position: number;
  isCollapsed: boolean;
  items: Item[];
}

interface Column {
  id: string;
  title: string;
  columnType: string;
  config: unknown;
  order: number;
  width: number | null;
}

interface BoardMember {
  user: { id: string; firstName: string; lastName: string; avatarUrl: string | null };
}

interface SavedBoardView {
  id: string;
  name: string;
  viewKind: ViewMode;
  config: { sortState?: SortState; collapsedGroups?: string[] } | null;
}

interface BoardClientProps {
  user: { id: string; firstName: string; lastName: string };
  board: {
    id: string;
    name: string;
    description: string | null;
    boardKind: string;
    color: string | null;
    workspace: { id: string; name: string };
    columns: Column[];
    groups: Group[];
    members: BoardMember[];
    automations: Array<{ id: string; name: string; trigger: string; action: string }>;
  };
}

type ViewMode = "TABLE" | "KANBAN" | "CALENDAR" | "TIMELINE";
type SortState = { columnId: string; direction: "asc" | "desc" } | null;

function getStatusMeta(column: Column | ColumnValue["column"]) {
  const config = column.config as { labels?: string[]; colors?: string[] } | null;
  return {
    labels: config?.labels ?? [],
    colors: config?.colors ?? [],
  };
}

function formatColumnLabel(columnType: string) {
  return columnType.replace(/_/g, " ").toLowerCase();
}

function formatDuration(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function getComparableValue(item: Item, column: Column): string | number {
  const cv = item.columnValues.find((value) => value.column.id === column.id);
  if (!cv || cv.value == null) return "";

  if (column.columnType === "NUMBER" || column.columnType === "PROGRESS") {
    return Number(cv.value) || 0;
  }

  if (column.columnType === "DATE") {
    return cv.value ? new Date(cv.value as string).getTime() : 0;
  }

  if (column.columnType === "STATUS") {
    const statusIndex = typeof cv.value === "number" ? cv.value : 0;
    const { labels } = getStatusMeta(cv.column);
    return labels[statusIndex] ?? "";
  }

  if (Array.isArray(cv.value)) {
    return cv.value.join(", ");
  }

  return String(cv.value).toLowerCase();
}

export function BoardClient({ user, board }: BoardClientProps) {
  const [groups, setGroups] = useState<Group[]>(board.groups);
  const [columns, setColumns] = useState<Column[]>(board.columns);
  const [viewMode, setViewMode] = useState<ViewMode>("TABLE");
  const [sortState, setSortState] = useState<SortState>(null);
  const [newItemName, setNewItemName] = useState<Record<string, string>>({});
  const [showNewItem, setShowNewItem] = useState<Record<string, boolean>>({});
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [showAutomationModal, setShowAutomationModal] = useState(false);
  const [showColumnModal, setShowColumnModal] = useState(false);
  const [localComments, setLocalComments] = useState<Record<string, ItemComment[]>>({});
  const [localActivities, setLocalActivities] = useState<Record<string, Array<{ id: string; text: string; createdAt: string }>>>({});
  const [expandedSubitems, setExpandedSubitems] = useState<Record<string, boolean>>({});
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [savedViews, setSavedViews] = useState<SavedBoardView[]>([]);
  const [selectedViewId, setSelectedViewId] = useState("");

  const resizeRef = useRef<{ columnId: string; startX: number; startWidth: number } | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const allItems = useMemo(() => groups.flatMap((group) => group.items), [groups]);

  const selectedItem = useMemo(() => {
    if (!selectedItemId) return null;
    return allItems.find((item) => item.id === selectedItemId) ?? null;
  }, [allItems, selectedItemId]);

  const groupById = useMemo(
    () => Object.fromEntries(groups.map((group) => [group.id, group])),
    [groups]
  );

  const logActivity = useCallback((itemId: string, text: string) => {
    const event = { id: crypto.randomUUID(), text, createdAt: new Date().toISOString() };
    setLocalActivities((prev) => ({
      ...prev,
      [itemId]: [event, ...(prev[itemId] ?? [])],
    }));
  }, []);

  const patchColumnValueInState = useCallback((valueId: string, value: unknown) => {
    setGroups((prev) =>
      prev.map((group) => ({
        ...group,
        items: group.items.map((item) => ({
          ...item,
          columnValues: item.columnValues.map((cv) =>
            cv.id === valueId ? { ...cv, value } : cv
          ),
        })),
      }))
    );
  }, []);

  const upsertColumnValueInState = useCallback((itemId: string, columnValue: ColumnValue) => {
    setGroups((prev) =>
      prev.map((group) => ({
        ...group,
        items: group.items.map((item) => {
          if (item.id !== itemId) return item;
          const index = item.columnValues.findIndex((cv) => cv.id === columnValue.id);
          if (index >= 0) {
            const next = [...item.columnValues];
            next[index] = columnValue;
            return { ...item, columnValues: next };
          }
          return { ...item, columnValues: [...item.columnValues, columnValue] };
        }),
      }))
    );
  }, []);

  const handleUpdateValue = useCallback(async (valueId: string, value: unknown) => {
    patchColumnValueInState(valueId, value);

    try {
      await fetch(`/api/columns/values/${valueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
    } catch (err) {
      console.error("Failed to update value:", err);
    }
  }, [patchColumnValueInState]);

  const handleCycleStatus = useCallback((itemId: string, cv: ColumnValue) => {
    const { labels } = getStatusMeta(cv.column);
    const currentIdx = typeof cv.value === "number" ? cv.value : 0;
    const nextIdx = (currentIdx + 1) % Math.max(labels.length, 1);

    handleUpdateValue(cv.id, nextIdx);
    logActivity(itemId, `Status changed to ${labels[nextIdx] ?? "No Status"}`);
  }, [handleUpdateValue, logActivity]);

  const handleUploadFile = useCallback(async (itemId: string, columnId: string, file: File) => {
    const body = new FormData();
    body.append("itemId", itemId);
    body.append("columnId", columnId);
    body.append("file", file);

    try {
      const res = await fetch("/api/uploads", {
        method: "POST",
        body,
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.columnValue) {
        upsertColumnValueInState(itemId, data.columnValue as ColumnValue);
      }
    } catch (err) {
      console.error("Failed to upload file:", err);
    }
  }, [upsertColumnValueInState]);

  const handleUpdateItemName = useCallback(async (itemId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;

    setGroups((prev) =>
      prev.map((group) => ({
        ...group,
        items: group.items.map((item) => (item.id === itemId ? { ...item, name: trimmed } : item)),
      }))
    );

    try {
      await fetch(`/api/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      logActivity(itemId, "Item name updated");
    } catch (err) {
      console.error("Failed to update item name:", err);
    }
  }, [logActivity]);

  const createItemInGroup = useCallback(async (groupId: string, name: string) => {
    if (!name) return;

    try {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardId: board.id, groupId, name }),
      });
      const data = await res.json();

      if (res.ok) {
        setGroups((prev) =>
          prev.map((group) =>
            group.id === groupId
              ? {
                  ...group,
                  items: [
                    ...group.items,
                    {
                      ...data.item,
                      _count: data.item._count ?? { comments: 0, subitems: 0 },
                      comments: [],
                      updates: [],
                      activities: [],
                      timeEntries: [],
                      subitems: [],
                    },
                  ],
                }
              : group
          )
        );
      }
    } catch (err) {
      console.error("Failed to create item:", err);
    }
  }, [board.id]);

  const handleAddItem = useCallback(async (groupId: string) => {
    const name = newItemName[groupId]?.trim();
    if (!name) return;
    await createItemInGroup(groupId, name);
    setNewItemName((prev) => ({ ...prev, [groupId]: "" }));
    setShowNewItem((prev) => ({ ...prev, [groupId]: false }));
  }, [createItemInGroup, newItemName]);

  const handleAddGroup = useCallback(async () => {
    const name = newGroupName.trim();
    if (!name) return;

    try {
      const res = await fetch(`/api/groups/${board.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardId: board.id, name }),
      });
      const data = await res.json();
      if (res.ok) {
        setGroups((prev) => [...prev, { ...data.group, items: [] }]);
        setNewGroupName("");
        setShowNewGroup(false);
      }
    } catch (err) {
      console.error("Failed to create group:", err);
    }
  }, [board.id, newGroupName]);

  const handleDeleteItem = useCallback(async (itemId: string, groupId: string) => {
    try {
      await fetch(`/api/items/${itemId}`, { method: "DELETE" });
      setGroups((prev) =>
        prev.map((group) =>
          group.id === groupId
            ? { ...group, items: group.items.filter((item) => item.id !== itemId) }
            : group
        )
      );
      setSelectedItemId((current) => (current === itemId ? null : current));
    } catch (err) {
      console.error("Failed to delete item:", err);
    }
  }, []);

  const handleAddComment = useCallback(async (itemId: string, commentText: string, parentId?: string) => {
    const body = commentText.trim();
    if (!body) return;

    setGroups((prev) =>
      prev.map((group) => ({
        ...group,
        items: group.items.map((item) =>
          item.id === itemId
            ? {
                ...item,
                _count: {
                  ...item._count,
                  comments: item._count.comments + 1,
                },
              }
            : item
        ),
      }))
    );

    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, body, parentId }),
      });
      if (res.ok) {
        const data = await res.json();
        setLocalComments((prev) => ({
          ...prev,
          [itemId]: [...(prev[itemId] ?? []), data.comment],
        }));
      }
    } catch {
      // ignore
    }

    logActivity(itemId, "Comment added");
  }, [logActivity]);

  const handleToggleCommentReaction = useCallback(async (itemId: string, commentId: string, emoji: string, active: boolean) => {
    try {
      const res = await fetch(
        active
          ? `/api/comments/${commentId}/reactions?emoji=${encodeURIComponent(emoji)}`
          : `/api/comments/${commentId}/reactions`,
        {
          method: active ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json" },
          body: active ? undefined : JSON.stringify({ emoji }),
        }
      );
      if (!res.ok) return;

      setLocalComments((prev) => ({
        ...prev,
        [itemId]: (prev[itemId] ?? []).map((comment) => {
          if (comment.id !== commentId) return comment;
          const existing = comment.reactions ?? [];
          const next = active
            ? existing.filter((reaction) => !(reaction.emoji === emoji && reaction.userId === user.id))
            : [...existing, { id: crypto.randomUUID(), emoji, userId: user.id }];
          return { ...comment, reactions: next };
        }),
      }));
    } catch {
      // ignore
    }
  }, [user.id]);

  const toggleCollapse = useCallback((groupId: string) => {
    setGroups((prev) =>
      prev.map((group) => {
        if (group.id !== groupId) return group;

        fetch(`/api/groups/${group.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isCollapsed: !group.isCollapsed }),
        }).catch(() => {});

        return { ...group, isCollapsed: !group.isCollapsed };
      })
    );
  }, []);

  const handleSort = useCallback((columnId: string) => {
    setSortState((current) => {
      if (!current || current.columnId !== columnId) {
        return { columnId, direction: "asc" };
      }
      return { columnId, direction: current.direction === "asc" ? "desc" : "asc" };
    });
  }, []);

  const getSortedItems = useCallback((items: Item[]) => {
    if (!sortState) return items;

    const column = columns.find((col) => col.id === sortState.columnId);
    if (!column) return items;

    const sorted = [...items].sort((a, b) => {
      const av = getComparableValue(a, column);
      const bv = getComparableValue(b, column);
      if (typeof av === "number" && typeof bv === "number") {
        return av - bv;
      }
      return String(av).localeCompare(String(bv));
    });

    return sortState.direction === "asc" ? sorted : sorted.reverse();
  }, [columns, sortState]);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      if (!resizeRef.current) return;
      const { columnId, startWidth, startX } = resizeRef.current;
      const delta = event.clientX - startX;
      const width = Math.max(110, startWidth + delta);

      setColumns((prev) =>
        prev.map((column) =>
          column.id === columnId ? { ...column, width } : column
        )
      );
    };

    const onMouseUp = () => {
      if (!resizeRef.current) return;
      const { columnId } = resizeRef.current;
      const column = columns.find((entry) => entry.id === columnId);
      resizeRef.current = null;

      if (!column?.width) return;

      fetch(`/api/columns/${columnId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ width: column.width }),
      }).catch(() => {});
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [columns]);

  useEffect(() => {
    fetch(`/api/board-views?boardId=${board.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setSavedViews(data?.views ?? []))
      .catch(() => {});
  }, [board.id]);

  const handleSaveView = async () => {
    const name = window.prompt("Name this view");
    if (!name?.trim()) return;
    const payload = {
      boardId: board.id,
      name: name.trim(),
      viewKind: viewMode,
      config: {
        sortState,
        collapsedGroups: groups.filter((group) => group.isCollapsed).map((group) => group.id),
      },
    };
    const res = await fetch("/api/board-views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return;
    const data = await res.json();
    setSavedViews((prev) => [data.view, ...prev]);
    setSelectedViewId(data.view.id);
  };

  const applySavedView = (viewId: string) => {
    setSelectedViewId(viewId);
    const view = savedViews.find((entry) => entry.id === viewId);
    if (!view) return;
    setViewMode(view.viewKind);
    setSortState(view.config?.sortState ?? null);
    const collapsed = new Set(view.config?.collapsedGroups ?? []);
    setGroups((prev) =>
      prev.map((group) => ({
        ...group,
        isCollapsed: collapsed.has(group.id),
      }))
    );
  };

  const handleExportBoard = async () => {
    const res = await fetch(`/api/boards/${board.id}/export`);
    if (!res.ok) return;
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data.board, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `${board.name.replace(/\s+/g, "-").toLowerCase()}-export.json`;
    link.click();
    URL.revokeObjectURL(href);
  };

  const handleImportBoard = async (file: File) => {
    const text = await file.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      return;
    }

    const res = await fetch("/api/boards/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: board.workspace.id,
        board: parsed,
      }),
    });
    if (!res.ok) return;
    const data = await res.json();
    window.location.href = `/board/${data.board.id}`;
  };

  const handleShareBoard = async () => {
    const res = await fetch("/api/guest-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boardId: board.id }),
    });
    if (!res.ok) return;
    const data = await res.json();
    const shareUrl = data.shareUrl as string;
    await navigator.clipboard.writeText(shareUrl);
    window.alert(`Share link copied:\n${shareUrl}`);
  };

  useEffect(() => {
    const onQuickNewItem = () => {
      const firstGroupId = groups[0]?.id;
      if (!firstGroupId) return;
      createItemInGroup(firstGroupId, "New Item");
    };

    window.addEventListener("tm:new-item", onQuickNewItem as EventListener);
    return () => window.removeEventListener("tm:new-item", onQuickNewItem as EventListener);
  }, [createItemInGroup, groups]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-card px-4 py-3">
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Link href="/workspaces" className="hover:text-foreground">
            Workspaces
          </Link>
          <ChevronRight className="h-3 w-3" />
          <Link href={`/workspace/${board.workspace.id}`} className="hover:text-foreground">
            {board.workspace.name}
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="font-medium text-foreground">{board.name}</span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{board.name}</h1>

          <div className="flex items-center gap-2">
            <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as ViewMode)}>
              <TabsList className="h-8 bg-muted/70">
                <TabsTrigger value="TABLE" className="px-2 text-xs">
                  <List className="mr-1 h-3 w-3" /> Table
                </TabsTrigger>
                <TabsTrigger value="KANBAN" className="px-2 text-xs">
                  <LayoutGrid className="mr-1 h-3 w-3" /> Kanban
                </TabsTrigger>
                <TabsTrigger value="CALENDAR" className="px-2 text-xs">
                  <CalendarDays className="mr-1 h-3 w-3" /> Calendar
                </TabsTrigger>
                <TabsTrigger value="TIMELINE" className="px-2 text-xs">
                  <Calendar className="mr-1 h-3 w-3" /> Timeline
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <Button variant="ghost" size="sm" className="h-8">
              <Filter className="mr-1 h-3.5 w-3.5" /> Filter
            </Button>
            <select
              className="h-8 rounded-md border bg-background px-2 text-xs"
              value={selectedViewId}
              onChange={(event) => applySavedView(event.target.value)}
            >
              <option value="">Saved views</option>
              {savedViews.map((view) => (
                <option key={view.id} value={view.id}>
                  {view.name}
                </option>
              ))}
            </select>
            <Button variant="ghost" size="sm" className="h-8" onClick={handleSaveView}>
              Save View
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() => setShowAutomationModal(true)}
            >
              <Zap className="mr-1 h-3.5 w-3.5" /> Automate
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() => setShowColumnModal(true)}
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Add Column
            </Button>
            <Button variant="ghost" size="sm" className="h-8" onClick={handleExportBoard}>
              Export
            </Button>
            <Button variant="ghost" size="sm" className="h-8" onClick={() => importInputRef.current?.click()}>
              Import
            </Button>
            <Button variant="ghost" size="sm" className="h-8" onClick={handleShareBoard}>
              Share
            </Button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                handleImportBoard(file);
                event.target.value = "";
              }}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {viewMode === "TABLE" && (
          <TableView
            groups={groups}
            columns={columns}
            sortState={sortState}
            getSortedItems={getSortedItems}
            onSort={handleSort}
            onResizeStart={(columnId, startX, startWidth) => {
              resizeRef.current = { columnId, startX, startWidth };
            }}
            onCycleStatus={handleCycleStatus}
            onUpdateValue={handleUpdateValue}
            onUploadFile={handleUploadFile}
            newItemName={newItemName}
            setNewItemName={setNewItemName}
            showNewItem={showNewItem}
            setShowNewItem={setShowNewItem}
            onAddItem={handleAddItem}
            onToggleCollapse={toggleCollapse}
            onDeleteItem={handleDeleteItem}
            onSelectItem={(itemId) => setSelectedItemId(itemId)}
            expandedSubitems={expandedSubitems}
            onToggleSubitems={(itemId) =>
              setExpandedSubitems((prev) => ({ ...prev, [itemId]: !prev[itemId] }))
            }
          />
        )}

        {viewMode === "KANBAN" && (
          <KanbanView
            groups={groups}
            columns={columns}
            onCycleStatus={handleCycleStatus}
            onUpdateValue={handleUpdateValue}
            onSelectItem={(itemId) => setSelectedItemId(itemId)}
          />
        )}

        {viewMode === "TIMELINE" && <TimelineView groups={groups} columns={columns} />}

        {viewMode === "CALENDAR" && (
          <CalendarView
            month={calendarMonth}
            onChangeMonth={setCalendarMonth}
            groups={groups}
            columns={columns}
            onSelectItem={(itemId) => setSelectedItemId(itemId)}
          />
        )}
      </div>

      <div className="border-t bg-card px-4 py-2">
        {showNewGroup ? (
          <div className="flex items-center gap-2">
            <Input
              placeholder="Group name"
              value={newGroupName}
              onChange={(event) => setNewGroupName(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && handleAddGroup()}
              className="h-8 w-64"
              autoFocus
            />
            <Button size="sm" className="h-8 bg-mamba-600 hover:bg-mamba-700" onClick={handleAddGroup}>
              Add
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8"
              onClick={() => {
                setShowNewGroup(false);
                setNewGroupName("");
              }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <Button variant="ghost" size="sm" className="h-8" onClick={() => setShowNewGroup(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add Group
          </Button>
        )}
      </div>

      <div
        className={cn(
          "pointer-events-none fixed inset-0 z-40 bg-black/25 opacity-0 transition-opacity",
          selectedItem && "pointer-events-auto opacity-100"
        )}
        onClick={() => setSelectedItemId(null)}
      />

      <ItemDetailPanel
        user={user}
        item={selectedItem}
        groupName={selectedItem ? groupById[selectedItem.groupId]?.name ?? "" : ""}
        columns={columns}
        allItems={allItems}
        comments={
          selectedItem
            ? [...(selectedItem.comments ?? []), ...(localComments[selectedItem.id] ?? [])]
            : []
        }
        localActivities={selectedItem ? localActivities[selectedItem.id] ?? [] : []}
        onClose={() => setSelectedItemId(null)}
        onUpdateName={handleUpdateItemName}
        onUpdateValue={handleUpdateValue}
        onUploadFile={handleUploadFile}
        onAddComment={handleAddComment}
        onToggleCommentReaction={handleToggleCommentReaction}
        onDelete={(itemId) => {
          const groupId = selectedItem?.groupId;
          if (!groupId) return;
          handleDeleteItem(itemId, groupId);
        }}
      />

      {showAutomationModal && (
        <AutomationModal
          boardId={board.id}
          automations={board.automations}
          onClose={() => setShowAutomationModal(false)}
        />
      )}

      {showColumnModal && (
        <AddColumnModal boardId={board.id} onClose={() => setShowColumnModal(false)} />
      )}
    </div>
  );
}

function CalendarView({
  month,
  onChangeMonth,
  groups,
  columns,
  onSelectItem,
}: {
  month: Date;
  onChangeMonth: (month: Date) => void;
  groups: Group[];
  columns: Column[];
  onSelectItem: (itemId: string) => void;
}) {
  const dateColumn = columns.find((column) => column.columnType === "DATE");
  if (!dateColumn) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Add a Date column to use the Calendar view.
      </div>
    );
  }

  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay());
  const gridEnd = new Date(monthEnd);
  gridEnd.setDate(monthEnd.getDate() + (6 - monthEnd.getDay()));

  const days: Date[] = [];
  for (let day = new Date(gridStart); day <= gridEnd; day.setDate(day.getDate() + 1)) {
    days.push(new Date(day));
  }

  const dateKey = (value: Date) => value.toISOString().slice(0, 10);
  const itemsByDate = new Map<string, Array<Item & { groupName: string }>>();
  for (const group of groups) {
    for (const item of group.items) {
      const dateValue = item.columnValues.find((entry) => entry.column.id === dateColumn.id)?.value;
      if (!dateValue || typeof dateValue !== "string") continue;
      const key = dateKey(new Date(dateValue));
      if (!itemsByDate.has(key)) itemsByDate.set(key, []);
      itemsByDate.get(key)!.push({ ...item, groupName: group.name });
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden px-4 py-3">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold">
          {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => onChangeMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          >
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => onChangeMonth(new Date())}
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => onChangeMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          >
            Next
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-t border-l">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((dow) => (
          <div key={dow} className="border-r border-b bg-muted/40 px-2 py-1 text-[11px] font-semibold text-muted-foreground">
            {dow}
          </div>
        ))}

        {days.map((day) => {
          const inMonth = day.getMonth() === month.getMonth();
          const dayItems = itemsByDate.get(dateKey(day)) ?? [];

          return (
            <div key={day.toISOString()} className="min-h-[110px] border-r border-b bg-background p-1">
              <div className={cn("mb-1 text-xs font-medium", !inMonth && "text-muted-foreground/60")}>
                {day.getDate()}
              </div>
              <div className="space-y-1">
                {dayItems.slice(0, 3).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => onSelectItem(item.id)}
                    className="block w-full truncate rounded bg-mamba-100 px-1.5 py-0.5 text-left text-[10px] text-mamba-800 hover:bg-mamba-200"
                    title={`${item.name} • ${item.groupName}`}
                  >
                    {item.name}
                  </button>
                ))}
                {dayItems.length > 3 && (
                  <div className="text-[10px] text-muted-foreground">+{dayItems.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TableView({
  groups,
  columns,
  sortState,
  getSortedItems,
  onSort,
  onResizeStart,
  onCycleStatus,
  onUpdateValue,
  onUploadFile,
  newItemName,
  setNewItemName,
  showNewItem,
  setShowNewItem,
  onAddItem,
  onToggleCollapse,
  onDeleteItem,
  onSelectItem,
  expandedSubitems,
  onToggleSubitems,
}: {
  groups: Group[];
  columns: Column[];
  sortState: SortState;
  getSortedItems: (items: Item[]) => Item[];
  onSort: (columnId: string) => void;
  onResizeStart: (columnId: string, startX: number, startWidth: number) => void;
  onCycleStatus: (itemId: string, cv: ColumnValue) => void;
  onUpdateValue: (valueId: string, value: unknown) => void;
  onUploadFile: (itemId: string, columnId: string, file: File) => void;
  newItemName: Record<string, string>;
  setNewItemName: Dispatch<SetStateAction<Record<string, string>>>;
  showNewItem: Record<string, boolean>;
  setShowNewItem: Dispatch<SetStateAction<Record<string, boolean>>>;
  onAddItem: (groupId: string) => void;
  onToggleCollapse: (groupId: string) => void;
  onDeleteItem: (itemId: string, groupId: string) => void;
  onSelectItem: (itemId: string) => void;
  expandedSubitems: Record<string, boolean>;
  onToggleSubitems: (itemId: string) => void;
}) {
  return (
    <div className="h-full overflow-auto">
      <table className="board-table w-full">
        <thead>
          <tr>
            <th className="w-10" />
            <th className="sticky left-0 min-w-[260px] bg-background">Item</th>
            {columns.map((column) => {
              const isSorted = sortState?.columnId === column.id;

              return (
                <th key={column.id} style={{ width: column.width ?? 170 }} className="relative min-w-[130px]">
                  <button
                    className="flex w-full items-center justify-between gap-2 text-left"
                    onClick={() => onSort(column.id)}
                  >
                    <span className="truncate">{column.title}</span>
                    {isSorted && (
                      <span className="text-[10px] text-mamba-700">
                        {sortState?.direction === "asc" ? "▲" : "▼"}
                      </span>
                    )}
                  </button>
                  <div
                    className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent hover:bg-mamba-200"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      onResizeStart(column.id, event.clientX, column.width ?? 170);
                    }}
                  />
                </th>
              );
            })}
            <th className="w-10" />
          </tr>
        </thead>

        <tbody>
          {groups.map((group) => (
            <GroupRows
              key={group.id}
              group={group}
              columns={columns}
              sortedItems={getSortedItems(group.items)}
              onCycleStatus={onCycleStatus}
              onUpdateValue={onUpdateValue}
              onUploadFile={onUploadFile}
              newItemName={newItemName}
              setNewItemName={setNewItemName}
              showNewItem={showNewItem}
              setShowNewItem={setShowNewItem}
              onAddItem={onAddItem}
              onToggleCollapse={onToggleCollapse}
              onDeleteItem={onDeleteItem}
              onSelectItem={onSelectItem}
              expandedSubitems={expandedSubitems}
              onToggleSubitems={onToggleSubitems}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupRows({
  group,
  columns,
  sortedItems,
  onCycleStatus,
  onUpdateValue,
  onUploadFile,
  newItemName,
  setNewItemName,
  showNewItem,
  setShowNewItem,
  onAddItem,
  onToggleCollapse,
  onDeleteItem,
  onSelectItem,
  expandedSubitems,
  onToggleSubitems,
}: {
  group: Group;
  columns: Column[];
  sortedItems: Item[];
  onCycleStatus: (itemId: string, cv: ColumnValue) => void;
  onUpdateValue: (valueId: string, value: unknown) => void;
  onUploadFile: (itemId: string, columnId: string, file: File) => void;
  newItemName: Record<string, string>;
  setNewItemName: Dispatch<SetStateAction<Record<string, string>>>;
  showNewItem: Record<string, boolean>;
  setShowNewItem: Dispatch<SetStateAction<Record<string, boolean>>>;
  onAddItem: (groupId: string) => void;
  onToggleCollapse: (groupId: string) => void;
  onDeleteItem: (itemId: string, groupId: string) => void;
  onSelectItem: (itemId: string) => void;
  expandedSubitems: Record<string, boolean>;
  onToggleSubitems: (itemId: string) => void;
}) {
  const statusColumn = columns.find((column) => column.columnType === "STATUS");

  return (
    <>
      <tr className="group-row">
        <td colSpan={columns.length + 3} className="p-0">
          <div className="group-header" style={{ borderLeftColor: group.color, backgroundColor: `${group.color}11` }}>
            <button
              className="flex items-center gap-1"
              onClick={() => onToggleCollapse(group.id)}
            >
              {group.isCollapsed ? (
                <ChevronRight className="h-4 w-4" style={{ color: group.color }} />
              ) : (
                <ChevronDown className="h-4 w-4" style={{ color: group.color }} />
              )}
              <span style={{ color: group.color }}>{group.name}</span>
              <span className="text-xs text-muted-foreground">({group.items.length})</span>
            </button>
            <Button variant="ghost" size="icon" className="ml-auto h-7 w-7">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </div>
        </td>
      </tr>

      {!group.isCollapsed && sortedItems.map((item) => (
        <tr key={item.id} className="item-row" onClick={() => onSelectItem(item.id)}>
          <td className="w-10 px-2">
            <input type="checkbox" className="h-3.5 w-3.5 rounded border-muted-foreground/40" />
          </td>
          <td className="sticky left-0 min-w-[260px] bg-background px-3 py-2">
            <div className="flex items-center gap-2">
              {item.subitems && item.subitems.length > 0 && (
                <button
                  className="rounded p-0.5 hover:bg-accent"
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleSubitems(item.id);
                  }}
                >
                  {expandedSubitems[item.id] ? (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </button>
              )}
              <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40" />
              <span className="text-sm font-medium">{item.name}</span>
              {item._count.comments > 0 && (
                <Badge variant="secondary" className="rounded-full px-2 py-0 text-[10px]">
                  {item._count.comments} updates
                </Badge>
              )}
              {item.timeEntries && item.timeEntries.length > 0 && (
                <Badge variant="outline" className="rounded-full px-2 py-0 text-[10px]">
                  {formatDuration(
                    item.timeEntries.reduce((acc, entry) => {
                      if (entry.isRunning) {
                        const start = new Date(entry.startTime).getTime();
                        return acc + entry.durationSeconds + Math.max(0, Math.round((Date.now() - start) / 1000));
                      }
                      return acc + entry.durationSeconds;
                    }, 0)
                  )}
                </Badge>
              )}
            </div>
          </td>

          {columns.map((column) => (
            <td
              key={column.id}
              className="min-w-[130px] px-2 py-1"
              onClick={(event) => event.stopPropagation()}
            >
              <CellRenderer
                item={item}
                column={column}
                onCycleStatus={onCycleStatus}
                onUpdateValue={onUpdateValue}
                onUploadFile={onUploadFile}
              />
            </td>
          ))}

          <td className="w-10 px-1" onClick={(event) => event.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="text-destructive" onClick={() => onDeleteItem(item.id, group.id)}>
                  <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete Item
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </td>
        </tr>
      ))}

      {!group.isCollapsed &&
        sortedItems.flatMap((item) => {
          if (!expandedSubitems[item.id] || !item.subitems?.length) return [];
          return item.subitems.map((subitem) => {
            const statusValue = statusColumn
              ? subitem.columnValues.find((value) => value.column.id === statusColumn.id)
              : null;
            const { labels, colors } = statusColumn
              ? getStatusMeta(statusColumn)
              : { labels: [], colors: [] };
            const statusIndex = typeof statusValue?.value === "number" ? statusValue.value : 0;

            return (
              <tr key={subitem.id} className="bg-muted/20 hover:bg-muted/40">
                <td />
                <td className="sticky left-0 bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground">
                  ↳ {subitem.name}
                </td>
                {columns.map((column) => (
                  <td key={`${subitem.id}-${column.id}`} className="px-2 py-1 text-xs">
                    {statusColumn && column.id === statusColumn.id && (
                      <span
                        className="inline-flex rounded px-1.5 py-0.5 text-[10px] text-white"
                        style={{ backgroundColor: colors[statusIndex] ?? "#9ca3af" }}
                      >
                        {labels[statusIndex] ?? "No Status"}
                      </span>
                    )}
                  </td>
                ))}
                <td />
              </tr>
            );
          });
        })}

      {!group.isCollapsed && (
        <tr>
          <td colSpan={columns.length + 3} className="px-2 py-1">
            {showNewItem[group.id] ? (
              <div className="flex items-center gap-2 rounded-md border border-dashed px-2 py-1">
                <Input
                  placeholder="New item name"
                  value={newItemName[group.id] ?? ""}
                  onChange={(event) =>
                    setNewItemName((prev) => ({ ...prev, [group.id]: event.target.value }))
                  }
                  onKeyDown={(event) => event.key === "Enter" && onAddItem(group.id)}
                  className="h-8 border-0 px-1"
                  autoFocus
                />
                <Button size="sm" className="h-7 bg-mamba-600 hover:bg-mamba-700" onClick={() => onAddItem(group.id)}>
                  Add
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7"
                  onClick={() => setShowNewItem((prev) => ({ ...prev, [group.id]: false }))}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <button
                className="new-item-row"
                onClick={() => setShowNewItem((prev) => ({ ...prev, [group.id]: true }))}
              >
                <Plus className="h-3.5 w-3.5" /> New Item
              </button>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function CellRenderer({
  item,
  column,
  onCycleStatus,
  onUpdateValue,
  onUploadFile,
}: {
  item: Item;
  column: Column;
  onCycleStatus: (itemId: string, cv: ColumnValue) => void;
  onUpdateValue: (valueId: string, value: unknown) => void;
  onUploadFile: (itemId: string, columnId: string, file: File) => void;
}) {
  const cv = item.columnValues.find((value) => value.column.id === column.id);
  if (!cv) return <span className="text-xs text-muted-foreground">-</span>;

  if (column.columnType === "STATUS") {
    const { labels, colors } = getStatusMeta(cv.column);
    const index = typeof cv.value === "number" ? cv.value : 0;
    const label = labels[index] ?? "No Status";
    const color = colors[index] ?? "#c4c4c4";

    return (
      <button
        className="status-pill"
        style={{ backgroundColor: color }}
        onClick={() => onCycleStatus(item.id, cv)}
      >
        {label}
      </button>
    );
  }

  if (column.columnType === "PEOPLE") {
    if (!item.assignees.length) {
      return <span className="text-xs text-muted-foreground">Unassigned</span>;
    }

    return (
      <div className="flex -space-x-1">
        {item.assignees.map((assignee) => (
          <Avatar key={assignee.user.id} className="h-6 w-6 border-2 border-background">
            <AvatarFallback className="bg-mamba-100 text-[10px] text-mamba-700">
              {assignee.user.firstName[0]}
              {assignee.user.lastName[0]}
            </AvatarFallback>
          </Avatar>
        ))}
      </div>
    );
  }

  if (column.columnType === "DATE") {
    return (
      <Input
        type="date"
        defaultValue={cv.value ? new Date(cv.value as string).toISOString().slice(0, 10) : ""}
        onChange={(event) => onUpdateValue(cv.id, event.target.value || null)}
        className="h-8 border-0 px-1 text-xs"
      />
    );
  }

  if (column.columnType === "PROGRESS") {
    const progress = Number(cv.value) || 0;
    return (
      <div className="space-y-1">
        <Progress value={progress} className="h-2" />
        <p className="text-[10px] text-muted-foreground">{progress}%</p>
      </div>
    );
  }

  if (column.columnType === "NUMBER") {
    return (
      <Input
        type="number"
        defaultValue={cv.value != null ? String(cv.value) : ""}
        onBlur={(event) => onUpdateValue(cv.id, event.target.value === "" ? null : Number(event.target.value))}
        className="h-8 border-0 px-1 text-xs"
      />
    );
  }

  if (column.columnType === "CHECKBOX") {
    return (
      <input
        type="checkbox"
        checked={Boolean(cv.value)}
        onChange={(event) => onUpdateValue(cv.id, event.target.checked)}
        className="h-4 w-4 rounded border-muted-foreground/40"
      />
    );
  }

  if (column.columnType === "TAGS") {
    const tags = (cv.value as string[]) ?? [];
    if (!tags.length) return <span className="text-xs text-muted-foreground">-</span>;

    return (
      <div className="flex flex-wrap gap-1">
        {tags.map((tag) => (
          <Badge key={`${cv.id}-${tag}`} variant="secondary" className="rounded-full px-1.5 py-0 text-[10px]">
            {tag}
          </Badge>
        ))}
      </div>
    );
  }

  if (column.columnType === "FILE") {
    const files = Array.isArray(cv.value) ? cv.value : [];
    return (
      <div className="space-y-1">
        <input
          type="file"
          className="w-full text-[10px]"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            onUploadFile(item.id, column.id, file);
          }}
        />
        {files.length > 0 && (
          <p className="text-[10px] text-muted-foreground">{files.length} file(s)</p>
        )}
      </div>
    );
  }

  return (
    <Input
      type="text"
      defaultValue={(cv.value as string) ?? ""}
      onBlur={(event) => onUpdateValue(cv.id, event.target.value)}
      className="h-8 border-0 px-1 text-xs"
    />
  );
}

function KanbanView({
  groups,
  columns,
  onCycleStatus,
  onUpdateValue,
  onSelectItem,
}: {
  groups: Group[];
  columns: Column[];
  onCycleStatus: (itemId: string, cv: ColumnValue) => void;
  onUpdateValue: (valueId: string, value: unknown) => void;
  onSelectItem: (itemId: string) => void;
}) {
  const statusColumn = columns.find((column) => column.columnType === "STATUS");

  if (!statusColumn) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Add a Status column to use the Kanban view.
      </div>
    );
  }

  const { labels, colors } = getStatusMeta(statusColumn);
  const laneCount = Math.max(labels.length, 1);
  const lanes = Array.from({ length: laneCount }, (_, index) => ({
    index,
    label: labels[index] ?? "No Status",
    color: colors[index] ?? "#c4c4c4",
    items: [] as Array<Item & { groupName: string }>,
  }));

  for (const group of groups) {
    for (const item of group.items) {
      const cv = item.columnValues.find((value) => value.column.id === statusColumn.id);
      const statusIndex = typeof cv?.value === "number" ? cv.value : 0;
      const laneIndex = Math.max(0, Math.min(statusIndex, laneCount - 1));
      lanes[laneIndex].items.push({ ...item, groupName: group.name });
    }
  }

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const sourceLane = Number(result.source.droppableId);
    const destinationLane = Number(result.destination.droppableId);

    if (Number.isNaN(sourceLane) || Number.isNaN(destinationLane)) return;

    const draggedItem = lanes[sourceLane]?.items[result.source.index];
    if (!draggedItem) return;

    const statusValue = draggedItem.columnValues.find((value) => value.column.id === statusColumn.id);
    if (!statusValue) return;
    if (sourceLane === destinationLane && result.source.index === result.destination.index) return;
    if (typeof statusValue.value === "number" && statusValue.value === destinationLane) return;

    onUpdateValue(statusValue.id, destinationLane);
  };

  return (
    <div className="h-full overflow-auto px-4 py-3">
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex min-w-[940px] gap-3">
          {lanes.map((lane) => (
            <div key={lane.index} className="kanban-lane">
              <div className="kanban-lane-header">
                <span className="status-pill" style={{ backgroundColor: lane.color }}>
                  {lane.label}
                </span>
                <span className="text-xs text-muted-foreground">{lane.items.length}</span>
              </div>

              <Droppable droppableId={String(lane.index)}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={cn(
                      "space-y-2 p-2 transition-colors",
                      snapshot.isDraggingOver && "rounded-md bg-mamba-50/70"
                    )}
                  >
                    {lane.items.map((item, itemIndex) => {
                      const statusValue = item.columnValues.find((value) => value.column.id === statusColumn.id);
                      return (
                        <Draggable key={item.id} draggableId={item.id} index={itemIndex}>
                          {(dragProvided) => (
                            <button
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              {...dragProvided.dragHandleProps}
                              className="kanban-card"
                              onClick={() => onSelectItem(item.id)}
                            >
                              <p className="text-left text-sm font-medium">{item.name}</p>
                              <p className="text-left text-[11px] text-muted-foreground">{item.groupName}</p>
                              <div className="mt-2 flex items-center justify-between">
                                <div className="flex -space-x-1">
                                  {item.assignees.slice(0, 3).map((assignee) => (
                                    <Avatar key={assignee.user.id} className="h-5 w-5 border border-background">
                                      <AvatarFallback className="text-[8px]">
                                        {assignee.user.firstName[0]}
                                        {assignee.user.lastName[0]}
                                      </AvatarFallback>
                                    </Avatar>
                                  ))}
                                </div>
                                {statusValue && (
                                  <span
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      onCycleStatus(item.id, statusValue);
                                    }}
                                    className="cursor-pointer text-[10px] text-mamba-700"
                                  >
                                    Cycle status
                                  </span>
                                )}
                              </div>
                            </button>
                          )}
                        </Draggable>
                      );
                    })}
                    {provided.placeholder}

                    {!lane.items.length && (
                      <div className="rounded-md border-2 border-dashed p-4 text-center text-xs text-muted-foreground">
                        No items
                      </div>
                    )}
                  </div>
                )}
              </Droppable>
            </div>
          ))}
        </div>
      </DragDropContext>
    </div>
  );
}

function TimelineView({
  groups,
  columns,
}: {
  groups: Group[];
  columns: Column[];
}) {
  const [zoom, setZoom] = useState<"day" | "week" | "month">("week");
  const timelineColumn = columns.find((column) => column.columnType === "TIMELINE");
  const dateColumn = columns.find((column) => column.columnType === "DATE");
  const msPerDay = 86400000;
  const dayWidth = zoom === "day" ? 34 : zoom === "week" ? 16 : 7;

  const timelineRows = useMemo(() => {
    const rows: Array<{ id: string; name: string; groupName: string; groupColor: string; start: Date; end: Date }> = [];
    const parseTimelineValue = (value: unknown): { start: Date; end: Date } | null => {
      if (!value || typeof value !== "object") return null;
      const entry = value as Record<string, unknown>;
      const startRaw = entry.start ?? entry.from;
      const endRaw = entry.end ?? entry.to;
      if (typeof startRaw !== "string" || typeof endRaw !== "string") return null;
      const start = new Date(startRaw);
      const end = new Date(endRaw);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
      return start <= end ? { start, end } : { start: end, end: start };
    };

    for (const group of groups) {
      for (const item of group.items) {
        const timelineValue = timelineColumn
          ? item.columnValues.find((entry) => entry.column.id === timelineColumn.id)?.value
          : null;
        const parsedTimeline = parseTimelineValue(timelineValue);
        if (parsedTimeline) {
          rows.push({
            id: item.id,
            name: item.name,
            groupName: group.name,
            groupColor: group.color,
            start: parsedTimeline.start,
            end: parsedTimeline.end,
          });
          continue;
        }

        const dateValue = dateColumn
          ? item.columnValues.find((entry) => entry.column.id === dateColumn.id)?.value
          : null;
        if (typeof dateValue !== "string") continue;
        const date = new Date(dateValue);
        if (Number.isNaN(date.getTime())) continue;
        rows.push({
          id: item.id,
          name: item.name,
          groupName: group.name,
          groupColor: group.color,
          start: date,
          end: date,
        });
      }
    }
    return rows;
  }, [dateColumn, groups, timelineColumn]);

  if (!timelineRows.length) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Add data to Date or Timeline columns to use the Timeline view.
      </div>
    );
  }

  const minDate = new Date(Math.min(...timelineRows.map((row) => row.start.getTime())));
  const maxDate = new Date(Math.max(...timelineRows.map((row) => row.end.getTime())));
  const padDays = zoom === "day" ? 5 : zoom === "week" ? 12 : 25;
  const chartStart = new Date(minDate);
  chartStart.setDate(chartStart.getDate() - padDays);
  const chartEnd = new Date(maxDate);
  chartEnd.setDate(chartEnd.getDate() + padDays);
  const totalDays = Math.max(1, Math.ceil((chartEnd.getTime() - chartStart.getTime()) / msPerDay) + 1);
  const svgWidth = totalDays * dayWidth;
  const rowHeight = 36;
  const svgHeight = timelineRows.length * rowHeight + 24;
  const todayOffsetDays = (new Date().setHours(0, 0, 0, 0) - chartStart.setHours(0, 0, 0, 0)) / msPerDay;
  const todayX = todayOffsetDays * dayWidth;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b bg-card px-4 py-2">
        <div className="text-sm font-semibold">Timeline</div>
        <div className="flex items-center gap-2">
          {(["day", "week", "month"] as const).map((value) => (
            <Button
              key={value}
              variant={zoom === value ? "default" : "outline"}
              size="sm"
              className={cn("h-8 capitalize", zoom === value && "bg-mamba-600 hover:bg-mamba-700")}
              onClick={() => setZoom(value)}
            >
              {value}
            </Button>
          ))}
        </div>
      </div>

      <div className="h-full overflow-auto">
        <div className="flex min-w-[1100px]">
          <div className="sticky left-0 z-10 w-[260px] shrink-0 border-r bg-card">
            <div className="sticky top-0 border-b px-3 py-2 text-xs font-semibold text-muted-foreground">
              Item
            </div>
            {timelineRows.map((row) => (
              <div key={row.id} className="flex h-9 items-center border-b px-3">
                <div className="truncate text-xs font-medium">{row.name}</div>
              </div>
            ))}
          </div>

          <div className="relative border-r">
            <svg width={svgWidth} height={svgHeight} className="block bg-background">
              {Array.from({ length: totalDays }, (_, dayIndex) => {
                const x = dayIndex * dayWidth;
                const date = new Date(chartStart);
                date.setDate(date.getDate() + dayIndex);
                const showLabel = zoom === "day" || date.getDate() === 1 || date.getDay() === 1;
                return (
                  <g key={dayIndex}>
                    <line x1={x} y1={0} x2={x} y2={svgHeight} stroke="hsl(var(--border))" strokeWidth={1} />
                    {showLabel && (
                      <text x={x + 2} y={12} fontSize="10" fill="hsl(var(--muted-foreground))">
                        {date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </text>
                    )}
                  </g>
                );
              })}

              {timelineRows.map((row, index) => {
                const startOffsetDays = (row.start.getTime() - chartStart.getTime()) / msPerDay;
                const endOffsetDays = (row.end.getTime() - chartStart.getTime()) / msPerDay;
                const x = startOffsetDays * dayWidth;
                const width = Math.max(dayWidth, (endOffsetDays - startOffsetDays + 1) * dayWidth);
                const y = index * rowHeight + 18;
                return (
                  <g key={row.id}>
                    <rect x={x} y={y} width={width} height={14} rx={7} fill={row.groupColor} opacity={0.82} />
                    <title>{`${row.name} (${row.groupName})`}</title>
                  </g>
                );
              })}

              {todayX >= 0 && todayX <= svgWidth && (
                <>
                  <line x1={todayX} y1={0} x2={todayX} y2={svgHeight} stroke="#ef4444" strokeWidth={2} />
                  <text x={todayX + 4} y={12} fontSize="10" fill="#ef4444">Today</text>
                </>
              )}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

function ItemDetailPanel({
  user,
  item,
  groupName,
  columns,
  allItems,
  comments,
  localActivities,
  onClose,
  onUpdateName,
  onUpdateValue,
  onUploadFile,
  onAddComment,
  onToggleCommentReaction,
  onDelete,
}: {
  user: { id: string; firstName: string; lastName: string };
  item: Item | null;
  groupName: string;
  columns: Column[];
  allItems: Item[];
  comments: ItemComment[];
  localActivities: Array<{ id: string; text: string; createdAt: string }>;
  onClose: () => void;
  onUpdateName: (itemId: string, name: string) => void;
  onUpdateValue: (valueId: string, value: unknown) => void;
  onUploadFile: (itemId: string, columnId: string, file: File) => void;
  onAddComment: (itemId: string, commentText: string, parentId?: string) => void;
  onToggleCommentReaction: (itemId: string, commentId: string, emoji: string, active: boolean) => void;
  onDelete: (itemId: string) => void;
}) {
  const [commentText, setCommentText] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [timeTotalSeconds, setTimeTotalSeconds] = useState(0);
  const [timeLoading, setTimeLoading] = useState(false);
  const [dependencies, setDependencies] = useState<
    Array<{
      id: string;
      dependencyType: string;
      fromItemId: string;
      toItemId: string;
      fromItem: { id: string; name: string };
      toItem: { id: string; name: string };
    }>
  >([]);
  const [dependencyQuery, setDependencyQuery] = useState("");
  const [dependencyType, setDependencyType] = useState("FINISH_TO_START");
  const [subitems, setSubitems] = useState<Subitem[]>([]);
  const [newSubitemName, setNewSubitemName] = useState("");

  useEffect(() => {
    setCommentText("");
    setReplyingTo(null);
  }, [item?.id]);

  useEffect(() => {
    if (!item) {
      setTimeEntries([]);
      setTimeTotalSeconds(0);
      setDependencies([]);
      setSubitems([]);
      return;
    }
    setTimeEntries(item.timeEntries ?? []);
    const initial = (item.timeEntries ?? []).reduce((acc, entry) => {
      if (entry.isRunning) {
        return acc + entry.durationSeconds + Math.max(0, Math.round((Date.now() - new Date(entry.startTime).getTime()) / 1000));
      }
      return acc + entry.durationSeconds;
    }, 0);
    setTimeTotalSeconds(initial);

    fetch(`/api/time-entries?itemId=${item.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setTimeEntries(data.entries ?? []);
        setTimeTotalSeconds(data.totalSeconds ?? 0);
      })
      .catch(() => {});

    fetch(`/api/dependencies?itemId=${item.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setDependencies(data?.dependencies ?? []))
      .catch(() => {});
    setSubitems(item.subitems ?? []);
  }, [item]);

  useEffect(() => {
    const runningEntry = timeEntries.find((entry) => entry.isRunning);
    if (!runningEntry) return;
    const interval = setInterval(() => {
      const runningBase = Math.max(0, Math.round((Date.now() - new Date(runningEntry.startTime).getTime()) / 1000));
      const total = timeEntries.reduce((acc, entry) => {
        if (entry.id === runningEntry.id) return acc + entry.durationSeconds + runningBase;
        return acc + entry.durationSeconds;
      }, 0);
      setTimeTotalSeconds(total);
    }, 1000);
    return () => clearInterval(interval);
  }, [timeEntries]);

  const mutateTime = async (action: "start" | "resume" | "pause" | "stop") => {
    if (!item) return;
    setTimeLoading(true);
    try {
      const running = timeEntries.find((entry) => entry.isRunning);
      const res = await fetch("/api/time-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          itemId: item.id,
          entryId: running?.id,
        }),
      });
      if (!res.ok) return;
      const refresh = await fetch(`/api/time-entries?itemId=${item.id}`);
      if (refresh.ok) {
        const data = await refresh.json();
        setTimeEntries(data.entries ?? []);
        setTimeTotalSeconds(data.totalSeconds ?? 0);
      }
    } catch {
      // ignore
    } finally {
      setTimeLoading(false);
    }
  };

  const runningEntry = timeEntries.find((entry) => entry.isRunning);
  const handleAddDependency = async (toItemId: string) => {
    if (!item) return;
    try {
      const res = await fetch("/api/dependencies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromItemId: item.id,
          toItemId,
          dependencyType,
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setDependencies((prev) => [data.dependency, ...prev]);
      setDependencyQuery("");
    } catch {
      // ignore
    }
  };

  const handleRemoveDependency = async (id: string) => {
    try {
      const res = await fetch(`/api/dependencies?id=${id}`, { method: "DELETE" });
      if (!res.ok) return;
      setDependencies((prev) => prev.filter((dep) => dep.id !== id));
    } catch {
      // ignore
    }
  };

  const candidateDependencies = allItems.filter(
    (candidate) =>
      candidate.id !== item?.id &&
      candidate.name.toLowerCase().includes(dependencyQuery.toLowerCase()) &&
      !dependencies.some((dep) => dep.fromItemId === item?.id && dep.toItemId === candidate.id)
  );
  const statusColumn = columns.find((column) => column.columnType === "STATUS");

  const handleCreateSubitem = async () => {
    if (!item || !newSubitemName.trim()) return;
    try {
      const res = await fetch("/api/subitems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentId: item.id,
          name: newSubitemName.trim(),
          statusColumnId: statusColumn?.id,
          statusValue: 0,
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setSubitems((prev) => [...prev, data.subitem]);
      setNewSubitemName("");
    } catch {
      // ignore
    }
  };

  const handleUpdateSubitem = async (subitemId: string, payload: { name?: string; statusValue?: number }) => {
    try {
      const res = await fetch(`/api/subitems/${subitemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          statusColumnId: statusColumn?.id,
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setSubitems((prev) => prev.map((entry) => (entry.id === subitemId ? data.subitem : entry)));
    } catch {
      // ignore
    }
  };

  const rootComments = comments
    .filter((comment) => !comment.parentId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const repliesByParent = comments
    .filter((comment) => Boolean(comment.parentId))
    .reduce<Record<string, ItemComment[]>>((acc, comment) => {
      const key = comment.parentId as string;
      if (!acc[key]) acc[key] = [];
      acc[key].push(comment);
      return acc;
    }, {});

  return (
    <aside
      className={cn(
        "fixed inset-y-0 right-0 z-50 flex w-full max-w-none translate-x-full flex-col border-l bg-card shadow-2xl transition-transform duration-200 md:max-w-md",
        item && "translate-x-0"
      )}
    >
      {item ? (
        <>
          <div className="flex items-start justify-between border-b px-4 py-3">
            <div className="space-y-2">
              <Input
                defaultValue={item.name}
                onBlur={(event) => onUpdateName(item.id, event.target.value)}
                className="h-9 border-0 px-0 text-lg font-semibold"
              />
              <p className="text-xs text-muted-foreground">Group: {groupName}</p>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex-1 space-y-5 overflow-auto p-4">
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Time Tracking</h3>
              <div className="rounded-md border p-3">
                <p className="text-xl font-semibold text-mamba-700">{formatDuration(timeTotalSeconds)}</p>
                <div className="mt-2 flex gap-2">
                  {!runningEntry && (
                    <Button
                      size="sm"
                      className="h-8 bg-mamba-600 hover:bg-mamba-700"
                      disabled={timeLoading}
                      onClick={() => mutateTime("start")}
                    >
                      Start
                    </Button>
                  )}
                  {runningEntry && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      disabled={timeLoading}
                      onClick={() => mutateTime("pause")}
                    >
                      Pause
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8"
                    disabled={timeLoading || !runningEntry}
                    onClick={() => mutateTime("stop")}
                  >
                    Stop
                  </Button>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Dependencies</h3>
              <div className="space-y-2 rounded-md border p-3">
                <div className="flex gap-2">
                  <select
                    className="h-8 rounded border px-2 text-xs"
                    value={dependencyType}
                    onChange={(event) => setDependencyType(event.target.value)}
                  >
                    <option value="FINISH_TO_START">Finish to Start</option>
                    <option value="START_TO_START">Start to Start</option>
                    <option value="FINISH_TO_FINISH">Finish to Finish</option>
                    <option value="START_TO_FINISH">Start to Finish</option>
                  </select>
                  <Input
                    placeholder="Search item to link"
                    value={dependencyQuery}
                    onChange={(event) => setDependencyQuery(event.target.value)}
                    className="h-8 text-xs"
                  />
                </div>

                {dependencyQuery && candidateDependencies.length > 0 && (
                  <div className="max-h-28 space-y-1 overflow-auto rounded border p-1">
                    {candidateDependencies.slice(0, 6).map((candidate) => (
                      <button
                        key={candidate.id}
                        className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-accent"
                        onClick={() => handleAddDependency(candidate.id)}
                      >
                        {candidate.name}
                      </button>
                    ))}
                  </div>
                )}

                {dependencies.length > 0 ? (
                  <div className="space-y-1">
                    {dependencies.map((dep) => {
                      const isBlocking = dep.fromItemId === item.id;
                      const label = isBlocking ? `Blocks ${dep.toItem.name}` : `Blocked by ${dep.fromItem.name}`;
                      return (
                        <div key={dep.id} className="flex items-center justify-between rounded border px-2 py-1">
                          <div>
                            <p className={cn("text-xs font-medium", isBlocking ? "text-red-600" : "text-muted-foreground")}>
                              {label}
                            </p>
                            <p className="text-[10px] text-muted-foreground">{dep.dependencyType.replace(/_/g, " ")}</p>
                          </div>
                          <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => handleRemoveDependency(dep.id)}>
                            Remove
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No dependencies</p>
                )}
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Subitems</h3>
              <div className="space-y-2 rounded-md border p-3">
                <div className="flex gap-2">
                  <Input
                    value={newSubitemName}
                    onChange={(event) => setNewSubitemName(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && handleCreateSubitem()}
                    placeholder="New subitem"
                    className="h-8 text-xs"
                  />
                  <Button size="sm" className="h-8 bg-mamba-600 hover:bg-mamba-700" onClick={handleCreateSubitem}>
                    Add
                  </Button>
                </div>

                {subitems.length > 0 ? (
                  <div className="space-y-1">
                    {subitems.map((subitem) => {
                      const statusValue = statusColumn
                        ? subitem.columnValues.find((value) => value.column.id === statusColumn.id)
                        : null;
                      const statusMeta = statusColumn ? getStatusMeta(statusColumn) : { labels: [], colors: [] };
                      const statusIndex = typeof statusValue?.value === "number" ? statusValue.value : 0;
                      return (
                        <div key={subitem.id} className="grid grid-cols-[1fr_auto] items-center gap-2 rounded border p-2">
                          <Input
                            defaultValue={subitem.name}
                            className="h-8 text-xs"
                            onBlur={(event) => handleUpdateSubitem(subitem.id, { name: event.target.value })}
                          />
                          {statusColumn ? (
                            <select
                              className="h-8 rounded border px-2 text-xs"
                              value={statusIndex}
                              onChange={(event) => handleUpdateSubitem(subitem.id, { statusValue: Number(event.target.value) })}
                            >
                              {statusMeta.labels.map((label, index) => (
                                <option key={`${subitem.id}-${label}`} value={index}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-xs text-muted-foreground">No status column</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No subitems</p>
                )}
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Column Values</h3>
              {columns.map((column) => {
                const cv = item.columnValues.find((value) => value.column.id === column.id);
                return (
                  <div key={column.id} className="rounded-md border p-2">
                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                      {column.title} ({formatColumnLabel(column.columnType)})
                    </p>
                    {!cv && <p className="text-xs text-muted-foreground">No value</p>}
                    {cv && (
                      <DetailValueEditor
                        itemId={item.id}
                        column={column}
                        cv={cv}
                        onUpdateValue={onUpdateValue}
                        onUploadFile={onUploadFile}
                      />
                    )}
                  </div>
                );
              })}
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Comments</h3>
              <div className="space-y-2 rounded-md border p-2">
                <div className="flex gap-2">
                  <Input
                    placeholder={replyingTo ? "Write a reply" : "Write an update"}
                    value={commentText}
                    onChange={(event) => setCommentText(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      onAddComment(item.id, commentText, replyingTo ?? undefined);
                      setCommentText("");
                      setReplyingTo(null);
                    }}
                    className="h-8 text-xs"
                  />
                  <Button
                    size="sm"
                    className="h-8 bg-mamba-600 hover:bg-mamba-700"
                    onClick={() => {
                      onAddComment(item.id, commentText, replyingTo ?? undefined);
                      setCommentText("");
                      setReplyingTo(null);
                    }}
                  >
                    Send
                  </Button>
                </div>

                {rootComments.length ? (
                  rootComments.map((comment) => (
                    <div key={comment.id} className="space-y-1 rounded bg-muted/40 px-2 py-1.5">
                      <p className="text-xs">{comment.body}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {comment.user.firstName} {comment.user.lastName} • {formatRelativeTime(comment.createdAt)}
                      </p>
                      <div className="flex items-center gap-1">
                        {["👍", "❤️", "🎉", "👀"].map((emoji) => {
                          const active = (comment.reactions ?? []).some(
                            (reaction) => reaction.userId === user.id && reaction.emoji === emoji
                          );
                          const count = (comment.reactions ?? []).filter((reaction) => reaction.emoji === emoji).length;
                          return (
                            <button
                              key={`${comment.id}-${emoji}`}
                              className={cn(
                                "rounded border px-1.5 py-0.5 text-[10px]",
                                active && "border-mamba-500 bg-mamba-50 text-mamba-700"
                              )}
                              onClick={() => onToggleCommentReaction(item.id, comment.id, emoji, active)}
                            >
                              {emoji} {count > 0 ? count : ""}
                            </button>
                          );
                        })}
                        <button
                          className="ml-2 text-[10px] text-mamba-700"
                          onClick={() => setReplyingTo(comment.id)}
                        >
                          Reply
                        </button>
                      </div>

                      {(repliesByParent[comment.id] ?? []).length > 0 && (
                        <div className="space-y-1 border-l pl-2">
                          {(repliesByParent[comment.id] ?? []).map((reply) => (
                            <div key={reply.id} className="rounded bg-background/80 px-2 py-1">
                              <p className="text-xs">{reply.body}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {reply.user.firstName} {reply.user.lastName} • {formatRelativeTime(reply.createdAt)}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">No comments yet</p>
                )}
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Updates & Activity</h3>
              <div className="space-y-2 rounded-md border p-2">
                {item.activities?.map((activity) => (
                  <p key={activity.id} className="text-xs text-muted-foreground">
                    {activity.user.firstName} {activity.user.lastName} • {activity.action.replace(/_/g, " ").toLowerCase()} • {formatRelativeTime(activity.createdAt)}
                  </p>
                ))}
                {item.updates?.map((update) => (
                  <p key={update.id} className="text-xs text-muted-foreground">
                    {update.user.firstName} {update.user.lastName}: {update.body}
                  </p>
                ))}
                {localActivities.map((entry) => (
                  <p key={entry.id} className="text-xs text-muted-foreground">
                    You • {entry.text} • {formatRelativeTime(entry.createdAt)}
                  </p>
                ))}
                {!item.activities?.length && !item.updates?.length && !localActivities.length && (
                  <p className="text-xs text-muted-foreground">No activity yet</p>
                )}
              </div>
            </section>
          </div>

          <div className="border-t p-3">
            <Button variant="destructive" size="sm" className="w-full" onClick={() => onDelete(item.id)}>
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete Item
            </Button>
          </div>
        </>
      ) : null}
    </aside>
  );
}

function DetailValueEditor({
  itemId,
  column,
  cv,
  onUpdateValue,
  onUploadFile,
}: {
  itemId: string;
  column: Column;
  cv: ColumnValue;
  onUpdateValue: (valueId: string, value: unknown) => void;
  onUploadFile: (itemId: string, columnId: string, file: File) => void;
}) {
  if (column.columnType === "STATUS") {
    const { labels } = getStatusMeta(cv.column);
    const currentValue = typeof cv.value === "number" ? cv.value : 0;
    return (
      <select
        value={currentValue}
        onChange={(event) => onUpdateValue(cv.id, Number(event.target.value))}
        className="h-8 w-full rounded border px-2 text-sm"
      >
        {labels.map((label, index) => (
          <option key={label} value={index}>
            {label}
          </option>
        ))}
      </select>
    );
  }

  if (column.columnType === "DATE") {
    return (
      <Input
        type="date"
        defaultValue={cv.value ? new Date(cv.value as string).toISOString().slice(0, 10) : ""}
        onChange={(event) => onUpdateValue(cv.id, event.target.value || null)}
        className="h-8"
      />
    );
  }

  if (column.columnType === "NUMBER") {
    return (
      <Input
        type="number"
        defaultValue={cv.value != null ? String(cv.value) : ""}
        onBlur={(event) => onUpdateValue(cv.id, event.target.value === "" ? null : Number(event.target.value))}
        className="h-8"
      />
    );
  }

  if (column.columnType === "CHECKBOX") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={Boolean(cv.value)}
          onChange={(event) => onUpdateValue(cv.id, event.target.checked)}
          className="h-4 w-4"
        />
        Done
      </label>
    );
  }

  if (column.columnType === "PROGRESS") {
    return (
      <Input
        type="number"
        min={0}
        max={100}
        defaultValue={cv.value != null ? String(cv.value) : ""}
        onBlur={(event) => onUpdateValue(cv.id, event.target.value === "" ? null : Number(event.target.value))}
        className="h-8"
      />
    );
  }

  if (column.columnType === "FILE") {
    const files = Array.isArray(cv.value) ? cv.value : [];
    return (
      <div className="space-y-2">
        <input
          type="file"
          className="w-full text-xs"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            onUploadFile(itemId, column.id, file);
          }}
        />
        {files.length > 0 ? (
          <div className="space-y-1">
            {files.map((file, index) => {
              const entry = file as { name?: string; url?: string };
              return (
                <a
                  key={`${entry.url ?? entry.name ?? "file"}-${index}`}
                  href={entry.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-xs text-mamba-700 hover:underline"
                >
                  {entry.name ?? "Attachment"}
                </a>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No files uploaded</p>
        )}
      </div>
    );
  }

  return (
    <Input
      type="text"
      defaultValue={(cv.value as string) ?? ""}
      onBlur={(event) => onUpdateValue(cv.id, event.target.value)}
      className="h-8"
    />
  );
}

function AutomationModal({
  boardId,
  automations,
  onClose,
}: {
  boardId: string;
  automations: Array<{ id: string; name: string; trigger: string; action: string }>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("STATUS_CHANGED");
  const [action, setAction] = useState("CHANGE_STATUS");

  const handleCreate = async () => {
    if (!name.trim()) return;

    await fetch("/api/automations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boardId, name, trigger, action }),
    });

    onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Automation</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {automations.length > 0 && (
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-sm font-semibold">Existing Automations</p>
              {automations.map((automation) => (
                <div key={automation.id} className="rounded bg-muted/40 px-2 py-1 text-xs">
                  {automation.name}: {automation.trigger.replace(/_/g, " ")} {"->"} {automation.action.replace(/_/g, " ")}
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <Input
              placeholder="Automation name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={trigger}
                onChange={(event) => setTrigger(event.target.value)}
                className="h-9 rounded-md border px-2 text-sm"
              >
                <option value="STATUS_CHANGED">Status changes</option>
                <option value="DATE_ARRIVES">Date arrives</option>
                <option value="ITEM_CREATED">Item created</option>
                <option value="ASSIGNEE_CHANGED">Assignee changed</option>
              </select>
              <select
                value={action}
                onChange={(event) => setAction(event.target.value)}
                className="h-9 rounded-md border px-2 text-sm"
              >
                <option value="CHANGE_STATUS">Change status</option>
                <option value="MOVE_ITEM_TO_GROUP">Move to group</option>
                <option value="NOTIFY_ASSIGNEE">Notify assignee</option>
                <option value="CREATE_ITEM">Create item</option>
              </select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button className="bg-mamba-600 hover:bg-mamba-700" onClick={handleCreate}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddColumnModal({ boardId, onClose }: { boardId: string; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [columnType, setColumnType] = useState("TEXT");

  const columnTypes = [
    { value: "TEXT", label: "Text" },
    { value: "LONG_TEXT", label: "Long Text" },
    { value: "NUMBER", label: "Number" },
    { value: "STATUS", label: "Status" },
    { value: "DATE", label: "Date" },
    { value: "PEOPLE", label: "People" },
    { value: "TAGS", label: "Tags" },
    { value: "CHECKBOX", label: "Checkbox" },
    { value: "PROGRESS", label: "Progress" },
  ];

  const handleCreate = async () => {
    if (!title.trim()) return;

    await fetch(`/api/columns/${boardId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boardId, title, columnType }),
    });

    onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Column</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Column Name</label>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Column title" />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Column Type</label>
            <div className="grid grid-cols-3 gap-2">
              {columnTypes.map((column) => (
                <button
                  key={column.value}
                  onClick={() => setColumnType(column.value)}
                  className={cn(
                    "rounded-md border p-2 text-xs font-medium",
                    columnType === column.value
                      ? "border-mamba-400 bg-mamba-50 text-mamba-700"
                      : "hover:bg-accent"
                  )}
                >
                  {column.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button className="bg-mamba-600 hover:bg-mamba-700" onClick={handleCreate}>Add Column</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
