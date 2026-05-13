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
  createdAt: string | Date;
  user: { id: string; firstName: string; lastName: string; avatarUrl: string | null };
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

type ViewMode = "TABLE" | "KANBAN" | "TIMELINE";
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
  const [localComments, setLocalComments] = useState<Record<string, Array<{ id: string; body: string; createdAt: string }>>>({});
  const [localActivities, setLocalActivities] = useState<Record<string, Array<{ id: string; text: string; createdAt: string }>>>({});

  const resizeRef = useRef<{ columnId: string; startX: number; startWidth: number } | null>(null);

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

  const handleAddItem = useCallback(async (groupId: string) => {
    const name = newItemName[groupId]?.trim();
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
                    },
                  ],
                }
              : group
          )
        );
        setNewItemName((prev) => ({ ...prev, [groupId]: "" }));
        setShowNewItem((prev) => ({ ...prev, [groupId]: false }));
      }
    } catch (err) {
      console.error("Failed to create item:", err);
    }
  }, [board.id, newItemName]);

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

  const handleAddComment = useCallback((itemId: string, commentText: string) => {
    const body = commentText.trim();
    if (!body) return;

    const comment = {
      id: crypto.randomUUID(),
      body,
      createdAt: new Date().toISOString(),
    };

    setLocalComments((prev) => ({
      ...prev,
      [itemId]: [...(prev[itemId] ?? []), comment],
    }));

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

    logActivity(itemId, "Comment added");
  }, [logActivity]);

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
                <TabsTrigger value="TIMELINE" className="px-2 text-xs">
                  <Calendar className="mr-1 h-3 w-3" /> Timeline
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <Button variant="ghost" size="sm" className="h-8">
              <Filter className="mr-1 h-3.5 w-3.5" /> Filter
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
            newItemName={newItemName}
            setNewItemName={setNewItemName}
            showNewItem={showNewItem}
            setShowNewItem={setShowNewItem}
            onAddItem={handleAddItem}
            onToggleCollapse={toggleCollapse}
            onDeleteItem={handleDeleteItem}
            onSelectItem={(itemId) => setSelectedItemId(itemId)}
          />
        )}

        {viewMode === "KANBAN" && (
          <KanbanView
            groups={groups}
            columns={columns}
            onCycleStatus={handleCycleStatus}
            onSelectItem={(itemId) => setSelectedItemId(itemId)}
          />
        )}

        {viewMode === "TIMELINE" && <TimelineView groups={groups} columns={columns} />}
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
        comments={selectedItem ? localComments[selectedItem.id] ?? [] : []}
        localActivities={selectedItem ? localActivities[selectedItem.id] ?? [] : []}
        onClose={() => setSelectedItemId(null)}
        onUpdateName={handleUpdateItemName}
        onUpdateValue={handleUpdateValue}
        onAddComment={handleAddComment}
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

