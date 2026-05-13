"use client";

import { useState, useCallback } from "react";
import {
  Plus, MoreHorizontal, ChevronDown, ChevronRight, Settings,
  Zap, Filter, Group, LayoutGrid, List, Calendar, Share2,
  Trash2, GripVertical, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

// Types
interface ColumnValue { id: string; value: unknown; column: { id: string; title: string; columnType: string; config: unknown } }
interface Assignee { user: { id: string; firstName: string; lastName: string; avatarUrl: string | null } }
interface Item {
  id: string; name: string; position: number; groupId: string;
  columnValues: ColumnValue[];
  assignees: Assignee[];
  _count: { comments: number; subitems: number };
}
interface Group {
  id: string; name: string; color: string; position: number; isCollapsed: boolean;
  items: Item[];
}
interface Column { id: string; title: string; columnType: string; config: unknown; order: number; width: number | null }
interface BoardMember { user: { id: string; firstName: string; lastName: string; avatarUrl: string | null } }

interface BoardClientProps {
  user: { id: string; firstName: string; lastName: string };
  board: {
    id: string; name: string; description: string | null; boardKind: string; color: string | null;
    workspace: { id: string; name: string };
    columns: Column[];
    groups: Group[];
    members: BoardMember[];
    automations: Array<{ id: string; name: string; trigger: string; action: string }>;
  };
}

export function BoardClient({ user, board }: BoardClientProps) {
  const [groups, setGroups] = useState<Group[]>(board.groups);
  const [columns] = useState<Column[]>(board.columns);
  const [viewMode, setViewMode] = useState<string>(board.boardKind);
  const [newItemName, setNewItemName] = useState<Record<string, string>>({});
  const [showNewItem, setShowNewItem] = useState<Record<string, boolean>>({});
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [showAutomationModal, setShowAutomationModal] = useState(false);
  const [showColumnModal, setShowColumnModal] = useState(false);

  // Add item
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
          prev.map((g) =>
            g.id === groupId ? { ...g, items: [...g.items, data.item] } : g
          )
        );
        setNewItemName((prev) => ({ ...prev, [groupId]: "" }));
        setShowNewItem((prev) => ({ ...prev, [groupId]: false }));
      }
    } catch (err) {
      console.error("Failed to create item:", err);
    }
  }, [board.id, newItemName]);

  // Add group
  const handleAddGroup = useCallback(async () => {
    if (!newGroupName.trim()) return;

    try {
      const res = await fetch(`/api/groups/${board.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardId: board.id, name: newGroupName }),
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

  // Delete item
  const handleDeleteItem = useCallback(async (itemId: string, groupId: string) => {
    try {
      await fetch(`/api/items/${itemId}`, { method: "DELETE" });
      setGroups((prev) =>
        prev.map((g) =>
          g.id === groupId ? { ...g, items: g.items.filter((i) => i.id !== itemId) } : g
        )
      );
      setSelectedItem(null);
    } catch (err) {
      console.error("Failed to delete item:", err);
    }
  }, []);

  // Update column value
  const handleUpdateValue = useCallback(async (valueId: string, value: unknown) => {
    try {
      await fetch(`/api/columns/values/${valueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
    } catch (err) {
      console.error("Failed to update value:", err);
    }
  }, []);

  // Toggle group collapse
  const toggleCollapse = useCallback((groupId: string) => {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.id === groupId) {
          fetch(`/api/groups/${g.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isCollapsed: !g.isCollapsed }),
          }).catch(() => {});
          return { ...g, isCollapsed: !g.isCollapsed };
        }
        return g;
      })
    );
  }, []);

  // Render status cell
  const renderStatusCell = (cv: ColumnValue) => {
    const config = cv.column.config as { labels?: string[]; colors?: string[] } | null;
    const labels = config?.labels || [];
    const colors = config?.colors || [];
    const idx = typeof cv.value === "number" ? cv.value : 0;
    const label = labels[idx] || "No Status";
    const color = colors[idx] || "#c4c4c4";

    return (
      <button
        className="status-pill"
        style={{ backgroundColor: color }}
        onClick={() => {
          const nextIdx = (idx + 1) % Math.max(labels.length, 1);
          handleUpdateValue(cv.id, nextIdx);
        }}
      >
        {label}
      </button>
    );
  };

  // Render people cell
  const renderPeopleCell = (item: Item) => {
    if (item.assignees.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
    return (
      <div className="flex -space-x-1">
        {item.assignees.map((a) => (
          <Avatar key={a.user.id} className="h-6 w-6 border-2 border-background">
            <AvatarFallback className="text-[10px] bg-mamba-100 text-mamba-700">
              {a.user.firstName[0]}{a.user.lastName[0]}
            </AvatarFallback>
          </Avatar>
        ))}
      </div>
    );
  };

  // Render cell by column type
  const renderCell = (item: Item, column: Column) => {
    const cv = item.columnValues.find((v) => v.column.id === column.id);
    if (!cv) return <span className="text-xs text-muted-foreground">—</span>;

    switch (column.columnType) {
      case "STATUS":
        return renderStatusCell(cv);
      case "PEOPLE":
        return renderPeopleCell(item);
      case "DATE":
        return cv.value ? (
          <span className="text-xs">{new Date(cv.value as string).toLocaleDateString()}</span>
        ) : <span className="text-xs text-muted-foreground">—</span>;
      case "CHECKBOX":
        return (
          <input
            type="checkbox"
            checked={!!cv.value}
            onChange={(e) => handleUpdateValue(cv.id, e.target.checked)}
            className="h-4 w-4 rounded border-muted-foreground"
          />
        );
      case "PROGRESS":
        return <Progress value={(cv.value as number) || 0} className="h-2 w-20" />;
      case "TEXT":
      case "LONG_TEXT":
        return (
          <input
            type="text"
            defaultValue={(cv.value as string) || ""}
            onBlur={(e) => handleUpdateValue(cv.id, e.target.value)}
            className="h-7 w-full rounded border-0 bg-transparent px-1 text-xs focus:bg-accent focus:outline-none"
          />
        );
      case "NUMBER":
        return (
          <input
            type="number"
            defaultValue={(cv.value as number) ?? ""}
            onBlur={(e) => handleUpdateValue(cv.id, Number(e.target.value))}
            className="h-7 w-20 rounded border-0 bg-transparent px-1 text-xs focus:bg-accent focus:outline-none"
          />
        );
      case "TAGS":
        const tags = (cv.value as string[]) || [];
        return (
          <div className="flex flex-wrap gap-1">
            {tags.map((tag, i) => (
              <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0">{tag}</Badge>
            ))}
          </div>
        );
      default:
        return <span className="text-xs text-muted-foreground truncate">{JSON.stringify(cv.value)}</span>;
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Board Header */}
      <div className="flex items-center justify-between border-b bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">{board.name}</h1>
          <span className="text-xs text-muted-foreground">/ {board.workspace.name}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* View Mode Switcher */}
          <Tabs value={viewMode} onValueChange={setViewMode}>
            <TabsList className="h-8">
              <TabsTrigger value="TABLE" className="text-xs px-2">
                <List className="h-3 w-3 mr-1" /> Table
              </TabsTrigger>
              <TabsTrigger value="KANBAN" className="text-xs px-2">
                <LayoutGrid className="h-3 w-3 mr-1" /> Kanban
              </TabsTrigger>
              <TabsTrigger value="TIMELINE" className="text-xs px-2">
                <Calendar className="h-3 w-3 mr-1" /> Timeline
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <Button variant="ghost" size="sm"><Filter className="h-3 w-3 mr-1" /> Filter</Button>
          <Button variant="ghost" size="sm" onClick={() => setShowAutomationModal(true)}>
            <Zap className="h-3 w-3 mr-1" /> Automate
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowColumnModal(true)}>
            <Plus className="h-3 w-3 mr-1" /> Add Column
          </Button>

          {/* Members */}
          <div className="flex -space-x-1 ml-2">
            {board.members.slice(0, 5).map((m) => (
              <Avatar key={m.user.id} className="h-7 w-7 border-2 border-background">
                <AvatarFallback className="text-[10px]">
                  {m.user.firstName[0]}{m.user.lastName[0]}
                </AvatarFallback>
              </Avatar>
            ))}
            {board.members.length > 5 && (
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
                +{board.members.length - 5}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Board Content */}
      <div className="flex-1 overflow-auto">
        {viewMode === "KANBAN" ? (
          <KanbanView groups={groups} columns={columns} renderCell={renderCell} />
        ) : viewMode === "TIMELINE" ? (
          <TimelineView groups={groups} columns={columns} />
        ) : (
          <TableView
            groups={groups}
            columns={columns}
            renderCell={renderCell}
            newItemName={newItemName}
            setNewItemName={setNewItemName}
            showNewItem={showNewItem}
            setShowNewItem={setShowNewItem}
            handleAddItem={handleAddItem}
            toggleCollapse={toggleCollapse}
            handleDeleteItem={handleDeleteItem}
            setSelectedItem={setSelectedItem}
          />
        )}
      </div>

      {/* Add Group */}
      <div className="border-t bg-card px-4 py-2">
        {showNewGroup ? (
          <div className="flex items-center gap-2">
            <Input
              placeholder="Group name..."
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddGroup()}
              className="h-8 w-64"
              autoFocus
            />
            <Button size="sm" onClick={handleAddGroup} className="bg-mamba-600 hover:bg-mamba-700">Add</Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowNewGroup(false); setNewGroupName(""); }}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setShowNewGroup(true)}>
            <Plus className="h-3 w-3 mr-1" /> New Group
          </Button>
        )}
      </div>

      {/* Item Detail Panel */}
      {selectedItem && (
        <ItemDetailPanel
          item={selectedItem}
          columns={columns}
          onClose={() => setSelectedItem(null)}
          onDelete={(itemId) => handleDeleteItem(itemId, selectedItem.groupId)}
          onUpdateValue={handleUpdateValue}
        />
      )}

      {/* Automation Modal */}
      {showAutomationModal && (
        <AutomationModal
          boardId={board.id}
          automations={board.automations}
          onClose={() => setShowAutomationModal(false)}
        />
      )}

      {/* Add Column Modal */}
      {showColumnModal && (
        <AddColumnModal
          boardId={board.id}
          onClose={() => setShowColumnModal(false)}
        />
      )}
    </div>
  );
}

// ─── TABLE VIEW ─────────────────────────────────────────

function TableView({
  groups, columns, renderCell, newItemName, setNewItemName,
  showNewItem, setShowNewItem, handleAddItem, toggleCollapse,
  handleDeleteItem, setSelectedItem,
}: {
  groups: Group[];
  columns: Column[];
  renderCell: (item: Item, column: Column) => React.ReactNode;
  newItemName: Record<string, string>;
  setNewItemName: (v: Record<string, string>) => void;
  showNewItem: Record<string, boolean>;
  setShowNewItem: (v: Record<string, boolean>) => void;
  handleAddItem: (groupId: string) => void;
  toggleCollapse: (groupId: string) => void;
  handleDeleteItem: (itemId: string, groupId: string) => void;
  setSelectedItem: (item: Item | null) => void;
}) {
  return (
    <table className="board-table w-full">
      <thead>
        <tr>
          <th className="w-8"></th>
          <th className="min-w-[200px]">Item</th>
          {columns.map((col) => (
            <th key={col.id} style={{ width: col.width || 140 }}>
              {col.title}
            </th>
          ))}
          <th className="w-8"></th>
        </tr>
      </thead>
      <tbody>
        {groups.map((group) => (
          <GroupRows
            key={group.id}
            group={group}
            columns={columns}
            renderCell={renderCell}
            newItemName={newItemName}
            setNewItemName={setNewItemName}
            showNewItem={showNewItem}
            setShowNewItem={setShowNewItem}
            handleAddItem={handleAddItem}
            toggleCollapse={toggleCollapse}
            handleDeleteItem={handleDeleteItem}
            setSelectedItem={setSelectedItem}
          />
        ))}
      </tbody>
    </table>
  );
}

function GroupRows({
  group, columns, renderCell, newItemName, setNewItemName,
  showNewItem, setShowNewItem, handleAddItem, toggleCollapse,
  handleDeleteItem, setSelectedItem,
}: {
  group: Group;
  columns: Column[];
  renderCell: (item: Item, column: Column) => React.ReactNode;
  newItemName: Record<string, string>;
  setNewItemName: (v: Record<string, string>) => void;
  showNewItem: Record<string, boolean>;
  setShowNewItem: (v: Record<string, boolean>) => void;
  handleAddItem: (groupId: string) => void;
  toggleCollapse: (groupId: string) => void;
  handleDeleteItem: (itemId: string, groupId: string) => void;
  setSelectedItem: (item: Item | null) => void;
}) {
  return (
    <>
      {/* Group Header */}
      <tr>
        <td colSpan={columns.length + 3} className="p-0">
          <div
            className="group-header"
            style={{ backgroundColor: group.color + "15" }}
            onClick={() => toggleCollapse(group.id)}
          >
            {group.isCollapsed ? (
              <ChevronRight className="h-4 w-4" style={{ color: group.color }} />
            ) : (
              <ChevronDown className="h-4 w-4" style={{ color: group.color }} />
            )}
            <span style={{ color: group.color }}>{group.name}</span>
            <span className="text-xs text-muted-foreground ml-1">({group.items.length})</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 ml-auto" onClick={(e) => e.stopPropagation()}>
                  <MoreHorizontal className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="text-destructive" onClick={(e) => { e.stopPropagation(); }}>
                  <Trash2 className="h-3 w-3 mr-2" /> Delete Group
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </td>
      </tr>

      {/* Items */}
      {!group.isCollapsed && group.items.map((item) => (
        <tr
          key={item.id}
          className="item-row hover:bg-accent/30 cursor-pointer"
          onClick={() => setSelectedItem(item)}
        >
          <td className="w-8 px-1">
            <GripVertical className="h-3 w-3 text-muted-foreground/40" />
          </td>
          <td className="min-w-[200px]">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{item.name}</span>
              {item._count.comments > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1 py-0">
                  💬 {item._count.comments}
                </Badge>
              )}
            </div>
          </td>
          {columns.map((col) => (
            <td key={col.id} className="min-w-[120px]" onClick={(e) => e.stopPropagation()}>
              {renderCell(item, col)}
            </td>
          ))}
          <td className="w-8 px-1" onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <MoreHorizontal className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteItem(item.id, group.id)}>
                  <Trash2 className="h-3 w-3 mr-2" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </td>
        </tr>
      ))}

      {/* Add Item Row */}
      {!group.isCollapsed && (
        <tr>
          <td colSpan={columns.length + 3}>
            {showNewItem[group.id] ? (
              <div className="flex items-center gap-2 px-4 py-1.5">
                <Input
                  placeholder="Add item..."
                  value={newItemName[group.id] || ""}
                  onChange={(e) => setNewItemName({ ...newItemName, [group.id]: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && handleAddItem(group.id)}
                  className="h-7 text-xs"
                  autoFocus
                />
                <Button size="sm" variant="ghost" onClick={() => handleAddItem(group.id)}>
                  <Plus className="h-3 w-3" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowNewItem({ ...showNewItem, [group.id]: false })}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <button
                className="flex items-center gap-1 px-4 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
                onClick={() => setShowNewItem({ ...showNewItem, [group.id]: true })}
              >
                <Plus className="h-3 w-3" /> New Item
              </button>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ─── KANBAN VIEW ────────────────────────────────────────

function KanbanView({
  groups, columns, renderCell,
}: {
  groups: Group[];
  columns: Column[];
  renderCell: (item: Item, column: Column) => React.ReactNode;
}) {
  const statusCol = columns.find((c) => c.columnType === "STATUS");

  return (
    <div className="flex gap-4 p-4 overflow-x-auto h-full">
      {groups.map((group) => (
        <div
          key={group.id}
          className="flex-shrink-0 w-72 rounded-xl border bg-card"
        >
          <div className="flex items-center gap-2 px-3 py-2.5 border-b" style={{ borderColor: group.color }}>
            <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: group.color }} />
            <span className="font-semibold text-sm">{group.name}</span>
            <span className="text-xs text-muted-foreground ml-auto">{group.items.length}</span>
          </div>
          <div className="space-y-2 p-2 max-h-[calc(100vh-200px)] overflow-y-auto">
            {group.items.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border bg-background p-3 hover:shadow-md transition-shadow cursor-pointer"
              >
                <p className="text-sm font-medium mb-2">{item.name}</p>
                {statusCol && (
                  <div className="mb-2">{renderCell(item, statusCol)}</div>
                )}
                <div className="flex items-center justify-between">
                  {item.assignees.length > 0 && (
                    <div className="flex -space-x-1">
                      {item.assignees.map((a) => (
                        <Avatar key={a.user.id} className="h-5 w-5 border-2 border-background">
                          <AvatarFallback className="text-[8px]">
                            {a.user.firstName[0]}{a.user.lastName[0]}
                          </AvatarFallback>
                        </Avatar>
                      ))}
                    </div>
                  )}
                  {item._count.comments > 0 && (
                    <span className="text-[10px] text-muted-foreground">💬 {item._count.comments}</span>
                  )}
                </div>
              </div>
            ))}
            {group.items.length === 0 && (
              <div className="rounded-lg border-2 border-dashed p-4 text-center text-xs text-muted-foreground">
                No items
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── TIMELINE VIEW ──────────────────────────────────────

function TimelineView({
  groups, columns,
}: {
  groups: Group[];
  columns: Column[];
}) {
  const dateCol = columns.find((c) => c.columnType === "DATE");
  const today = new Date();
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i - 15);
    return d;
  });

  return (
    <div className="overflow-auto">
      <div className="min-w-[1200px]">
        {/* Timeline header */}
        <div className="flex border-b bg-card sticky top-0 z-10">
          <div className="w-48 flex-shrink-0 border-r px-3 py-2 text-xs font-medium text-muted-foreground">
            Item
          </div>
          <div className="flex-1 flex">
            {days.map((day, i) => (
              <div
                key={i}
                className={cn(
                  "flex-1 text-center py-2 text-[10px] border-r",
                  day.toDateString() === today.toDateString() && "bg-mamba-50 font-bold text-mamba-700"
                )}
              >
                {day.getDate()}
              </div>
            ))}
          </div>
        </div>

        {/* Timeline rows */}
        {groups.map((group) => (
          <div key={group.id}>
            <div className="flex border-b" style={{ backgroundColor: group.color + "10" }}>
              <div className="w-48 flex-shrink-0 border-r px-3 py-2 text-xs font-semibold" style={{ color: group.color }}>
                {group.name}
              </div>
              <div className="flex-1 h-8" />
            </div>
            {group.items.map((item) => {
              const dateCv = item.columnValues.find((v) => v.column.columnType === "DATE");
              const itemDate = dateCv?.value ? new Date(dateCv.value as string) : null;
              const dayOffset = itemDate
                ? Math.round((itemDate.getTime() - today.getTime()) / 86400000) + 15
                : -1;

              return (
                <div key={item.id} className="flex border-b hover:bg-accent/30 cursor-pointer">
                  <div className="w-48 flex-shrink-0 border-r px-3 py-2 text-xs truncate">{item.name}</div>
                  <div className="flex-1 relative h-8">
                    {dayOffset >= 0 && dayOffset < 30 && (
                      <div
                        className="absolute top-1 h-6 w-4 rounded-sm bg-mamba-400"
                        style={{ left: `${(dayOffset / 30) * 100}%` }}
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

// ─── ITEM DETAIL PANEL ──────────────────────────────────

function ItemDetailPanel({
  item, columns, onClose, onDelete, onUpdateValue,
}: {
  item: Item;
  columns: Column[];
  onClose: () => void;
  onDelete: (itemId: string) => void;
  onUpdateValue: (valueId: string, value: unknown) => void;
}) {
  const [commentText, setCommentText] = useState("");

  return (
    <div className="fixed inset-y-0 right-0 w-96 border-l bg-card shadow-xl z-50 flex flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="font-semibold">{item.name}</h2>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Column values */}
        {columns.map((col) => {
          const cv = item.columnValues.find((v) => v.column.id === col.id);
          return (
            <div key={col.id} className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{col.title}</label>
              <div>
                {cv ? (
                  col.columnType === "STATUS" ? (
                    (() => {
                      const config = cv.column.config as { labels?: string[]; colors?: string[] } | null;
                      const labels = config?.labels || [];
                      const colors = config?.colors || [];
                      const idx = typeof cv.value === "number" ? cv.value : 0;
                      return (
                        <select
                          value={idx}
                          onChange={(e) => onUpdateValue(cv.id, Number(e.target.value))}
                          className="h-8 rounded-md border px-2 text-sm"
                        >
                          {labels.map((label, i) => (
                            <option key={i} value={i}>{label}</option>
                          ))}
                        </select>
                      );
                    })()
                  ) : col.columnType === "TEXT" ? (
                    <input
                      type="text"
                      defaultValue={(cv.value as string) || ""}
                      onBlur={(e) => onUpdateValue(cv.id, e.target.value)}
                      className="h-8 w-full rounded-md border px-2 text-sm"
                    />
                  ) : col.columnType === "DATE" ? (
                    <input
                      type="date"
                      defaultValue={cv.value ? new Date(cv.value as string).toISOString().split("T")[0] : ""}
                      onChange={(e) => onUpdateValue(cv.id, e.target.value)}
                      className="h-8 rounded-md border px-2 text-sm"
                    />
                  ) : (
                    <span className="text-sm">{JSON.stringify(cv.value)}</span>
                  )
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </div>
            </div>
          );
        })}

        {/* Assignees */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Assignees</label>
          <div className="flex gap-1">
            {item.assignees.map((a) => (
              <Avatar key={a.user.id} className="h-7 w-7">
                <AvatarFallback className="text-[10px]">
                  {a.user.firstName[0]}{a.user.lastName[0]}
                </AvatarFallback>
              </Avatar>
            ))}
          </div>
        </div>
      </div>

      {/* Comment input */}
      <div className="border-t p-3">
        <div className="flex gap-2">
          <Input
            placeholder="Write a comment..."
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            className="h-8 text-xs"
          />
          <Button size="sm" className="bg-mamba-600 hover:bg-mamba-700 h-8">Send</Button>
        </div>
      </div>

      {/* Actions */}
      <div className="border-t p-3">
        <Button variant="destructive" size="sm" className="w-full" onClick={() => onDelete(item.id)}>
          <Trash2 className="h-3 w-3 mr-1" /> Delete Item
        </Button>
      </div>
    </div>
  );
}

// ─── AUTOMATION MODAL ───────────────────────────────────

function AutomationModal({
  boardId, automations, onClose,
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
          <DialogTitle>⚡ Automations</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Existing automations */}
          {automations.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Active Automations</label>
              {automations.map((a) => (
                <div key={a.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                  <Zap className="h-3 w-3 text-mamba-500" />
                  <span className="font-medium">{a.name}</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {a.trigger.replace(/_/g, " ")} → {a.action.replace(/_/g, " ")}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* New automation form */}
          <div className="space-y-3">
            <label className="text-sm font-medium">Create New Automation</label>
            <Input placeholder="Automation name" value={name} onChange={(e) => setName(e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">When</label>
                <select
                  value={trigger}
                  onChange={(e) => setTrigger(e.target.value)}
                  className="h-8 w-full rounded-md border px-2 text-xs"
                >
                  <option value="STATUS_CHANGED">Status changes</option>
                  <option value="DATE_ARRIVES">Date arrives</option>
                  <option value="ITEM_CREATED">Item created</option>
                  <option value="ITEM_MOVED_TO_GROUP">Item moved to group</option>
                  <option value="ASSIGNEE_CHANGED">Assignee changed</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Then</label>
                <select
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                  className="h-8 w-full rounded-md border px-2 text-xs"
                >
                  <option value="CHANGE_STATUS">Change status</option>
                  <option value="MOVE_ITEM_TO_GROUP">Move to group</option>
                  <option value="NOTIFY_ASSIGNEE">Notify assignee</option>
                  <option value="CREATE_ITEM">Create item</option>
                  <option value="SHIFT_DATE">Shift date</option>
                </select>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCreate} className="bg-mamba-600 hover:bg-mamba-700">Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── ADD COLUMN MODAL ───────────────────────────────────

function AddColumnModal({ boardId, onClose }: { boardId: string; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [columnType, setColumnType] = useState("TEXT");

  const handleCreate = async () => {
    if (!title.trim()) return;
    await fetch(`/api/columns/${boardId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boardId, title, columnType }),
    });
    onClose();
  };

  const columnTypes = [
    { value: "TEXT", label: "Text" },
    { value: "LONG_TEXT", label: "Long Text" },
    { value: "NUMBER", label: "Number" },
    { value: "STATUS", label: "Status" },
    { value: "DATE", label: "Date" },
    { value: "PEOPLE", label: "People" },
    { value: "TAGS", label: "Tags" },
    { value: "CHECKBOX", label: "Checkbox" },
    { value: "TIMELINE", label: "Timeline" },
    { value: "PROGRESS", label: "Progress" },
    { value: "LINK", label: "Link" },
    { value: "EMAIL", label: "Email" },
    { value: "PHONE", label: "Phone" },
    { value: "RATING", label: "Rating" },
  ];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Column</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Column Name</label>
            <Input placeholder="Column title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Column Type</label>
            <div className="grid grid-cols-3 gap-2">
              {columnTypes.map((ct) => (
                <button
                  key={ct.value}
                  className={cn(
                    "rounded-lg border p-2 text-xs font-medium transition-colors",
                    columnType === ct.value
                      ? "border-mamba-500 bg-mamba-50 text-mamba-700"
                      : "hover:bg-accent"
                  )}
                  onClick={() => setColumnType(ct.value)}
                >
                  {ct.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCreate} className="bg-mamba-600 hover:bg-mamba-700">Add Column</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