function TableView({
  groups,
  columns,
  sortState,
  getSortedItems,
  onSort,
  onResizeStart,
  onCycleStatus,
  onUpdateValue,
  newItemName,
  setNewItemName,
  showNewItem,
  setShowNewItem,
  onAddItem,
  onToggleCollapse,
  onDeleteItem,
  onSelectItem,
}: {
  groups: Group[];
  columns: Column[];
  sortState: SortState;
  getSortedItems: (items: Item[]) => Item[];
  onSort: (columnId: string) => void;
  onResizeStart: (columnId: string, startX: number, startWidth: number) => void;
  onCycleStatus: (itemId: string, cv: ColumnValue) => void;
  onUpdateValue: (valueId: string, value: unknown) => void;
  newItemName: Record<string, string>;
  setNewItemName: Dispatch<SetStateAction<Record<string, string>>>;
  showNewItem: Record<string, boolean>;
  setShowNewItem: Dispatch<SetStateAction<Record<string, boolean>>>;
  onAddItem: (groupId: string) => void;
  onToggleCollapse: (groupId: string) => void;
  onDeleteItem: (itemId: string, groupId: string) => void;
  onSelectItem: (itemId: string) => void;
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
              newItemName={newItemName}
              setNewItemName={setNewItemName}
              showNewItem={showNewItem}
              setShowNewItem={setShowNewItem}
              onAddItem={onAddItem}
              onToggleCollapse={onToggleCollapse}
              onDeleteItem={onDeleteItem}
              onSelectItem={onSelectItem}
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
  newItemName,
  setNewItemName,
  showNewItem,
  setShowNewItem,
  onAddItem,
  onToggleCollapse,
  onDeleteItem,
  onSelectItem,
}: {
  group: Group;
  columns: Column[];
  sortedItems: Item[];
  onCycleStatus: (itemId: string, cv: ColumnValue) => void;
  onUpdateValue: (valueId: string, value: unknown) => void;
  newItemName: Record<string, string>;
  setNewItemName: Dispatch<SetStateAction<Record<string, string>>>;
  showNewItem: Record<string, boolean>;
  setShowNewItem: Dispatch<SetStateAction<Record<string, boolean>>>;
  onAddItem: (groupId: string) => void;
  onToggleCollapse: (groupId: string) => void;
  onDeleteItem: (itemId: string, groupId: string) => void;
  onSelectItem: (itemId: string) => void;
}) {
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
              <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40" />
              <span className="text-sm font-medium">{item.name}</span>
              {item._count.comments > 0 && (
                <Badge variant="secondary" className="rounded-full px-2 py-0 text-[10px]">
                  {item._count.comments} updates
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
}: {
  item: Item;
  column: Column;
  onCycleStatus: (itemId: string, cv: ColumnValue) => void;
  onUpdateValue: (valueId: string, value: unknown) => void;
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
  onSelectItem,
}: {
  groups: Group[];
  columns: Column[];
  onCycleStatus: (itemId: string, cv: ColumnValue) => void;
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

  return (
    <div className="h-full overflow-auto px-4 py-3">
      <div className="flex min-w-[940px] gap-3">
        {lanes.map((lane) => (
          <div key={lane.index} className="kanban-lane">
            <div className="kanban-lane-header">
              <span className="status-pill" style={{ backgroundColor: lane.color }}>
                {lane.label}
              </span>
              <span className="text-xs text-muted-foreground">{lane.items.length}</span>
            </div>

            <div className="space-y-2 p-2">
              {lane.items.map((item) => {
                const statusValue = item.columnValues.find((value) => value.column.id === statusColumn.id);
                return (
                  <button
                    key={item.id}
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
                );
              })}

              {!lane.items.length && (
                <div className="rounded-md border-2 border-dashed p-4 text-center text-xs text-muted-foreground">
                  No items
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
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
  const dateColumn = columns.find((column) => column.columnType === "DATE");
  const today = new Date();
  const days = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(today);
    date.setDate(date.getDate() + index - 15);
    return date;
  });

  return (
    <div className="h-full overflow-auto">
      <div className="min-w-[1200px]">
        <div className="sticky top-0 z-10 flex border-b bg-card">
          <div className="w-60 border-r px-3 py-2 text-xs font-semibold text-muted-foreground">Item</div>
          <div className="flex-1">
            <div className="flex">
              {days.map((day) => (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "flex-1 border-r py-2 text-center text-[10px]",
                    day.toDateString() === today.toDateString() && "bg-mamba-50 font-semibold text-mamba-700"
                  )}
                >
                  {day.getDate()}
                </div>
              ))}
            </div>
          </div>
        </div>

        {groups.map((group) => (
          <div key={group.id}>
            <div className="flex border-b" style={{ backgroundColor: `${group.color}12` }}>
              <div className="w-60 border-r px-3 py-2 text-xs font-semibold" style={{ color: group.color }}>
                {group.name}
              </div>
              <div className="h-8 flex-1" />
            </div>

            {group.items.map((item) => {
              const value = item.columnValues.find((entry) => entry.column.id === dateColumn?.id)?.value;
              const itemDate = value ? new Date(value as string) : null;
              const dayOffset = itemDate
                ? Math.round((itemDate.getTime() - today.getTime()) / 86400000) + 15
                : -1;

              return (
                <div key={item.id} className="flex border-b hover:bg-accent/30">
                  <div className="w-60 border-r px-3 py-2 text-xs font-medium">{item.name}</div>
                  <div className="relative h-8 flex-1">
                    {dayOffset >= 0 && dayOffset < 30 && (
                      <div
                        className="absolute top-1 h-6 rounded bg-mamba-500/80"
                        style={{ left: `${(dayOffset / 30) * 100}%`, width: "3%" }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function ItemDetailPanel({
  user,
  item,
  groupName,
  columns,
  comments,
  localActivities,
  onClose,
  onUpdateName,
  onUpdateValue,
  onAddComment,
  onDelete,
}: {
  user: { id: string; firstName: string; lastName: string };
  item: Item | null;
  groupName: string;
  columns: Column[];
  comments: Array<{ id: string; body: string; createdAt: string }>;
  localActivities: Array<{ id: string; text: string; createdAt: string }>;
  onClose: () => void;
  onUpdateName: (itemId: string, name: string) => void;
  onUpdateValue: (valueId: string, value: unknown) => void;
  onAddComment: (itemId: string, commentText: string) => void;
  onDelete: (itemId: string) => void;
}) {
  const [commentText, setCommentText] = useState("");

  useEffect(() => {
    setCommentText("");
  }, [item?.id]);

  return (
    <aside
      className={cn(
        "fixed inset-y-0 right-0 z-50 flex w-full max-w-md translate-x-full flex-col border-l bg-card shadow-2xl transition-transform duration-200",
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
                      <DetailValueEditor column={column} cv={cv} onUpdateValue={onUpdateValue} />
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
                    placeholder="Write an update"
                    value={commentText}
                    onChange={(event) => setCommentText(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      onAddComment(item.id, commentText);
                      setCommentText("");
                    }}
                    className="h-8 text-xs"
                  />
                  <Button
                    size="sm"
                    className="h-8 bg-mamba-600 hover:bg-mamba-700"
                    onClick={() => {
                      onAddComment(item.id, commentText);
                      setCommentText("");
                    }}
                  >
                    Send
                  </Button>
                </div>

                {comments.length ? (
                  comments.map((comment) => (
                    <div key={comment.id} className="rounded bg-muted/40 px-2 py-1.5">
                      <p className="text-xs">{comment.body}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {user.firstName} {user.lastName} • {formatRelativeTime(comment.createdAt)}
                      </p>
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
  column,
  cv,
  onUpdateValue,
}: {
  column: Column;
  cv: ColumnValue;
  onUpdateValue: (valueId: string, value: unknown) => void;
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
