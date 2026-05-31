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
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Edit2,
  Filter,
  GripVertical,
  LayoutGrid,
  List,
  MoreHorizontal,
  Plus,
  Mail,
  Shield,
  Sparkles,
  Trash2,
  MessageSquare,
  BarChart3,
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn, formatRelativeTime } from "@/lib/utils";
import { useBoardSocket } from "@/hooks/use-board-socket";
import { useWorkspacePresence } from "@/hooks/use-workspace-presence";
import { GanttView } from "@/components/boards/gantt-view";
import { AIPanel } from "@/components/ai/ai-panel";
import { ColumnPermissionsDialog } from "@/components/columns/column-permissions-dialog";
import { EmailIngestionSettings } from "@/components/boards/email-ingestion-settings";
import { PollCard } from "@/components/boards/poll-card";
import { PollModal } from "@/components/boards/poll-modal";
import { SprintPanel } from "@/components/boards/sprint-panel";

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

interface ItemVersionEntry {
  id: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string | Date;
  changedBy: { id: string; firstName: string; lastName: string; avatarUrl: string | null };
}

interface BoardDocEmbed {
  id: string;
  embedType: string;
  embedData: Record<string, unknown>;
  createdAt: string | Date;
  doc: {
    id: string;
    title: string;
    icon: string | null;
    content: unknown;
    updatedAt: string | Date;
    workspaceId: string;
  };
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
  recurrenceRule: string | null;
  color: string | null;
  icon: string | null;
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
  filters: {
    logic: FilterLogic;
    conditions: FilterState[];
    searchQuery?: string;
    viewMode?: ViewMode;
  };
  isDefault: boolean;
  createdBy?: { id: string; firstName: string; lastName: string; avatarUrl: string | null };
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

type ViewMode = "TABLE" | "KANBAN" | "CALENDAR" | "TIMELINE" | "GANTT" | "SPRINTS";
type SortState = { columnId: string; direction: "asc" | "desc" } | null;
type FilterOperator = "equals" | "not_equals" | "contains" | "is_empty" | "is_not_empty";
type FilterLogic = "AND" | "OR";

interface FilterState {
  id: string;
  columnId: string;
  operator: FilterOperator;
  value: string;
  valueTo?: string;
}

interface FilterOperatorOption {
  value: FilterOperator;
  label: string;
  needsValue?: boolean;
}

const textOperators: FilterOperatorOption[] = [
  { value: "equals", label: "equals", needsValue: true },
  { value: "not_equals", label: "not equals", needsValue: true },
  { value: "contains", label: "contains", needsValue: true },
  { value: "is_empty", label: "is empty" },
  { value: "is_not_empty", label: "is not empty" },
];

function getFilterOperators(columnType: string): FilterOperatorOption[] {
  switch (columnType) {
    case "CHECKBOX":
      return textOperators.filter((entry) => entry.value !== "contains");
    default:
      return textOperators;
  }
}

function getDefaultFilter(columnId: string, columnType: string): FilterState {
  const operator = getFilterOperators(columnType)[0]?.value ?? "equals";
  return { id: crypto.randomUUID(), columnId, operator, value: "" };
}

function getTimelineRange(value: unknown): { start: Date; end: Date } | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Record<string, unknown>;
  const startRaw = entry.start ?? entry.from;
  const endRaw = entry.end ?? entry.to;
  if (typeof startRaw !== "string" || typeof endRaw !== "string") return null;
  const start = new Date(startRaw);
  const end = new Date(endRaw);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return start <= end ? { start, end } : { start: end, end: start };
}

function toDateKey(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

function asString(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

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

function hexToRgba(hex: string, alpha: number): string {
  const raw = hex.trim().replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return "transparent";
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const ITEM_COLOR_PRESETS = ["#579bfc", "#00c875", "#fdab3d", "#e2445c", "#a25ddc", "#ff158a", "#037f4c", "#676879"];
const ITEM_ICON_PRESETS = ["📌", "✅", "⚡", "🚀", "🐞", "📝", "🎯", "🔥", "📦", "🔔"];

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
  const [boardName, setBoardName] = useState(board.name);
  const [boardColor, setBoardColor] = useState(board.color ?? "#579bfc");
  const [editingBoardName, setEditingBoardName] = useState(false);

    const [columns, setColumns] = useState<Column[]>(board.columns);
  const [groups, setGroups] = useState<Group[]>(board.groups);
  const [viewMode, setViewMode] = useState<ViewMode>("TABLE");
  const [sortState, setSortState] = useState<SortState>(null);
  const [newItemName, setNewItemName] = useState<Record<string, string>>({});
  const [showNewItem, setShowNewItem] = useState<Record<string, boolean>>({});
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [showAutomationModal, setShowAutomationModal] = useState(false);
  const [showColumnModal, setShowColumnModal] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
const [showColumnPermissions, setShowColumnPermissions] = useState(false);
const [showEmailSettings, setShowEmailSettings] = useState(false);
  const [localComments, setLocalComments] = useState<Record<string, ItemComment[]>>({});
  const [localActivities, setLocalActivities] = useState<Record<string, Array<{ id: string; text: string; createdAt: string }>>>({});
  const [expandedSubitems, setExpandedSubitems] = useState<Record<string, boolean>>({});
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [savedViews, setSavedViews] = useState<SavedBoardView[]>([]);
  const [selectedViewId, setSelectedViewId] = useState("");
  const [filters, setFilters] = useState<FilterState[]>([]);
  const [filterLogic, setFilterLogic] = useState<FilterLogic>("AND");
  const [searchQuery, setSearchQuery] = useState("");
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [boardSprints, setBoardSprints] = useState<Array<any>>([]);
  const [sprintsLoaded, setSprintsLoaded] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [shareExpiry, setShareExpiry] = useState("");
  const [shareLoading, setShareLoading] = useState(false);
  const [shareCopyError, setShareCopyError] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showMondayImportDialog, setShowMondayImportDialog] = useState(false);
  const [mondayImportMode, setMondayImportMode] = useState<"csv" | "api">("csv");
  const [mondayImportFile, setMondayImportFile] = useState<File | null>(null);
  const [mondayImportLoading, setMondayImportLoading] = useState(false);
  const [mondayImportSummary, setMondayImportSummary] = useState<string | null>(null);
  // Monday.com API mode
  const [mondayApiToken, setMondayApiToken] = useState("");
  const [mondayApiBoards, setMondayApiBoards] = useState<Array<{ id: string; name: string }>>([]);
  const [mondaySelectedBoards, setMondaySelectedBoards] = useState<Set<string>>(new Set());
  const [mondayApiFetching, setMondayApiFetching] = useState(false);
  const [mondayApiError, setMondayApiError] = useState<string | null>(null);
  const [polls, setPolls] = useState<Array<any>>([]);
  const [showPollModal, setShowPollModal] = useState(false);
  const [pollsLoaded, setPollsLoaded] = useState(false);

  const resizeRef = useRef<{ columnId: string; startX: number; startWidth: number } | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const pendingValueUpdates = useRef<Map<string, { value: unknown; timestamp: number }>>(new Map());
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const toggleItemSelect = useCallback((itemId: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return next;
    });
  }, []);
  const clearSelection = useCallback(() => setSelectedItemIds(new Set()), []);

  // Bulk column value edit state
  const [selectedBulkColumn, setSelectedBulkColumn] = useState<{ id: string; type: string; title?: string; config?: unknown } | null>(null);
  const [showBulkValueEditor, setShowBulkValueEditor] = useState(false);
  const [bulkEditValue, setBulkEditValue] = useState<string>("");

  const selectAll = useCallback((allItemIds: string[]) => {
    setSelectedItemIds((prev) => {
      const allSelected = allItemIds.every((id) => prev.has(id));
      const next = new Set(allSelected ? [] : allItemIds);
      return next;
    });
  }, []);

  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

  // ─── Poll handlers ───────────────────────────────────
  const handleCreatePoll = useCallback(async (data: {
    boardId: string; itemId?: string; question: string; options: string[];
    isAnonymous: boolean; isMultiSelect: boolean; closesAt: string | null;
  }) => {
    try {
      const res = await fetch('/api/polls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const { poll } = await res.json();
        setPolls((prev: Array<any>) => [poll, ...prev]);
      }
    } catch { /* ignore */ }
  }, []);

  const handleDeletePoll = useCallback(async (pollId: string) => {
    try {
      const res = await fetch(`/api/polls/${pollId}`, { method: 'DELETE' });
      if (res.ok) {
        setPolls((prev: Array<any>) => prev.filter((p: any) => p.id !== pollId));
      }
    } catch { /* ignore */ }
  }, []);

  const handleVote = useCallback(async (pollId: string, optionIdx: number) => {
    try {
      const res = await fetch(`/api/polls/${pollId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionIdx }),
      });
      if (res.ok) {
        // Reload the poll to get updated votes
        const pollRes = await fetch(`/api/polls?boardId=${board.id}`);
        if (pollRes.ok) {
          const data = await pollRes.json();
          setPolls(data.polls || []);
        }
      }
    } catch { /* ignore */ }
  }, [board.id]);

  const handleRemoveVote = useCallback(async (pollId: string, optionIdx: number) => {
    try {
      const res = await fetch(`/api/polls/${pollId}/vote?optionIdx=${optionIdx}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        const pollRes = await fetch(`/api/polls?boardId=${board.id}`);
        if (pollRes.ok) {
          const data = await pollRes.json();
          setPolls(data.polls || []);
        }
      }
    } catch { /* ignore */ }
  }, [board.id]);

  // ─── Load polls ──────────────────────────────────────
  useEffect(() => {
    if (pollsLoaded) return;
    const loadPolls = async () => {
      try {
        const res = await fetch(`/api/polls?boardId=${board.id}`);
        if (res.ok) {
          const data = await res.json();
          setPolls(data.polls || []);
          setPollsLoaded(true);
        }
      } catch { /* ignore */ }
    };
    loadPolls();
  }, [board.id, pollsLoaded]);

  // ─── Load sprints ──────────────────────────────────────
  useEffect(() => {
    if (sprintsLoaded) return;
    const loadSprints = async () => {
      try {
        const res = await fetch(`/api/sprints?boardId=${board.id}`);
        if (res.ok) {
          const data = await res.json();
          setBoardSprints(data.sprints || []);
          setSprintsLoaded(true);
        }
      } catch { /* ignore */ }
    };
    loadSprints();
  }, [board.id, sprintsLoaded]);

  // ─── Real-time socket listeners ──────────────────────
  useBoardSocket(board.id, {
    onItemCreated: (data) => {
      const d = data as { boardId: string; item: Item };
      setGroups((prev) =>
        prev.map((g) =>
          g.id === d.item.groupId ? { ...g, items: [...g.items, d.item] } : g
        )
      );
    },
    onItemUpdated: (data) => {
      const d = data as { boardId: string; item: Item };
      console.log('[SOCKET-ITEM-UPDATED]', { itemId: d.item.id, name: (d.item as any).name, statusCol: d.item.columnValues?.find((cv: any) => cv.column?.id === statusColumn?.id)?.value });
      setGroups((prev) =>
        prev.map((g) => ({
          ...g,
          items: g.items.map((it) => {
            if (it.id !== d.item.id) return it;
            // Check if any column values have pending optimistic updates
            const hasPending = d.item.columnValues.some((cv) => pendingValueUpdates.current.has(cv.id));
            if (hasPending) {
              // Merge: keep optimistic values where pending, use server values elsewhere
              const mergedCVs = d.item.columnValues.map((cv) => {
                const pending = pendingValueUpdates.current.get(cv.id);
                if (pending) return { ...cv, value: pending.value };
                return cv;
              });
              return { ...d.item, columnValues: mergedCVs };
            }
            return d.item;
          }),
        }))
      );
    },
    onItemDeleted: (data) => {
      const d = data as { boardId: string; itemId: string };
      setGroups((prev) =>
        prev.map((g) => ({
          ...g,
          items: g.items.filter((it) => it.id !== d.itemId),
        }))
      );
    },
    onItemMoved: (data) => {
      const d = data as { boardId: string; item: Item; fromGroupId: string; toGroupId: string };
      console.log('[SOCKET-ITEM-MOVED]', { itemId: d.item.id, from: d.fromGroupId, to: d.toGroupId });
      setGroups((prev) => {
        let movedItem: Item | undefined;
        const without = prev.map((g) => {
          if (g.id === d.fromGroupId) {
            const items = g.items.filter((it) => {
              if (it.id === d.item.id) { movedItem = it; return false; }
              return true;
            });
            return { ...g, items };
          }
          return g;
        });
        if (!movedItem) return without;
        const updated: Item = { ...movedItem, groupId: d.toGroupId };
        return without.map((g) =>
          g.id === d.toGroupId ? { ...g, items: [...g.items, updated] } : g
        );
      });
    },
    onColumnUpdated: (data) => {
      const d = data as { boardId: string; columnValue: ColumnValue };
      console.log('[SOCKET-COLUMN-UPDATED]', { cvId: d.columnValue.id, columnId: (d.columnValue as any).column?.id ?? (d.columnValue as any).columnId, value: d.columnValue.value });
      const pending = pendingValueUpdates.current.get(d.columnValue.id);
      if (pending) {
        const serverValue = d.columnValue.value;
        const pendingValue = pending.value;
        const matches = JSON.stringify(serverValue) === JSON.stringify(pendingValue);
        if (!matches) {
          pendingValueUpdates.current.delete(d.columnValue.id);
          return;
        }
        pendingValueUpdates.current.delete(d.columnValue.id);
      }
      setGroups((prev) =>
        prev.map((g) => ({
          ...g,
          items: g.items.map((it) => ({
            ...it,
            columnValues: it.columnValues.map((cv) =>
              cv.id === d.columnValue.id ? (d.columnValue as ColumnValue) : cv
            ),
          })),
        }))
      );
    },
    onGroupCreated: (data) => {
      const d = data as { boardId: string; group: Group };
      setGroups((prev) => [...prev, d.group]);
    },
    onGroupUpdated: (data) => {
      const d = data as { boardId: string; group: Group };
      setGroups((prev) => prev.map((g) => (g.id === d.group.id ? d.group : g)));
    },
    onGroupDeleted: (data) => {
      const d = data as { boardId: string; groupId: string };
      setGroups((prev) => prev.filter((g) => g.id !== d.groupId));
    },
  });
  // ─── End real-time ──────────────────────────────────
  const onlineCount = useWorkspacePresence(board.workspace.id);


  const allItems = useMemo(() => groups.flatMap((group) => group.items), [groups]);

  const handleBulkDelete = useCallback(async () => {
    if (selectedItemIds.size === 0) return;
    if (!confirm(`Delete ${selectedItemIds.size} item(s)?`)) return;
    await Promise.all(
      Array.from(selectedItemIds).map((id) =>
        fetch(`/api/items/${id}`, { method: "DELETE" })
      )
    );
    setSelectedItemIds(new Set());
    setGroups((prev) => prev.map((g) => ({ ...g, items: g.items.filter((i) => !selectedItemIds.has(i.id)) })));
  }, [selectedItemIds, setGroups]);

  const handleBulkStatusChange = useCallback(async (statusIndex: number) => {
    if (selectedItemIds.size === 0) return;
    const statusColumn = columns.find((col) => col.columnType === "STATUS");
    if (!statusColumn) return;
    const statusMeta = (statusColumn.config as { labels?: string[]; colors?: string[] } | null) ?? {};
    const labels = statusMeta.labels ?? [];
    const newLabel = labels[statusIndex];
    if (!newLabel) return;
    await Promise.all(
      Array.from(selectedItemIds).map(async (itemId) => {
        const item = allItems.find((i) => i.id === itemId);
        if (!item) return;
        const cv = item.columnValues.find((v) => v.column.id === statusColumn.id);
        if (cv) {
          await fetch(`/api/columns/values/${cv.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ value: { index: statusIndex, label: newLabel } }),
          });
        }
      })
    );
    setSelectedItemIds(new Set());
    setGroups((prev) => prev.map((g) => ({
      ...g,
      items: g.items.map((i) => {
        if (!selectedItemIds.has(i.id)) return i;
        return { ...i, columnValues: i.columnValues.map((v) => v.column.id !== statusColumn.id ? v : { ...v, value: { index: statusIndex, label: newLabel } }) };
      }),
    })));
  }, [selectedItemIds, columns, allItems, setGroups]);

  const handleBulkMove = useCallback(async (targetGroupId: string) => {
    if (selectedItemIds.size === 0) return;
    await Promise.all(
      Array.from(selectedItemIds).map((id) =>
        fetch(`/api/items/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ groupId: targetGroupId }),
        })
      )
    );
    setSelectedItemIds(new Set());
    setGroups((prev) => prev.map((g) => ({ ...g, items: g.items.filter((i) => !selectedItemIds.has(i.id)) })));
  }, [selectedItemIds, setGroups]);

  const handleBulkColumnEdit = useCallback(async () => {
    if (!selectedBulkColumn || selectedItemIds.size === 0) return;
    const col = columns.find((c) => c.id === selectedBulkColumn.id);
    if (!col) return;

    let parsedValue: unknown = bulkEditValue;
    if (col.columnType === "NUMBER") {
      const num = Number(bulkEditValue);
      parsedValue = Number.isFinite(num) ? num : null;
    } else if (col.columnType === "STATUS") {
      const idx = Number(bulkEditValue);
      const labels = (col.config as { labels?: string[] } | null)?.labels ?? [];
      parsedValue = Number.isFinite(idx) ? { index: idx, label: labels[idx] ?? String(idx) } : null;
    }

    await Promise.all(
      Array.from(selectedItemIds).map(async (itemId) => {
        const item = allItems.find((i) => i.id === itemId);
        if (!item) return;
        const cv = item.columnValues.find((v) => v.column.id === selectedBulkColumn.id);
        if (cv) {
          await fetch(`/api/columns/values/${cv.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ value: parsedValue }),
          });
        } else {
          await fetch(`/api/columns/values`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemId, columnId: selectedBulkColumn.id, value: parsedValue }),
          });
        }
      })
    );
    setShowBulkValueEditor(false);
    setSelectedBulkColumn(null);
    setBulkEditValue("");
    clearSelection();
  }, [selectedBulkColumn, selectedItemIds, bulkEditValue, columns, allItems, clearSelection]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable;

      // Escape — close panels / clear selection / close modals
      if (e.key === "Escape") {
        if (selectedItemId) { setSelectedItemId(null); e.preventDefault(); return; }
        if (selectedItemIds.size > 0) { clearSelection(); e.preventDefault(); return; }
        if (showColumnModal) { setShowColumnModal(false); e.preventDefault(); return; }
        if (showAutomationModal) { setShowAutomationModal(false); e.preventDefault(); return; }
        if (showColumnPermissions) { setShowColumnPermissions(false); e.preventDefault(); return; }
 if (showEmailSettings) { setShowEmailSettings(false); e.preventDefault(); return; }
 if (showShortcutsHelp) { setShowShortcutsHelp(false); e.preventDefault(); return; }
        return;
      }

      // Ctrl/Cmd + K — focus search
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        const searchInput = document.querySelector<HTMLInputElement>('input[placeholder="Search items"]');
        if (searchInput) { searchInput.focus(); searchInput.select(); }
        return;
      }

      // Ctrl/Cmd + A — select all items
      if ((e.metaKey || e.ctrlKey) && e.key === "a" && !inInput) {
        e.preventDefault();
        const allIds = groups.flatMap((g) => g.items.map((i) => i.id));
        selectAll(allIds);
        return;
      }

      // Delete/Backspace — bulk delete if items selected and not in input
      if ((e.key === "Delete" || e.key === "Backspace") && selectedItemIds.size > 0 && !inInput) {
        e.preventDefault();
        handleBulkDelete();
        return;
      }

      // Number keys switch view mode (not in input)
      if (!inInput && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.key === "1") { setViewMode("TABLE"); return; }
        if (e.key === "2") { setViewMode("KANBAN"); return; }
        if (e.key === "3") { setViewMode("CALENDAR"); return; }
        if (e.key === "4") { setViewMode("TIMELINE"); return; }
        if (e.key === "5") { setViewMode("GANTT"); return; }
        if (e.key === "?") { setShowShortcutsHelp((v) => !v); return; }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedItemId, selectedItemIds, showColumnModal, showAutomationModal, showShortcutsHelp, groups, selectAll, clearSelection, handleBulkDelete]);

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  const isFilterActive = useCallback((filter: FilterState) => {
    const column = columns.find((entry) => entry.id === filter.columnId);
    if (!column) return false;
    const operator = getFilterOperators(column.columnType).find((entry) => entry.value === filter.operator);
    if (!operator) return false;
    if (operator.needsValue && !filter.value.trim()) return false;
    return true;
  }, [columns]);

  const activeFilters = useMemo(
    () => filters.filter((filter) => isFilterActive(filter)),
    [filters, isFilterActive]
  );

  const matchesSearch = useCallback((item: Item) => {
    if (!normalizedSearchQuery) return true;
    return item.name.toLowerCase().includes(normalizedSearchQuery);
  }, [normalizedSearchQuery]);

  const matchesFilter = useCallback((item: Item, filter: FilterState) => {
    try {
      if (!filter || !filter.columnId) return true;
      const column = columns.find((entry) => entry.id === filter.columnId);
      if (!column) return true;

      const cv = item.columnValues.find((entry) => entry.column.id === column.id);
      const value = cv?.value;
      const textValue = asString(value).toLowerCase().trim();
      const rawFilterValue = (filter.value ?? "").trim().toLowerCase();

      if (filter.operator === "is_empty") {
        if (column.columnType === "PEOPLE") return item.assignees.length === 0;
        if (column.columnType === "CHECKBOX") return value == null;
        return value == null || asString(value).trim() === "" || (Array.isArray(value) && value.length === 0);
      }
      if (filter.operator === "is_not_empty") {
        if (column.columnType === "PEOPLE") return item.assignees.length > 0;
        if (column.columnType === "CHECKBOX") return value != null;
        return !(value == null || asString(value).trim() === "" || (Array.isArray(value) && value.length === 0));
      }

      if (column.columnType === "PEOPLE") {
        const matchesId = item.assignees.some((assignee) => assignee.user.id.toLowerCase() === rawFilterValue);
        const assigneeValues = item.assignees
          .map((assignee) => `${assignee.user.firstName} ${assignee.user.lastName}`.toLowerCase())
          .join(", ");
        if (filter.operator === "contains") return assigneeValues.includes(rawFilterValue) || matchesId;
        if (filter.operator === "equals") return assigneeValues === rawFilterValue || matchesId;
        if (filter.operator === "not_equals") return assigneeValues !== rawFilterValue && !matchesId;
        return true;
      }

      if (column.columnType === "CHECKBOX") {
        const checkboxLabel = Boolean(value) ? "true" : "false";
        if (filter.operator === "equals") return checkboxLabel === rawFilterValue;
        if (filter.operator === "not_equals") return checkboxLabel !== rawFilterValue;
        if (filter.operator === "contains") return checkboxLabel.includes(rawFilterValue);
        return true;
      }

      if (filter.operator === "equals") return textValue === rawFilterValue;
      if (filter.operator === "not_equals") return textValue !== rawFilterValue;
      if (filter.operator === "contains") return textValue.includes(rawFilterValue);
      return true;
    } catch (err) {
      console.error("Filter evaluation failed:", err);
      return true;
    }
  }, [columns]);

  const filteredGroups = useMemo(() => {
    try {
      return groups.map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          if (!matchesSearch(item)) return false;
          if (!activeFilters.length) return true;
          if (filterLogic === "AND") return activeFilters.every((filter) => matchesFilter(item, filter));
          return activeFilters.some((filter) => matchesFilter(item, filter));
        }),
      }));
    } catch (err) {
      console.error("Failed to apply filters:", err);
      return groups;
    }
  }, [activeFilters, filterLogic, groups, matchesFilter, matchesSearch]);

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
    pendingValueUpdates.current.set(valueId, { value, timestamp: Date.now() });
    setTimeout(() => pendingValueUpdates.current.delete(valueId), 5000);
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
    // Handle creating new column values
    if (valueId.startsWith("create:")) {
      const parts = valueId.split(":");
      const itemId = parts[1];
      const columnId = parts[2];
      if (!itemId || !columnId) return;
      patchColumnValueInState(valueId, value);
      try {
        await fetch("/api/columns/values", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId, columnId, value }),
        });
      } catch (err) {
        console.error("Failed to create column value:", err);
      }
      return;
    }

    let oldValue: unknown = undefined;
    setGroups((prev) => {
      for (const g of prev) {
        for (const it of g.items) {
          const cv = it.columnValues.find((c) => c.id === valueId);
          if (cv) { oldValue = cv.value; break; }
        }
        if (oldValue !== undefined) break;
      }
      return prev;
    });

    patchColumnValueInState(valueId, value);

    try {
      const res = await fetch(`/api/columns/values/${valueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      if (!res.ok) throw new Error('PATCH failed');
    } catch (err) {
      console.error("Failed to update value:", err);
      pendingValueUpdates.current.delete(valueId);
      if (oldValue !== undefined) {
        patchColumnValueInState(valueId, oldValue);
      }
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

  const handleConnectItems = useCallback(async (payload: {
    action: "link" | "unlink";
    columnId: string;
    sourceItemId: string;
    targetItemId: string;
    targetBoardId: string;
  }) => {
    try {
      const res = await fetch("/api/columns/values/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) return;
      const json = await res.json();
      if (json.columnValue) {
        upsertColumnValueInState(payload.sourceItemId, json.columnValue as ColumnValue);
      }
      if (Array.isArray(json.derivedValues)) {
        for (const entry of json.derivedValues as ColumnValue[]) {
          upsertColumnValueInState(payload.sourceItemId, entry);
        }
      }
    } catch (err) {
      console.error("Failed to update connect links:", err);
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

  const handleUpdateItemFields = useCallback(async (
    itemId: string,
    patch: Partial<Pick<Item, "recurrenceRule" | "color" | "icon">>
  ) => {
    setGroups((prev) =>
      prev.map((group) => ({
        ...group,
        items: group.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
      }))
    );

    try {
      await fetch(`/api/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    } catch (err) {
      console.error("Failed to update item fields:", err);
    }
  }, []);

  const createItemInGroup = useCallback(async (groupId: string, name: string) => {
    if (!name) return null;

    try {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardId: board.id, groupId, name }),
      });
      const data = await res.json();

      if (res.ok) {
        const createdItem: Item = {
          ...data.item,
          _count: data.item._count ?? { comments: 0, subitems: 0 },
          comments: [],
          updates: [],
          activities: [],
          timeEntries: [],
          subitems: [],
        };
        setGroups((prev) =>
          prev.map((group) =>
            group.id === groupId
              ? {
                  ...group,
                  items: [...group.items, createdItem],
                }
              : group
          )
        );
        return createdItem;
      }
    } catch (err) {
      console.error("Failed to create item:", err);
    }
    return null;
  }, [board.id]);

  const handleAddItem = useCallback(async (groupId: string) => {
    const name = newItemName[groupId]?.trim();
    if (!name) return;
    await createItemInGroup(groupId, name);
    setNewItemName((prev) => ({ ...prev, [groupId]: "" }));
    setShowNewItem((prev) => ({ ...prev, [groupId]: false }));
  }, [createItemInGroup, newItemName]);


  // Handle cross-lane drag: finds the status columnValue from groups state

  const statusColumn = columns.find((column) => column.columnType === "STATUS");

  // Build a map of itemId -> status columnValue ID from live groups state
  const itemStatusCvMap = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    if (!statusColumn) return;
    const map = new Map<string, string>();
    for (const g of groups) {
      for (const item of g.items) {
        const cv = (item as any).columnValues?.find((cv: any) => cv.column?.id === statusColumn.id);
        if (cv) map.set(item.id, cv.id);
      }
    }
    itemStatusCvMap.current = map;
    console.log('[KANBAN] itemStatusCvMap built', { size: map.size, sampleKeys: [...map.keys()].slice(0,3) });
  }, [groups, statusColumn]);

  const handleKanbanCrossLane = useCallback(async (itemId: string, destinationLane: number) => {
    const cvId = itemStatusCvMap.current.get(itemId);
    console.log('[KANBAN] handleKanbanCrossLane', { itemId, cvId, destLane: destinationLane });
    if (cvId) {
      handleUpdateValue(cvId, destinationLane);
    } else {
      console.warn('[KANBAN] could not find status columnValue for item', itemId);
    }
  }, [handleUpdateValue]);

  const handleCreateKanbanItem = useCallback(async (statusIndex: number) => {
    const targetGroup = groups[0];
    if (!targetGroup) return;
    const createdItem = await createItemInGroup(targetGroup.id, "New Item");
    if (!createdItem) return;
    const statusColumn = columns.find((column) => column.columnType === "STATUS");
    if (!statusColumn) return;
    const statusCv = createdItem.columnValues.find((value) => value.column.id === statusColumn.id);
    if (!statusCv) return;
    handleUpdateValue(statusCv.id, statusIndex);
  }, [columns, createItemInGroup, groups, handleUpdateValue]);

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

  const handleReorderTableItems = useCallback(async (
    itemId: string,
    sourceGroupId: string,
    destinationGroupId: string,
    destinationIndex: number
  ) => {
    let updates: Array<{ id: string; groupId: string; position: number }> = [];

    setGroups((prev) => {
      const sourceGroup = prev.find((group) => group.id === sourceGroupId);
      const destinationGroup = prev.find((group) => group.id === destinationGroupId);
      if (!sourceGroup || !destinationGroup) return prev;

      const sourceItems = [...sourceGroup.items];
      const sourceIndex = sourceItems.findIndex((item) => item.id === itemId);
      if (sourceIndex < 0) return prev;

      const [movedItem] = sourceItems.splice(sourceIndex, 1);
      if (!movedItem) return prev;

      const destinationItems = sourceGroupId === destinationGroupId ? sourceItems : [...destinationGroup.items];
      const nextIndex = Math.max(0, Math.min(destinationIndex, destinationItems.length));
      destinationItems.splice(nextIndex, 0, { ...movedItem, groupId: destinationGroupId });

      const nextGroups = prev.map((group) => {
        if (group.id === sourceGroupId && group.id === destinationGroupId) {
          return {
            ...group,
            items: destinationItems.map((item, index) => ({ ...item, position: index })),
          };
        }
        if (group.id === sourceGroupId) {
          return {
            ...group,
            items: sourceItems.map((item, index) => ({ ...item, position: index })),
          };
        }
        if (group.id === destinationGroupId) {
          return {
            ...group,
            items: destinationItems.map((item, index) => ({ ...item, position: index })),
          };
        }
        return group;
      });

      const changedGroups = new Set([sourceGroupId, destinationGroupId]);
      updates = nextGroups
        .filter((group) => changedGroups.has(group.id))
        .flatMap((group) => group.items.map((item, index) => ({ id: item.id, groupId: group.id, position: index })));

      return nextGroups;
    });

    await Promise.all(
      updates.map((update) =>
        fetch(`/api/items/${update.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            groupId: update.groupId,
            position: update.position,
          }),
        })
      )
    );
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

  const handleRenameGroup = useCallback(async (groupId: string, name: string) => {
    const nextName = name.trim();
    if (!nextName) return;

    setGroups((prev) => prev.map((group) => (group.id === groupId ? { ...group, name: nextName } : group)));
    try {
      await fetch(`/api/groups/${groupId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nextName }),
      });
    } catch (err) {
      console.error("Failed to rename group:", err);
    }
  }, []);

  const handleUpdateGroupColor = useCallback(async (groupId: string, color: string) => {
    setGroups((prev) => prev.map((group) => (group.id === groupId ? { ...group, color } : group)));
    try {
      await fetch(`/api/groups/${groupId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color }),
      });
    } catch (err) {
      console.error("Failed to update group color:", err);
    }
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
    fetch(`/api/boards/${board.id}/views`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setSavedViews(data?.views ?? []))
      .catch(() => {});
  }, [board.id]);

  const handleSaveView = async () => {
    const name = window.prompt("Name this view");
    if (!name?.trim()) return;
    const payload = {
      name: name.trim(),
      filters: {
        logic: filterLogic,
        conditions: filters,
        searchQuery,
        viewMode,
      },
    };
    const res = await fetch(`/api/boards/${board.id}/views`, {
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
    setViewMode(view.filters?.viewMode ?? "TABLE");
    setSortState(null);
    setFilterLogic(view.filters?.logic ?? "AND");
    setFilters(view.filters?.conditions ?? []);
    setSearchQuery(view.filters?.searchQuery ?? "");
  };

  useEffect(() => {
    if (!toastMessage) return;
    const timeout = window.setTimeout(() => setToastMessage(null), 2800);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

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
    const formData = new FormData();
    formData.append("boardId", board.id);
    formData.append("file", file);
    const res = await fetch("/api/boards/import-csv", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) {
      window.alert(data.error ?? "Import failed");
      return;
    }
    const summary = [
      `Rows imported: ${data.rowsImported ?? 0}`,
      `Columns created: ${Array.isArray(data.columnsCreated) ? data.columnsCreated.length : 0}`,
      `Errors: ${Array.isArray(data.errors) ? data.errors.length : 0}`,
    ].join("\\n");
    window.alert(summary);
    window.location.reload();
  };

  const createShareLink = useCallback(async () => {
    setShareLoading(true);
    setShareCopyError(false);
    try {
      const payload: { boardId: string; expiresAt?: string } = { boardId: board.id };
      if (shareExpiry) payload.expiresAt = new Date(shareExpiry).toISOString();

      const res = await fetch("/api/guest-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setToastMessage("Failed to create share link");
        return null;
      }
      const data = await res.json();
      const nextUrl = data.shareUrl as string;
      setShareUrl(nextUrl);
      setToastMessage("Share link created");
      return nextUrl;
    } catch {
      setToastMessage("Failed to create share link");
      return null;
    } finally {
      setShareLoading(false);
    }
  }, [board.id, shareExpiry]);

  const copyShareUrl = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      setShareCopyError(false);
      setToastMessage("Share link copied");
      window.setTimeout(() => setShareCopied(false), 1600);
    } catch {
      setShareCopyError(true);
      setToastMessage("Clipboard blocked. Copy manually.");
    }
  }, [shareUrl]);

  const handleShareBoard = () => {
    setShowShareDialog(true);
    if (!shareUrl && !shareLoading) {
      createShareLink().catch(() => {});
    }
  };

  const handleImportMonday = async () => {
    if (!mondayImportFile) return;
    setMondayImportLoading(true);
    setMondayImportSummary(null);
    try {
      const formData = new FormData();
      formData.append("boardId", board.id);
      formData.append("file", mondayImportFile);
      const res = await fetch("/api/boards/import-monday", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setMondayImportSummary(data.error ?? "Monday import failed");
        return;
      }
      const summary = [
        `Rows imported: ${data.rowsImported ?? 0}`,
        `Groups created: ${Array.isArray(data.groupsCreated) ? data.groupsCreated.length : 0}`,
        `Columns created: ${Array.isArray(data.columnsCreated) ? data.columnsCreated.length : 0}`,
        `Errors: ${Array.isArray(data.errors) ? data.errors.length : 0}`,
      ].join("\n");
      setMondayImportSummary(summary);
      setToastMessage("Monday import complete");
      window.setTimeout(() => window.location.reload(), 800);
    } catch {
      setMondayImportSummary("Monday import failed");
    } finally {
      setMondayImportLoading(false);
    }
  };

  const handleFetchMondayBoards = async () => {
    if (!mondayApiToken.trim()) {
      setMondayApiError("Please enter your Monday.com API token");
      return;
    }
    setMondayApiFetching(true);
    setMondayApiError(null);
    try {
      const res = await fetch(`/api/boards/import-monday-api?token=${encodeURIComponent(mondayApiToken.trim())}`);
      const data = await res.json();
      if (!res.ok) {
        setMondayApiError(data.error ?? "Failed to fetch boards");
        return;
      }
      setMondayApiBoards(data.boards ?? []);
      if (data.boards?.length === 0) {
        setMondayApiError("No boards found. Check your token and try again.");
      }
    } catch {
      setMondayApiError("Failed to connect to Monday.com API");
    } finally {
      setMondayApiFetching(false);
    }
  };

  const handleImportMondayApi = async () => {
    if (mondaySelectedBoards.size === 0) {
      setMondayImportSummary("Select at least one board to import");
      return;
    }
    setMondayImportLoading(true);
    setMondayImportSummary(null);
    try {
      const res = await fetch("/api/boards/import-monday-api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: mondayApiToken.trim(),
          mondayBoardIds: Array.from(mondaySelectedBoards),
          boardId: board.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMondayImportSummary(data.error ?? "Monday API import failed");
        return;
      }
      const summary = [
        `Rows imported: ${data.rowsImported ?? 0}`,
        `Groups created: ${Array.isArray(data.groupsCreated) ? data.groupsCreated.length : 0}`,
        `Columns created: ${Array.isArray(data.columnsCreated) ? data.columnsCreated.length : 0}`,
        `Errors: ${Array.isArray(data.errors) ? data.errors.length : 0}`,
      ].join("\n");
      setMondayImportSummary(summary);
      setToastMessage("Monday.com import complete");
    } catch {
      setMondayImportSummary("Monday API import failed");
    } finally {
      setMondayImportLoading(false);
    }
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

  const addFilterRow = useCallback(() => {
    const firstColumn = columns[0];
    if (!firstColumn) return;
    setFilters((prev) => [...prev, getDefaultFilter(firstColumn.id, firstColumn.columnType)]);
  }, [columns]);

  const updateFilterRow = useCallback((filterId: string, patch: Partial<FilterState>) => {
    setFilters((prev) => prev.map((filter) => (filter.id === filterId ? { ...filter, ...patch } : filter)));
  }, []);

  return (
<>
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
          <span className="font-medium text-foreground">{boardName}</span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {editingBoardName ? (
            <Input
              className="h-9 w-[320px] text-2xl font-bold"
              value={boardName}
              autoFocus
              onChange={(event) => setBoardName(event.target.value)}
              onBlur={async () => {
                const nextName = boardName.trim();
                if (!nextName) { setBoardName(board.name); setEditingBoardName(false); return; }
                const res = await fetch(`/api/boards/${board.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name: nextName }),
                });
                if (!res.ok) setBoardName(board.name);
                setEditingBoardName(false);
              }}
              onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
            />
          ) : (
            <h1
              className="text-2xl font-bold tracking-tight flex items-center gap-2 cursor-pointer"
              onDoubleClick={() => setEditingBoardName(true)}
              title="Double-click to rename"
            >
              <span className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
                <Edit2 className="h-4 w-4" />
              </span>
              <span className="relative" title="Change board color">
                <input
                  type="color"
                  value={boardColor}
                  onChange={(e) => {
                    const next = e.target.value;
                    setBoardColor(next);
                    fetch(`/api/boards/${board.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ color: next }),
                    });
                  }}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
                <span className="block h-6 w-6 rounded-full border" style={{ backgroundColor: boardColor }} />
              </span>
              {boardName}
            </h1>
          )}
          {onlineCount > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              {onlineCount} online
            </span>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as ViewMode)}>
              <TabsList className="h-8 bg-muted/70 flex-wrap">
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
                <TabsTrigger value="GANTT" className="px-2 text-xs">
                  <CalendarDays className="mr-1 h-3 w-3" /> Gantt
                </TabsTrigger>
                <TabsTrigger value="SPRINTS" className="px-2 text-xs">
                  <span className="mr-1">🏃</span> Sprints
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search items"
              className="h-8 w-52 text-xs"
            />
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8">
                  <Filter className="mr-1 h-3.5 w-3.5" /> Filter
                  {activeFilters.length > 0 && (
                    <Badge variant="secondary" className="ml-1 rounded-full px-1.5 py-0 text-[10px]">
                      {activeFilters.length}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[560px] space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Filters</p>
                  <div className="flex items-center gap-2">
                    <select
                      className="h-7 rounded-md border bg-background px-2 text-xs"
                      value={filterLogic}
                      onChange={(event) => setFilterLogic(event.target.value as FilterLogic)}
                    >
                      <option value="AND">Match all (AND)</option>
                      <option value="OR">Match any (OR)</option>
                    </select>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setFilters([])}>
                      Clear all
                    </Button>
                  </div>
                </div>

                {filters.length === 0 && (
                  <p className="text-xs text-muted-foreground">No filters yet.</p>
                )}

                {filters.map((filter) => {
                  const selectedColumn = columns.find((column) => column.id === filter.columnId);
                  if (!selectedColumn) return null;
                  const operators = getFilterOperators(selectedColumn.columnType);
                  const operator = operators.find((entry) => entry.value === filter.operator) ?? operators[0];
                  const needsValue = Boolean(operator?.needsValue);
                  const statusMeta = getStatusMeta(selectedColumn);

                  return (
                    <div key={filter.id} className="grid grid-cols-[1fr_0.8fr_1fr_auto] items-center gap-2">
                      <select
                        className="h-8 rounded-md border bg-background px-2 text-xs"
                        value={selectedColumn.id}
                        onChange={(event) => {
                          const nextColumn = columns.find((column) => column.id === event.target.value);
                          if (!nextColumn) return;
                          const nextDefault = getDefaultFilter(nextColumn.id, nextColumn.columnType);
                          updateFilterRow(filter.id, {
                            columnId: nextDefault.columnId,
                            operator: nextDefault.operator,
                            value: "",
                          });
                        }}
                      >
                        {columns.map((column) => (
                          <option key={column.id} value={column.id}>
                            {column.title}
                          </option>
                        ))}
                      </select>

                      <select
                        className="h-8 rounded-md border bg-background px-2 text-xs"
                        value={filter.operator}
                        onChange={(event) => updateFilterRow(filter.id, { operator: event.target.value as FilterOperator })}
                      >
                        {operators.map((entry) => (
                          <option key={`${selectedColumn.id}-${entry.value}`} value={entry.value}>
                            {entry.label}
                          </option>
                        ))}
                      </select>

                      {needsValue ? (
                        selectedColumn.columnType === "STATUS" ? (
                          <select
                            className="h-8 rounded-md border bg-background px-2 text-xs"
                            value={filter.value}
                            onChange={(event) => updateFilterRow(filter.id, { value: event.target.value })}
                          >
                            <option value="">Select status</option>
                            {statusMeta.labels.map((label, index) => (
                              <option key={`${selectedColumn.id}-status-${label}`} value={String(index)}>
                                {label}
                              </option>
                            ))}
                          </select>
                        ) : selectedColumn.columnType === "PEOPLE" ? (
                          <select
                            className="h-8 rounded-md border bg-background px-2 text-xs"
                            value={filter.value}
                            onChange={(event) => updateFilterRow(filter.id, { value: event.target.value })}
                          >
                            <option value="">Select member</option>
                            {board.members.map((member) => (
                              <option key={member.user.id} value={member.user.id}>
                                {member.user.firstName} {member.user.lastName}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <Input
                            type={selectedColumn.columnType === "NUMBER" || selectedColumn.columnType === "PROGRESS" || selectedColumn.columnType === "RATING" ? "number" : "text"}
                            value={filter.value}
                            onChange={(event) => updateFilterRow(filter.id, { value: event.target.value })}
                            className="h-8 text-xs"
                          />
                        )
                      ) : (
                        <div className="text-xs text-muted-foreground">No value needed</div>
                      )}

                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8"
                        onClick={() => setFilters((prev) => prev.filter((entry) => entry.id !== filter.id))}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}

                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={addFilterRow}>
                  <Plus className="mr-1 h-3 w-3" /> Add filter
                </Button>
              </PopoverContent>
            </Popover>
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
              Import CSV/XLSX
            </Button>
            <Button variant="ghost" size="sm" className="h-8" onClick={() => setShowMondayImportDialog(true)}>
              Import Monday.com
            </Button>
            <Button
              variant={shareUrl ? "secondary" : "ghost"}
              size="sm"
              className="h-8"
              onClick={handleShareBoard}
            >
              Share
              {shareUrl && <span className="ml-1 h-2 w-2 rounded-full bg-mamba-500" />}
            </Button>
            <Button variant="ghost" size="sm" className="h-8" onClick={() => setShowColumnPermissions(true)}>
              <Shield className="mr-1 h-3.5 w-3.5" /> Permissions
            </Button>
 <Button variant="ghost" size="sm" className="h-8" onClick={() => setShowEmailSettings(true)}>
   <Mail className="mr-1 h-3.5 w-3.5" /> Email
 </Button>
            <Button
              variant={showAiPanel ? "default" : "ghost"}
              size="sm"
              className={cn("h-8", showAiPanel && "bg-mamba-600 hover:bg-mamba-700")}
              onClick={() => setShowAiPanel((prev) => !prev)}
            >
              <Sparkles className="mr-1 h-3.5 w-3.5" /> AI
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() => setShowPollModal(true)}
            >
              <span className="mr-1">📊</span> Poll
            </Button>
            <input
              ref={importInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
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
        {showAiPanel && (
          <div className="mt-3 max-w-md">
            <AIPanel boardId={board.id} onClose={() => setShowAiPanel(false)} />
          </div>
        )}
      </div>

      {/* Floating bulk edit toolbar */}
      {selectedItemIds.size > 0 && (
        <div className="border-b bg-muted/30 px-4 py-2">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground">
              {selectedItemIds.size} selected
            </span>
            <div className="flex items-center gap-1">
              <select
                className="h-7 rounded-md border bg-background px-2 text-xs"
                defaultValue=""
                onChange={(e) => {
                  if (!e.target.value) return;
                  const [colId, colType] = e.target.value.split("::");
                  const col = columns.find((c) => c.id === colId);
                  if (!col) return;
                  setSelectedBulkColumn({ id: colId, type: colType as string, title: col.title, config: col.config });
                  setBulkEditValue("");
                  setShowBulkValueEditor(true);
                  e.target.value = "";
                }}
              >
                <option value="" disabled>Edit column...</option>
                {columns.map((col) => (
                  <option key={col.id} value={`${col.id}::${col.columnType}`}>
                    {col.title}
                  </option>
                ))}
              </select>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={handleBulkDelete}>
                <Trash2 className="mr-1 h-3 w-3" /> Delete
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={clearSelection}>
                Clear
              </Button>
            </div>
          </div>
        </div>
      )}

      {showBulkValueEditor && selectedBulkColumn && (
        <BulkValueEditor
          column={{ id: selectedBulkColumn.id, title: selectedBulkColumn.title ?? "", type: selectedBulkColumn.type, config: selectedBulkColumn.config }}
          selectedCount={selectedItemIds.size}
          onClose={() => { setShowBulkValueEditor(false); setSelectedBulkColumn(null); }}
          onApply={(val) => { setBulkEditValue(val); handleBulkColumnEdit(); }}
        />
      )}

      <div className="flex-1 overflow-hidden">
        {viewMode === "TABLE" && (
          <TableView
            boardId={board.id}
            groups={filteredGroups}
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
            onConnectItems={handleConnectItems}
            newItemName={newItemName}
            setNewItemName={setNewItemName}
            showNewItem={showNewItem}
            setShowNewItem={setShowNewItem}
            onAddItem={handleAddItem}
            onToggleCollapse={toggleCollapse}
            onDeleteItem={handleDeleteItem}
            onSelectItem={(itemId) => setSelectedItemId(itemId)}
            expandedSubitems={expandedSubitems}
            searchQuery={normalizedSearchQuery}
            onToggleSubitems={(itemId) =>
              setExpandedSubitems((prev) => ({ ...prev, [itemId]: !prev[itemId] }))
            }
            selectedItemIds={selectedItemIds}
            onToggleItemSelect={toggleItemSelect}
            onSelectAll={() => selectAll(filteredGroups.flatMap((g) => g.items.map((i) => i.id)))}
            onReorderItems={handleReorderTableItems}
            onRenameGroup={handleRenameGroup}
            onUpdateGroupColor={handleUpdateGroupColor}
            setColumns={setColumns}
          />
        )}

        {viewMode === "KANBAN" && (
          <KanbanView
            groups={filteredGroups}
            columns={columns}
            onCycleStatus={handleCycleStatus}
            onUpdateValue={handleUpdateValue}
            onKanbanCrossLane={handleKanbanCrossLane}
            onCreateItemInLane={handleCreateKanbanItem}
            searchQuery={normalizedSearchQuery}
            onSelectItem={(itemId) => setSelectedItemId(itemId)}
            onReorderItems={handleReorderTableItems}
            allColumns={columns}
          />
        )}

        {viewMode === "TIMELINE" && (
          <TimelineView groups={filteredGroups} columns={columns} searchQuery={normalizedSearchQuery} />
        )}

        {viewMode === "CALENDAR" && (
          <CalendarView
            month={calendarMonth}
            onChangeMonth={setCalendarMonth}
            groups={filteredGroups}
            columns={columns}
            searchQuery={normalizedSearchQuery}
            onSelectItem={(itemId) => setSelectedItemId(itemId)}
          />
        )}

        {viewMode === "GANTT" && (
          <GanttView
            boardId={board.id}
            groups={filteredGroups}
            columns={columns}
            onUpdateValue={handleUpdateValue}
            onSelectItem={(itemId) => setSelectedItemId(itemId)}
            onCreateItemInLane={async (groupId, name, startDate, endDate) => {
              const res = await fetch("/api/items", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ boardId: board.id, groupId, name }),
              });
              if (res.ok) {
                const { item } = await res.json();
                if (startDate && endDate) {
                  const dateCol = columns.find((c) => c.columnType === "DATE" || c.columnType === "TIMELINE");
                  if (dateCol) {
                    await fetch(`/api/columns/values`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        itemId: item.id,
                        columnId: dateCol.id,
                        value: { start: startDate.toISOString(), end: endDate.toISOString() },
                      }),
                    });
                  }
                }
                // Refresh groups
                const boardRes = await fetch(`/api/boards/${board.id}`);
                if (boardRes.ok) {
                  const data = await boardRes.json();
                  setGroups(data.board.groups);
                }
              }
            }}
          />
        )}

        {viewMode === "SPRINTS" && (
          <div className="flex-1 overflow-auto p-4">
            <SprintPanel
              boardId={board.id}
              sprints={boardSprints}
              onRefresh={() => {
                setSprintsLoaded(false);
              }}
            />
          </div>
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
        boardId={board.id}
        workspaceId={board.workspace.id}
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
        onUpdateItemFields={handleUpdateItemFields}
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
        <AddColumnModal boardId={board.id} columns={columns} onClose={() => setShowColumnModal(false)} />
      )}
    </div>
 <ColumnPermissionsDialog
   boardId={board.id}
   columns={columns.map((c) => ({ id: c.id, title: c.title, columnType: c.columnType }))}
   open={showColumnPermissions}
   onClose={() => setShowColumnPermissions(false)}
   onUpdate={() => setShowColumnPermissions(false)}
 />
 {showEmailSettings && (
   <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
     <div className="w-full max-w-lg rounded-lg border bg-background p-0 shadow-xl">
       <div className="flex items-center justify-between border-b px-4 py-3">
         <h2 className="text-sm font-semibold">Email-to-Board Settings</h2>
         <button className="text-muted-foreground hover:text-foreground" onClick={() => setShowEmailSettings(false)}>✕</button>
       </div>
       <div className="max-h-[70vh] overflow-auto p-4">
         <EmailIngestionSettings
           boardId={board.id}
           groups={groups.map((g) => ({ id: g.id, name: g.name }))}
         />
       </div>
     </div>
   </div>
 )}
 <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
   <DialogContent>
     <DialogHeader>
       <DialogTitle>Share Board</DialogTitle>
     </DialogHeader>
     <div className="space-y-3">
       <label className="space-y-1 text-xs text-muted-foreground">
         Link expiry (optional)
         <Input
           type="datetime-local"
           value={shareExpiry}
           onChange={(event) => setShareExpiry(event.target.value)}
           className="h-8 text-xs"
         />
       </label>
       <Button
         size="sm"
         variant="outline"
         className="h-8"
         onClick={() => createShareLink().catch(() => {})}
         disabled={shareLoading}
       >
         {shareLoading ? "Generating..." : shareUrl ? "Regenerate Link" : "Generate Link"}
       </Button>
       <div className="space-y-1">
         <label className="text-xs text-muted-foreground">Share URL</label>
         <div className="flex items-center gap-2">
           <Input value={shareUrl} readOnly className="h-8 text-xs" />
           <Button size="sm" className="h-8" onClick={() => copyShareUrl().catch(() => {})} disabled={!shareUrl}>
             {shareCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
           </Button>
         </div>
       </div>
       {shareCopyError && (
         <p className="text-xs text-muted-foreground">
           Clipboard permission failed. Select and copy the URL manually.
         </p>
       )}
     </div>
   </DialogContent>
 </Dialog>
 <Dialog open={showMondayImportDialog} onOpenChange={setShowMondayImportDialog}>
   <DialogContent>
     <DialogHeader>
       <DialogTitle>Import from Monday.com</DialogTitle>
     </DialogHeader>
     <div className="space-y-3">
       <div className="flex items-center gap-2">
         <Button
           type="button"
           size="sm"
           variant={mondayImportMode === "csv" ? "default" : "outline"}
           onClick={() => setMondayImportMode("csv")}
         >
           CSV Mode
         </Button>
         <Button
           type="button"
           size="sm"
           variant={mondayImportMode === "api" ? "default" : "outline"}
           onClick={() => setMondayImportMode("api")}
         >
           API Mode
         </Button>
       </div>
       {mondayImportMode === "csv" ? (
         <div className="space-y-2">
           <Input
             type="file"
             accept=".csv,text/csv"
             className="h-9 text-xs"
             onChange={(event) => setMondayImportFile(event.target.files?.[0] ?? null)}
           />
           <Button
             size="sm"
             className="h-8"
             disabled={!mondayImportFile || mondayImportLoading}
             onClick={() => handleImportMonday().catch(() => {})}
           >
             {mondayImportLoading ? "Importing..." : "Import Monday CSV"}
           </Button>
         </div>
       ) : (
         <div className="space-y-3">
           <Input
             type="password"
             placeholder="Monday.com API token"
             className="h-9 text-xs"
             value={mondayApiToken}
             onChange={(e) => setMondayApiToken(e.target.value)}
           />
           <div className="flex items-center gap-2">
             <Button
               size="sm"
               className="h-8"
               disabled={mondayApiFetching || !mondayApiToken.trim()}
               onClick={() => handleFetchMondayBoards().catch(() => {})}
             >
               {mondayApiFetching ? "Fetching..." : "Fetch Boards"}
             </Button>
             <span className="text-[10px] text-muted-foreground">
               Get your token from monday.com → Admin → API
             </span>
           </div>
           {mondayApiError && (
             <p className="text-xs text-destructive">{mondayApiError}</p>
           )}
           {mondayApiBoards.length > 0 && (
             <div className="space-y-1">
               <p className="text-xs font-medium">Select boards to import ({mondaySelectedBoards.size} selected)</p>
               <div className="max-h-40 overflow-y-auto rounded-md border">
                 {mondayApiBoards.map((b) => (
                   <label
                     key={b.id}
                     className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent/30 cursor-pointer"
                   >
                     <input
                       type="checkbox"
                       checked={mondaySelectedBoards.has(b.id)}
                       onChange={() => {
                         setMondaySelectedBoards((prev) => {
                           const next = new Set(prev);
                           if (next.has(b.id)) next.delete(b.id);
                           else next.add(b.id);
                           return next;
                         });
                       }}
                       className="h-3.5 w-3.5 rounded"
                     />
                     <span className="truncate">{b.name}</span>
                   </label>
                 ))}
               </div>
             </div>
           )}
           {mondayApiBoards.length > 0 && (
             <Button
               size="sm"
               className="h-8 w-full"
               disabled={mondaySelectedBoards.size === 0 || mondayImportLoading}
               onClick={() => handleImportMondayApi().catch(() => {})}
             >
               {mondayImportLoading ? "Importing..." : `Import ${mondaySelectedBoards.size} Board(s)`}
             </Button>
           )}
         </div>
       )}
       {mondayImportSummary && (
         <pre className="max-h-32 overflow-auto rounded border bg-muted/30 p-2 text-[11px]">{mondayImportSummary}</pre>
       )}
     </div>
   </DialogContent>
 </Dialog>
 {toastMessage && (
   <div className="fixed right-4 top-4 z-[70] rounded-md border bg-card px-3 py-2 text-xs shadow-lg">
     {toastMessage}
   </div>
 )}
 {showPollModal && (
   <PollModal
     boardId={board.id}
     open={showPollModal}
     onClose={() => setShowPollModal(false)}
     onCreate={handleCreatePoll}
   />
 )}
 {/* Polls panel */}
 {polls.length > 0 && (
   <div className="border-t bg-muted/20 px-4 py-3">
     <details open={polls.length <= 3}>
       <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
         📊 Polls ({polls.length})
       </summary>
       <div className="mt-2 space-y-2 max-w-md">
         {polls.slice(0, 5).map((poll: any) => (
           <PollCard
             key={poll.id}
             poll={poll}
             currentUserId={user.id}
             onVote={handleVote}
             onRemoveVote={handleRemoveVote}
             onDelete={handleDeletePoll}
             isCreator={poll.creatorId === user.id}
           />
         ))}
         {polls.length > 5 && (
           <p className="text-xs text-muted-foreground">+{polls.length - 5} more polls</p>
         )}
       </div>
     </details>
   </div>
 )}
  </>
  );
}

function CalendarView({
  month,
  onChangeMonth,
  groups,
  columns,
  searchQuery,
  onSelectItem,
}: {
  month: Date;
  onChangeMonth: (month: Date) => void;
  groups: Group[];
  columns: Column[];
  searchQuery: string;
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
                    className={cn(
                      "block w-full truncate rounded bg-mamba-100 px-1.5 py-0.5 text-left text-[10px] text-mamba-800 hover:bg-mamba-200",
                      searchQuery && "ring-1 ring-mamba-400"
                    )}
                    title={`${item.icon ? `${item.icon} ` : ""}${item.name} • ${item.groupName}`}
                  >
                    {item.icon ? `${item.icon} ` : ""}{item.name}
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
  boardId,
  groups,
  columns,
  setColumns,
  sortState,
  getSortedItems,
  onSort,
  onResizeStart,
  onCycleStatus,
  onUpdateValue,
  onUploadFile,
  onConnectItems,
  newItemName,
  setNewItemName,
  showNewItem,
  setShowNewItem,
  onAddItem,
  onToggleCollapse,
  onDeleteItem,
  onSelectItem,
  expandedSubitems,
  searchQuery,
  onToggleSubitems,
  selectedItemIds,
  onToggleItemSelect,
  onSelectAll,
  onReorderItems,
  onRenameGroup,
  onUpdateGroupColor,
}: {
  boardId: string;
  groups: Group[];
  columns: Column[];
  sortState: SortState;
  getSortedItems: (items: Item[]) => Item[];
  onSort: (columnId: string) => void;
  onResizeStart: (columnId: string, startX: number, startWidth: number) => void;
  onCycleStatus: (itemId: string, cv: ColumnValue) => void;
  onUpdateValue: (valueId: string, value: unknown) => void;
  onUploadFile: (itemId: string, columnId: string, file: File) => void;
  onConnectItems: (payload: {
    action: "link" | "unlink";
    columnId: string;
    sourceItemId: string;
    targetItemId: string;
    targetBoardId: string;
  }) => void;
  newItemName: Record<string, string>;
  setNewItemName: Dispatch<SetStateAction<Record<string, string>>>;
  showNewItem: Record<string, boolean>;
  setShowNewItem: Dispatch<SetStateAction<Record<string, boolean>>>;
  onAddItem: (groupId: string) => void;
  onToggleCollapse: (groupId: string) => void;
  onDeleteItem: (itemId: string, groupId: string) => void;
  onSelectItem: (itemId: string) => void;
  expandedSubitems: Record<string, boolean>;
  searchQuery: string;
  onToggleSubitems: (itemId: string) => void;
  selectedItemIds: Set<string>;
  onToggleItemSelect: (itemId: string) => void;
  onSelectAll: () => void;
  onReorderItems: (itemId: string, sourceGroupId: string, destinationGroupId: string, destinationIndex: number) => void;
  onRenameGroup: (groupId: string, name: string) => void;
  onUpdateGroupColor: (groupId: string, color: string) => void;
  setColumns: Dispatch<SetStateAction<Column[]>>;
}) {
  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    if (
      result.source.droppableId === result.destination.droppableId &&
      result.source.index === result.destination.index
    ) {
      return;
    }

    onReorderItems(
      result.draggableId,
      result.source.droppableId,
      result.destination.droppableId,
      result.destination.index
    );
  };

  // Column drag reorder state
  const [columnDragIndex, setColumnDragIndex] = useState<number | null>(null);
  const [columnDropIndex, setColumnDropIndex] = useState<number | null>(null);

  const handleColumnDragStart = useCallback((index: number) => {
    setColumnDragIndex(index);
  }, []);

  const handleColumnDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    setColumnDropIndex(index);
  }, []);

  const handleColumnDrop = useCallback((targetIndex: number) => {
    if (columnDragIndex === null || columnDragIndex === targetIndex) {
      setColumnDragIndex(null);
      setColumnDropIndex(null);
      return;
    }
    const newColumns = [...columns];
    const [moved] = newColumns.splice(columnDragIndex, 1);
    newColumns.splice(targetIndex, 0, moved);
    setColumns(newColumns);
    // Persist new order to server
    newColumns.forEach((col, i) => {
      if (col.order !== i) {
        fetch(`/api/columns/${col.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: i }),
        });
      }
    });
    setColumnDragIndex(null);
    setColumnDropIndex(null);
  }, [columnDragIndex, columns, setColumns]);

  const summaryFormatter = useMemo(
    () => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }),
    []
  );
  const visibleItems = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const footerSummaryByColumn = useMemo(() => {
    const summary: Record<string, string> = {};
    for (const column of columns) {
      if (column.columnType === "NUMBER") {
        const values = visibleItems
          .map((item) => {
            const raw = item.columnValues.find((entry) => entry.column.id === column.id)?.value;
            if (typeof raw === "number") return raw;
            if (typeof raw === "string" && raw.trim() !== "") {
              const parsed = Number(raw);
              return Number.isFinite(parsed) ? parsed : null;
            }
            return null;
          })
          .filter((entry): entry is number => entry != null);
        const count = values.length;
        if (!count) {
          summary[column.id] = "Count 0";
          continue;
        }
        const sum = values.reduce((acc, value) => acc + value, 0);
        const avg = sum / count;
        summary[column.id] = `Σ ${summaryFormatter.format(sum)} · Avg ${summaryFormatter.format(avg)} · Count ${summaryFormatter.format(count)} · Min ${summaryFormatter.format(Math.min(...values))} · Max ${summaryFormatter.format(Math.max(...values))}`;
        continue;
      }

      if (column.columnType === "STATUS") {
        const count = visibleItems.reduce((acc, item) => {
          const value = item.columnValues.find((entry) => entry.column.id === column.id)?.value;
          if (value == null) return acc;
          if (typeof value === "string" && value.trim() === "") return acc;
          return acc + 1;
        }, 0);
        summary[column.id] = `Count ${summaryFormatter.format(count)}`;
      }
    }
    return summary;
  }, [columns, visibleItems, summaryFormatter]);

  return (
    <div className="h-full overflow-auto">
      <DragDropContext onDragEnd={handleDragEnd}>
        <table className="board-table w-full">
          <thead>
            <tr>
              <th className="w-10" />
              <th className="sticky left-0 min-w-[260px] bg-background">Item</th>
              {columns.map((column, colIndex) => {
                const isSorted = sortState?.columnId === column.id;
                const isDragging = columnDragIndex === colIndex;
                const isDragOver = columnDropIndex === colIndex && columnDragIndex !== colIndex;

                return (
                  <th
                    key={column.id}
                    style={{ width: column.width ?? 170 }}
                    className={cn(
                      "relative min-w-[130px] select-none transition-opacity",
                      isDragging && "opacity-50",
                      isDragOver && "bg-mamba-50"
                    )}
                    draggable
                    onDragStart={() => handleColumnDragStart(colIndex)}
                    onDragOver={(e) => handleColumnDragOver(e, colIndex)}
                    onDrop={() => handleColumnDrop(colIndex)}
                    onDragEnd={() => { setColumnDragIndex(null); setColumnDropIndex(null); }}
                  >
                    <div className="flex items-center gap-1">
                      <span
                        className="cursor-grab text-muted-foreground/40 hover:text-muted-foreground/80 active:cursor-grabbing"
                        title="Drag to reorder"
                      >
                        ⠿
                      </span>
                      <button
                        className="flex flex-1 items-center justify-between gap-2 text-left"
                        onClick={() => onSort(column.id)}
                      >
                        <span className="truncate">{column.title}</span>
                        {isSorted && (
                          <span className="text-[10px] text-mamba-700">
                            {sortState?.direction === "asc" ? "▲" : "▼"}
                          </span>
                        )}
                      </button>
                    </div>
                    <div
                      className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent hover:bg-mamba-200"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onResizeStart(column.id, event.clientX, column.width ?? 170);
                      }}
                    />
                  </th>
                );
              })}
              <th className="w-10" />
            </tr>
          </thead>

          {groups.map((group) => (
            <GroupRows
              key={group.id}
              boardId={boardId}
              group={group}
              columns={columns}
              sortedItems={getSortedItems(group.items)}
              onCycleStatus={onCycleStatus}
              onUpdateValue={onUpdateValue}
              onUploadFile={onUploadFile}
              onConnectItems={onConnectItems}
              newItemName={newItemName}
              setNewItemName={setNewItemName}
              showNewItem={showNewItem}
              setShowNewItem={setShowNewItem}
              onAddItem={onAddItem}
              onToggleCollapse={onToggleCollapse}
              onDeleteItem={onDeleteItem}
              onSelectItem={onSelectItem}
              expandedSubitems={expandedSubitems}
              searchQuery={searchQuery}
              onToggleSubitems={onToggleSubitems}
              selectedItemIds={selectedItemIds}
              onToggleItemSelect={onToggleItemSelect}
              onRenameGroup={onRenameGroup}
              onUpdateGroupColor={onUpdateGroupColor}
            />
          ))}

          <tfoot className="sticky bottom-0 z-20">
            <tr className="bg-muted/60">
              <td className="w-10 border-t px-2 py-2 text-[11px] text-muted-foreground" />
              <td className="sticky left-0 min-w-[260px] border-t bg-muted/60 px-3 py-2 text-[11px] font-medium text-muted-foreground">
                Summary ({summaryFormatter.format(visibleItems.length)} items)
              </td>
              {columns.map((column) => (
                <td
                  key={`summary-${column.id}`}
                  className="min-w-[130px] border-t px-2 py-2 text-right text-[11px] text-muted-foreground"
                >
                  {footerSummaryByColumn[column.id] ?? "—"}
                </td>
              ))}
              <td className="w-10 border-t px-1 py-2 text-[11px] text-muted-foreground" />
            </tr>
          </tfoot>
        </table>
      </DragDropContext>
    </div>
  );
}

function GroupRows({
  boardId,
  group,
  columns,
  sortedItems,
  onCycleStatus,
  onUpdateValue,
  onUploadFile,
  onConnectItems,
  newItemName,
  setNewItemName,
  showNewItem,
  setShowNewItem,
  onAddItem,
  onToggleCollapse,
  onDeleteItem,
  onSelectItem,
  expandedSubitems,
  searchQuery,
  onToggleSubitems,
  selectedItemIds,
  onToggleItemSelect,
  onRenameGroup,
  onUpdateGroupColor,
}: {
  boardId: string;
  group: Group;
  columns: Column[];
  sortedItems: Item[];
  onCycleStatus: (itemId: string, cv: ColumnValue) => void;
  onUpdateValue: (valueId: string, value: unknown) => void;
  onUploadFile: (itemId: string, columnId: string, file: File) => void;
  onConnectItems: (payload: {
    action: "link" | "unlink";
    columnId: string;
    sourceItemId: string;
    targetItemId: string;
    targetBoardId: string;
  }) => void;
  newItemName: Record<string, string>;
  setNewItemName: Dispatch<SetStateAction<Record<string, string>>>;
  showNewItem: Record<string, boolean>;
  setShowNewItem: Dispatch<SetStateAction<Record<string, boolean>>>;
  onAddItem: (groupId: string) => void;
  onToggleCollapse: (groupId: string) => void;
  onDeleteItem: (itemId: string, groupId: string) => void;
  onSelectItem: (itemId: string) => void;
  expandedSubitems: Record<string, boolean>;
  searchQuery: string;
  onToggleSubitems: (itemId: string) => void;
  selectedItemIds: Set<string>;
  onToggleItemSelect: (itemId: string) => void;
  onRenameGroup: (groupId: string, name: string) => void;
  onUpdateGroupColor: (groupId: string, color: string) => void;
}) {
  const statusColumn = columns.find((column) => column.columnType === "STATUS");
  const [editingGroupName, setEditingGroupName] = useState(false);
  const [groupNameDraft, setGroupNameDraft] = useState(group.name);

  useEffect(() => {
    setGroupNameDraft(group.name);
  }, [group.name]);

  return (
    <Droppable droppableId={group.id}>
      {(provided, snapshot) => (
        <tbody ref={provided.innerRef} {...provided.droppableProps}>
          <tr className="group-row">
            <td colSpan={columns.length + 3} className="p-0">
              <div className="group-header" style={{ borderLeftColor: group.color, backgroundColor: `${group.color}11` }}>
                <button className="flex items-center gap-1" onClick={() => onToggleCollapse(group.id)}>
                  {group.isCollapsed ? (
                    <ChevronRight className="h-4 w-4" style={{ color: group.color }} />
                  ) : (
                    <ChevronDown className="h-4 w-4" style={{ color: group.color }} />
                  )}
                </button>
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="h-3.5 w-3.5 rounded-full border"
                      style={{ backgroundColor: group.color }}
                      aria-label="Set group color"
                    />
                  </PopoverTrigger>
                  <PopoverContent className="w-40 space-y-2">
                    <input
                      type="color"
                      value={group.color}
                      className="h-8 w-full rounded border p-0.5"
                      onChange={(event) => onUpdateGroupColor(group.id, event.target.value)}
                    />
                    <div className="grid grid-cols-4 gap-1">
                      {ITEM_COLOR_PRESETS.map((preset) => (
                        <button
                          key={`${group.id}-${preset}`}
                          type="button"
                          className={cn(
                            "h-5 w-5 rounded border",
                            group.color === preset && "ring-1 ring-foreground"
                          )}
                          style={{ backgroundColor: preset }}
                          onClick={() => onUpdateGroupColor(group.id, preset)}
                        />
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
                {editingGroupName ? (
                  <Input
                    value={groupNameDraft}
                    className="h-7 max-w-[220px] text-sm"
                    autoFocus
                    onChange={(event) => setGroupNameDraft(event.target.value)}
                    onBlur={() => {
                      onRenameGroup(group.id, groupNameDraft);
                      setEditingGroupName(false);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      event.currentTarget.blur();
                    }}
                  />
                ) : (
                  <span className="cursor-text" style={{ color: group.color }} onDoubleClick={() => setEditingGroupName(true)}>
                    {group.name}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">({group.items.length})</span>
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                  onClick={() => setEditingGroupName(true)}
                  aria-label="Rename group"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="ml-auto h-7 w-7">
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setEditingGroupName(true)}>
                      <Edit2 className="mr-2 h-3.5 w-3.5" /> Rename
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </td>
          </tr>

          {!group.isCollapsed && sortedItems.map((item, index) => (
            <Draggable key={item.id} draggableId={item.id} index={index}>
              {(dragProvided, dragSnapshot) => {
                const itemTint = item.color ? hexToRgba(item.color, 0.09) : undefined;
                return (
                  <tr
                    ref={dragProvided.innerRef}
                    {...dragProvided.draggableProps}
                    className={cn(
                      "item-row",
                      searchQuery && "bg-mamba-50/35",
                      snapshot.isDraggingOver && "bg-mamba-50/30",
                      dragSnapshot.isDragging && "bg-card shadow-lg"
                    )}
                    onClick={() => onSelectItem(item.id)}
                    style={
                      item.color
                        ? {
                            borderLeft: `3px solid ${item.color}`,
                          }
                        : undefined
                    }
                  >
                  <td className="w-10 px-2" style={itemTint ? { backgroundColor: itemTint } : undefined}>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="cursor-grab rounded p-0.5 text-muted-foreground/40 hover:text-muted-foreground"
                        {...dragProvided.dragHandleProps}
                        onClick={(event) => event.stopPropagation()}
                        aria-label="Drag item"
                      >
                        <GripVertical className="h-3.5 w-3.5" />
                      </button>
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 rounded border-muted-foreground/40"
                        checked={selectedItemIds.has(item.id)}
                        onChange={(event) => { event.stopPropagation(); onToggleItemSelect(item.id); }}
                        onClick={(event) => event.stopPropagation()}
                      />
                    </div>
                  </td>
                  <td className="sticky left-0 min-w-[260px] bg-background px-3 py-2" style={itemTint ? { backgroundColor: itemTint } : undefined}>
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
                      <span className={cn("text-sm font-medium", searchQuery && "rounded bg-mamba-100 px-1 py-0.5")}>
                        {item.icon ? `${item.icon} ` : ""}
                        {item.name}
                      </span>
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
                      style={itemTint ? { backgroundColor: itemTint } : undefined}
                    >
                      <CellRenderer
                        boardId={boardId}
                        item={item}
                        column={column}
                        onCycleStatus={onCycleStatus}
                        onUpdateValue={onUpdateValue}
                        onUploadFile={onUploadFile}
                        onConnectItems={onConnectItems}
                        onSelectItem={onSelectItem}
                      />
                    </td>
                  ))}

                  <td className="w-10 px-1" onClick={(event) => event.stopPropagation()} style={itemTint ? { backgroundColor: itemTint } : undefined}>
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
                );
              }}
            </Draggable>
          ))}
          {!group.isCollapsed && (
            <tr>
              <td colSpan={columns.length + 3}>{provided.placeholder}</td>
            </tr>
          )}

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
        </tbody>
      )}
    </Droppable>
  );
}

function CellRenderer({
  boardId,
  item,
  column,
  onCycleStatus,
  onUpdateValue,
  onUploadFile,
  onConnectItems,
  onSelectItem,
}: {
  boardId: string;
  item: Item;
  column: Column;
  onCycleStatus: (itemId: string, cv: ColumnValue) => void;
  onUpdateValue: (valueId: string, value: unknown) => void;
  onUploadFile: (itemId: string, columnId: string, file: File) => void;
  onConnectItems: (payload: {
    action: "link" | "unlink";
    columnId: string;
    sourceItemId: string;
    targetItemId: string;
    targetBoardId: string;
  }) => void;
  onSelectItem: (itemId: string) => void;
}) {
  const cv = item.columnValues.find((value) => value.column.id === column.id);
  const rawValue = cv?.value;

  if (column.columnType === "CONNECT") {
    return (
      <ConnectCell
        boardId={boardId}
        itemId={item.id}
        columnId={column.id}
        value={rawValue}
        onConnectItems={onConnectItems}
      />
    );
  }

  if (column.columnType === "MIRROR") {
    if (rawValue == null) return <span className="text-xs text-muted-foreground">-</span>;
    if (Array.isArray(rawValue)) {
      return (
        <div className="space-y-1">
          {rawValue.slice(0, 2).map((entry, idx) => {
            const row = entry as Record<string, unknown>;
            return (
              <div key={`${column.id}-mirror-${idx}`} className="rounded bg-muted/50 px-1.5 py-0.5 text-[10px]">
                {(typeof row.itemName === "string" ? `${row.itemName}: ` : "") + asString(row.value)}
              </div>
            );
          })}
          {rawValue.length > 2 && <div className="text-[10px] text-muted-foreground">+{rawValue.length - 2} more</div>}
        </div>
      );
    }
    if (typeof rawValue === "object") {
      const row = rawValue as Record<string, unknown>;
      return (
        <span className="text-xs text-muted-foreground">
          {(typeof row.itemName === "string" ? `${row.itemName}: ` : "") + asString(row.value)}
        </span>
      );
    }
    return <span className="text-xs text-muted-foreground">{asString(rawValue)}</span>;
  }

  if (column.columnType === "ROLLUP") {
    const entry = rawValue && typeof rawValue === "object" ? (rawValue as Record<string, unknown>) : null;
    if (!entry) return <span className="text-xs text-muted-foreground">-</span>;
    return (
      <span className="text-xs text-muted-foreground">
        {(typeof entry.operation === "string" ? entry.operation : "ROLLUP")}: {asString(entry.value)} ({asString(entry.count)} links)
      </span>
    );
  }

  if (column.columnType === "FORMULA") {
    if (rawValue == null) return <span className="text-xs text-muted-foreground italic">fx</span>;
    const formatted = typeof rawValue === "number"
      ? (Number.isInteger(rawValue) ? rawValue.toLocaleString() : rawValue.toLocaleString(undefined, { maximumFractionDigits: 4 }))
      : asString(rawValue);
    return <span className="text-xs font-mono text-mamba-700">{formatted}</span>;
  }
  if (column.columnType === "ITEM_ID") {
    return <span className="text-xs font-mono text-muted-foreground">{item.id.slice(0, 8)}</span>;
  }

  if (column.columnType === "TIME_TRACKING") {
    const total = (item.timeEntries ?? []).reduce((acc, entry) => {
      if (entry.isRunning) {
        const running = Math.max(0, Math.round((Date.now() - new Date(entry.startTime).getTime()) / 1000));
        return acc + entry.durationSeconds + running;
      }
      return acc + entry.durationSeconds;
    }, 0);
    return <span className="text-xs font-medium text-mamba-700">{formatDuration(total)}</span>;
  }

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

  if (column.columnType === "RATING") {
    const rating = Math.max(0, Math.min(5, Number(rawValue) || 0));
    return (
      <div className="flex items-center gap-0.5">
        {Array.from({ length: 5 }, (_, index) => {
          const value = index + 1;
          return (
            <button
              key={`${cv.id}-star-${value}`}
              className={cn("text-sm", value <= rating ? "text-yellow-500" : "text-muted-foreground/40")}
              onClick={() => onUpdateValue(cv.id, value)}
            >
              ★
            </button>
          );
        })}
      </div>
    );
  }

  if (column.columnType === "EMAIL") {
    const email = asString(rawValue).trim();
    if (!email) return <span className="text-xs text-muted-foreground">-</span>;
    return <a href={`mailto:${email}`} className="text-xs text-mamba-700 hover:underline">{email}</a>;
  }

  if (column.columnType === "PHONE") {
    const phone = asString(rawValue).trim();
    if (!phone) return <span className="text-xs text-muted-foreground">-</span>;
    return <a href={`tel:${phone}`} className="text-xs text-mamba-700 hover:underline">{phone}</a>;
  }

  if (column.columnType === "LINK" || column.columnType === "FORM_LINK") {
    const url = asString(rawValue).trim();
    if (!url) return <span className="text-xs text-muted-foreground">-</span>;
    const href = /^https?:\/\//.test(url) ? url : `https://${url}`;
    return (
      <a href={href} target="_blank" rel="noreferrer" className="block truncate text-xs text-mamba-700 hover:underline">
        {url}
      </a>
    );
  }

  if (column.columnType === "COLOR") {
    const color = typeof rawValue === "string" && rawValue ? rawValue : "#22c55e";
    return (
      <div className="flex items-center gap-2">
        <span className="h-4 w-4 rounded border" style={{ backgroundColor: color }} />
        <input
          type="color"
          value={color}
          onChange={(event) => onUpdateValue(cv.id, event.target.value)}
          className="h-7 w-9 rounded border p-0.5"
        />
      </div>
    );
  }

  if (column.columnType === "AUTO_NUMBER") {
    return <span className="text-xs font-mono text-muted-foreground">{asString(rawValue) || "-"}</span>;
  }

  if (column.columnType === "CREATION_LOG" || column.columnType === "LAST_UPDATE") {
    const entry = rawValue && typeof rawValue === "object" ? (rawValue as Record<string, unknown>) : {};
    const actor = asString(entry.userName ?? entry.by ?? "").trim() || "Unknown";
    const dateRaw = asString(entry.date ?? entry.at ?? "").trim();
    const label = column.columnType === "CREATION_LOG" ? "Created" : "Updated";
    const dateText = dateRaw ? new Date(dateRaw).toLocaleString() : "unknown date";
    return <span className="text-[11px] text-muted-foreground">{label} by {actor} on {dateText}</span>;
  }

  if (column.columnType === "VOTE") {
    const voteEntry = rawValue && typeof rawValue === "object" ? (rawValue as Record<string, unknown>) : {};
    const up = Number(voteEntry.up ?? voteEntry.upvotes ?? 0) || 0;
    const down = Number(voteEntry.down ?? voteEntry.downvotes ?? 0) || 0;
    return (
      <div className="flex items-center gap-1 text-[11px]">
        <Button size="sm" variant="outline" className="h-6 px-2" onClick={() => onUpdateValue(cv.id, { up: up + 1, down })}>
          ▲
        </Button>
        <span>{up - down}</span>
        <Button size="sm" variant="outline" className="h-6 px-2" onClick={() => onUpdateValue(cv.id, { up, down: down + 1 })}>
          ▼
        </Button>
      </div>
    );
  }

  if (column.columnType === "HOUR") {
    return (
      <Input
        type="time"
        defaultValue={typeof rawValue === "string" ? rawValue : ""}
        onBlur={(event) => onUpdateValue(cv.id, event.target.value || null)}
        className="h-8 border-0 px-1 text-xs"
      />
    );
  }

  if (column.columnType === "LOCATION") {
    const text = asString(rawValue).trim();
    return <span className="block truncate text-xs">{text || "-"}</span>;
  }

  if (column.columnType === "WORLD_CLOCK") {
    const tz = asString(rawValue).trim() || "UTC";
    let current = "";
    try {
      current = new Date().toLocaleTimeString(undefined, { timeZone: tz, hour: "2-digit", minute: "2-digit" });
    } catch {
      current = new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    }
    return <span className="text-xs text-muted-foreground">{tz}: {current}</span>;
  }

  if (column.columnType === "DEPENDENCY") {
    const entries = Array.isArray(rawValue) ? rawValue : [];
    if (!entries.length) return <span className="text-xs text-muted-foreground">No links</span>;
    return (
      <div className="flex flex-wrap gap-1">
        {entries.map((entry, index) => {
          const itemId = typeof entry === "object" && entry ? asString((entry as Record<string, unknown>).id) : "";
          const itemName = typeof entry === "object" && entry
            ? asString((entry as Record<string, unknown>).name)
            : asString(entry);
          return (
            <button
              key={`${cv.id}-dep-${itemId || index}`}
              className="rounded border px-1.5 py-0.5 text-[10px] text-mamba-700 hover:bg-mamba-50"
              onClick={() => itemId && onSelectItem(itemId)}
            >
              {itemName || "Linked item"}
            </button>
          );
        })}
      </div>
    );
  }

  if (column.columnType === "TIMELINE") {
    const range = getTimelineRange(rawValue);
    const start = range ? range.start.toISOString().slice(0, 10) : "";
    const end = range ? range.end.toISOString().slice(0, 10) : "";
    return (
      <div className="flex items-center gap-1">
        <Input
          type="date"
          defaultValue={start}
          onBlur={(event) => {
            const nextStart = event.target.value;
            const nextEnd = end || nextStart;
            if (!nextStart) return onUpdateValue(cv.id, null);
            onUpdateValue(cv.id, { start: nextStart, end: nextEnd });
          }}
          className="h-8 border-0 px-1 text-[10px]"
        />
        <span className="text-[10px] text-muted-foreground">to</span>
        <Input
          type="date"
          defaultValue={end}
          onBlur={(event) => {
            const nextEnd = event.target.value;
            const nextStart = start || nextEnd;
            if (!nextEnd) return onUpdateValue(cv.id, null);
            onUpdateValue(cv.id, { start: nextStart, end: nextEnd });
          }}
          className="h-8 border-0 px-1 text-[10px]"
        />
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

function ConnectCell({
  boardId,
  itemId,
  columnId,
  value,
  onConnectItems,
}: {
  boardId: string;
  itemId: string;
  columnId: string;
  value: unknown;
  onConnectItems: (payload: {
    action: "link" | "unlink";
    columnId: string;
    sourceItemId: string;
    targetItemId: string;
    targetBoardId: string;
  }) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<Array<{ id: string; name: string; boardId: string; boardName: string }>>([]);

  const selected = useMemo(() => {
    if (!Array.isArray(value)) return [];
    return value
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const row = entry as Record<string, unknown>;
        const id = typeof row.id === "string" ? row.id : null;
        const name = typeof row.name === "string" ? row.name : "Linked item";
        const linkedBoardId = typeof row.boardId === "string" ? row.boardId : "";
        const linkedBoardName = typeof row.boardName === "string" ? row.boardName : "Board";
        if (!id) return null;
        return { id, name, boardId: linkedBoardId, boardName: linkedBoardName };
      })
      .filter((entry): entry is { id: string; name: string; boardId: string; boardName: string } => Boolean(entry));
  }, [value]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch(`/api/boards/${boardId}/connect-options?q=${encodeURIComponent(query.trim())}`);
        if (!res.ok) return;
        const json = await res.json();
        const next = ((json.boards ?? []) as Array<{
          id: string;
          name: string;
          items: Array<{ id: string; name: string; boardId: string; boardName: string }>;
        }>)
          .flatMap((board) =>
            board.items.map((item) => ({
              id: item.id,
              name: item.name,
              boardId: board.id,
              boardName: board.name,
            }))
          )
          .filter((option) => !selected.some((entry) => entry.id === option.id))
          .slice(0, 24);
        if (!cancelled) setOptions(next);
      } catch {
        if (!cancelled) setOptions([]);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [boardId, open, query, selected]);

  return (
    <div className="relative space-y-1">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((entry) => (
            <span key={entry.id} className="inline-flex items-center gap-1 rounded-full border bg-muted px-1.5 py-0.5 text-[10px]">
              {entry.boardName}: {entry.name}
              <button
                className="text-muted-foreground hover:text-destructive"
                onClick={() =>
                  onConnectItems({
                    action: "unlink",
                    columnId,
                    sourceItemId: itemId,
                    targetItemId: entry.id,
                    targetBoardId: entry.boardId,
                  })
                }
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <Input
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        placeholder="Link item..."
        className="h-7 px-2 text-[11px]"
      />
      {open && options.length > 0 && (
        <div className="absolute left-0 top-full z-30 mt-1 max-h-48 w-[260px] overflow-auto rounded-md border bg-popover p-1 shadow-lg">
          {options.map((option) => (
            <button
              key={option.id}
              className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-[11px] hover:bg-accent"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onConnectItems({
                  action: "link",
                  columnId,
                  sourceItemId: itemId,
                  targetItemId: option.id,
                  targetBoardId: option.boardId,
                });
                setQuery("");
                setOpen(false);
              }}
            >
              <span className="truncate">{option.name}</span>
              <span className="ml-2 shrink-0 text-[10px] text-muted-foreground">{option.boardName}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function KanbanView({
  groups,
  columns,
  onCycleStatus,
  onUpdateValue,
  onKanbanCrossLane,
  onReorderItems,
  onCreateItemInLane,
  searchQuery,
  onSelectItem,
  allColumns,
}: {
  groups: Group[];
  columns: Column[];
  onCycleStatus: (itemId: string, cv: ColumnValue) => void;
  onUpdateValue: (valueId: string, value: unknown) => void;
  onKanbanCrossLane: (itemId: string, destinationLane: number) => void;
  onReorderItems: (itemId: string, sourceGroupId: string, destinationGroupId: string, destinationIndex: number) => void;
  onCreateItemInLane: (statusIndex: number) => void;
  searchQuery: string;
  onSelectItem: (itemId: string) => void;
  allColumns: Column[];
}) {
  const [laneOrder, setLaneOrder] = useState<Record<number, string[]>>({});
  const [showCardSettings, setShowCardSettings] = useState(false);
  const [cardSettings, setCardSettings] = useState<{
    showDate: boolean;
    showPriority: boolean;
    showAssignees: boolean;
    showGroupName: boolean;
    visibleColumns: string[];
  }>({
    showDate: false,
    showPriority: true,
    showAssignees: true,
    showGroupName: true,
    visibleColumns: [],
  });
  const dragInFlight = useRef(false);
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

  useEffect(() => {
    if (dragInFlight.current) return;
    setLaneOrder((prev) => {
      const next: Record<number, string[]> = {};
      for (const lane of lanes) {
        const ids = lane.items.map((item) => item.id);
        const existing = (prev[lane.index] ?? []).filter((id) => ids.includes(id));
        const missing = ids.filter((id) => !existing.includes(id));
        next[lane.index] = [...existing, ...missing];
      }
      return next;
    });
  }, [groups, laneCount]);

  const orderedLanes = lanes.map((lane) => {
    const order = laneOrder[lane.index] ?? [];
    const orderMap = new Map(order.map((id, index) => [id, index]));
    const items = [...lane.items].sort((a, b) => {
      const ai = orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const bi = orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return ai - bi;
    });
    return { ...lane, items };
  });

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    dragInFlight.current = true;
    setTimeout(() => { dragInFlight.current = false; }, 2000);
    const destination = result.destination;

    const sourceLane = Number(result.source.droppableId);
    const destinationLane = Number(destination.droppableId);

    if (Number.isNaN(sourceLane) || Number.isNaN(destinationLane)) return;

    const draggedItem = orderedLanes[sourceLane]?.items[result.source.index];
    if (!draggedItem) return;
    if (sourceLane === destinationLane && result.source.index === result.destination.index) return;

    // 1. Update lane order for visual feedback
    setLaneOrder((prev) => {
      const source = [...(prev[sourceLane] ?? orderedLanes[sourceLane].items.map((entry) => entry.id))];
      const destinationIds = sourceLane === destinationLane
        ? source
        : [...(prev[destinationLane] ?? orderedLanes[destinationLane].items.map((entry) => entry.id))];
      const [movedId] = source.splice(result.source.index, 1);
      if (!movedId) return prev;
      destinationIds.splice(destination.index, 0, movedId);
      return { ...prev, [sourceLane]: source, [destinationLane]: destinationIds };
    });

    // 2. For cross-lane: update status value via parent callback
    // (parent has access to groups state with populated columnValues)
    if (sourceLane !== destinationLane) {
      onKanbanCrossLane(draggedItem.id, destinationLane);
    }

    // 3. Persist position change to server
    onReorderItems(draggedItem.id, draggedItem.groupId, draggedItem.groupId, destination.index);
  };

  const dateColumns = allColumns.filter((c) => c.columnType === "DATE" || c.columnType === "TIMELINE");
  const peopleColumns = allColumns.filter((c) => c.columnType === "PEOPLE");
  const extraColumns = allColumns.filter(
    (c) =>
      c.columnType !== "STATUS" &&
      c.columnType !== "DATE" &&
      c.columnType !== "TIMELINE" &&
      c.columnType !== "PEOPLE" &&
      c.columnType !== "ITEM_ID" &&
      c.columnType !== "CREATION_LOG" &&
      c.columnType !== "LAST_UPDATE" &&
      c.columnType !== "AUTO_NUMBER" &&
      c.columnType !== "FORMULA",
  );

  const toggleColumnVisibility = (columnId: string) => {
    setCardSettings((prev) => {
      const visible = prev.visibleColumns.includes(columnId)
        ? prev.visibleColumns.filter((id) => id !== columnId)
        : [...prev.visibleColumns, columnId];
      return { ...prev, visibleColumns: visible };
    });
  };

  return (
    <div className="h-full overflow-auto px-4 py-3 relative">
      {/* Kanban Card Settings */}
      <div className="absolute right-4 top-3 z-10">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setShowCardSettings(true)}
          title="Card display settings"
        >
          ⚙️
        </Button>
      </div>

      {/* Settings Dialog */}
      {showCardSettings && (
        <div className="absolute right-4 top-12 z-50 w-72 rounded-lg border bg-card p-4 shadow-lg">
          <h3 className="text-sm font-semibold mb-3">Card Display Settings</h3>
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={cardSettings.showGroupName}
                onChange={() => setCardSettings((s) => ({ ...s, showGroupName: !s.showGroupName }))}
                className="h-3.5 w-3.5 rounded border"
              />
              Show group name
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={cardSettings.showAssignees}
                onChange={() => setCardSettings((s) => ({ ...s, showAssignees: !s.showAssignees }))}
                className="h-3.5 w-3.5 rounded border"
              />
              Show assignees
            </label>
            {dateColumns.map((col) => (
              <label key={col.id} className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={cardSettings.visibleColumns.includes(col.id)}
                  onChange={() => toggleColumnVisibility(col.id)}
                  className="h-3.5 w-3.5 rounded border"
                />
                Show: {col.title}
              </label>
            ))}
            {peopleColumns.filter((c) => c.id !== peopleColumns[0]?.id).map((col) => (
              <label key={col.id} className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={cardSettings.visibleColumns.includes(col.id)}
                  onChange={() => toggleColumnVisibility(col.id)}
                  className="h-3.5 w-3.5 rounded border"
                />
                Show: {col.title}
              </label>
            ))}
            {extraColumns.map((col) => (
              <label key={col.id} className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={cardSettings.visibleColumns.includes(col.id)}
                  onChange={() => toggleColumnVisibility(col.id)}
                  className="h-3.5 w-3.5 rounded border"
                />
                Show: {col.title}
              </label>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 h-7 w-full text-xs"
            onClick={() => setShowCardSettings(false)}
          >
            Done
          </Button>
        </div>
      )}

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex min-w-[940px] gap-3 pr-12">
          {orderedLanes.map((lane) => (
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
                            <div
                      role="button"
                      tabIndex={0}
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              {...dragProvided.dragHandleProps}
                              className={cn("kanban-card cursor-grab active:cursor-grabbing", searchQuery && "ring-1 ring-mamba-300")}
                              onClick={() => onSelectItem(item.id)}
                              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelectItem(item.id); } }}
                            >
                              <p className="text-left text-sm font-medium">{item.icon ? `${item.icon} ` : ""}{item.name}</p>
                              {cardSettings.showGroupName && (
                                <p className="text-left text-[11px] text-muted-foreground">{item.groupName}</p>
                              )}
                              {cardSettings.visibleColumns.map((colId) => {
                                const cv = item.columnValues.find((v) => v.column.id === colId);
                                if (!cv || cv.value == null || cv.value === "") return null;
                                const isDate = cv.column.columnType === "DATE" || cv.column.columnType === "TIMELINE";
                                const displayValue = isDate
                                  ? new Date(cv.value as string).toLocaleDateString()
                                  : typeof cv.value === "number"
                                    ? `${cv.column.title}: ${cv.value}`
                                    : String(cv.value);
                                return (
                                  <p key={colId} className="text-left text-[11px] text-muted-foreground truncate">
                                    {displayValue}
                                  </p>
                                );
                              })}
                              <div className="mt-2 flex items-center justify-between">
                                {cardSettings.showAssignees && (
                                  <div className="flex -space-x-1">
                                    {item.assignees.slice(0, 3).map((assignee) => (
                                      <Avatar key={assignee.user.id} className="h-5 w-5 border border-background">
                                        <AvatarFallback className="text-[8px]">
                                          {assignee.user.firstName[0]}
                                          {assignee.user.lastName[0]}
                                        </AvatarFallback>
                                      </Avatar>
                                    ))}
                                    {item.assignees.length === 0 && (
                                      <span className="text-[10px] text-muted-foreground">Unassigned</span>
                                    )}
                                  </div>
                                )}
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
                            </div>
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
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-1 h-8 w-full text-xs"
                      onClick={() => onCreateItemInLane(lane.index)}
                    >
                      <Plus className="mr-1 h-3 w-3" /> New Item
                    </Button>
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
  searchQuery,
}: {
  groups: Group[];
  columns: Column[];
  searchQuery: string;
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
                <div className={cn("truncate text-xs font-medium", searchQuery && "rounded bg-mamba-100 px-1 py-0.5")}>
                  {row.name}
                </div>
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
  boardId,
  workspaceId,
  item,
  groupName,
  columns,
  allItems,
  comments,
  localActivities,
  onClose,
  onUpdateName,
  onUpdateItemFields,
  onUpdateValue,
  onUploadFile,
  onAddComment,
  onToggleCommentReaction,
  onDelete,
}: {
  user: { id: string; firstName: string; lastName: string };
  boardId: string;
  workspaceId: string;
  item: Item | null;
  groupName: string;
  columns: Column[];
  allItems: Item[];
  comments: ItemComment[];
  localActivities: Array<{ id: string; text: string; createdAt: string }>;
  onClose: () => void;
  onUpdateName: (itemId: string, name: string) => void;
  onUpdateItemFields: (itemId: string, patch: Partial<Pick<Item, "recurrenceRule" | "color" | "icon">>) => void;
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
  const [detailTab, setDetailTab] = useState<"comments" | "activity" | "versions" | "docs">("comments");
  const [itemVersions, setItemVersions] = useState<ItemVersionEntry[]>([]);
  const [docEmbeds, setDocEmbeds] = useState<BoardDocEmbed[]>([]);
  const [workspaceDocs, setWorkspaceDocs] = useState<Array<{ id: string; title: string; icon: string | null }>>([]);
  const [selectedDocId, setSelectedDocId] = useState("");

  useEffect(() => {
    setCommentText("");
    setReplyingTo(null);
    setDetailTab("comments");
    setSelectedDocId("");
  }, [item?.id]);

  useEffect(() => {
    if (!item) {
      setTimeEntries([]);
      setTimeTotalSeconds(0);
      setDependencies([]);
      setSubitems([]);
      setItemVersions([]);
      setDocEmbeds([]);
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

    fetch(`/api/items/${item.id}/versions`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setItemVersions(data?.versions ?? []))
      .catch(() => {});

    fetch(`/api/boards/${boardId}/doc-embeds?itemId=${item.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setDocEmbeds(data?.embeds ?? []))
      .catch(() => {});

    fetch(`/api/docs?workspaceId=${workspaceId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setWorkspaceDocs((data?.docs ?? []).map((doc: { id: string; title: string; icon: string | null }) => ({ id: doc.id, title: doc.title, icon: doc.icon }))))
      .catch(() => {});
  }, [boardId, item, workspaceId]);

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

  const extractDocText = (node: unknown): string => {
    if (!node || typeof node !== "object") return "";
    const entry = node as Record<string, unknown>;
    if (typeof entry.text === "string") return entry.text;
    if (Array.isArray(entry.content)) return entry.content.map((child) => extractDocText(child)).join(" ");
    return "";
  };

  const handleLinkDoc = async () => {
    if (!item || !selectedDocId) return;
    try {
      const res = await fetch(`/api/boards/${boardId}/doc-embeds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docId: selectedDocId,
          itemId: item.id,
          embedType: "ITEM_DOC",
          embedData: {},
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setDocEmbeds((prev) => [data.embed, ...prev]);
      setSelectedDocId("");
    } catch {
      // ignore
    }
  };

  const handleRemoveDocEmbed = async (embedId: string) => {
    try {
      const res = await fetch(`/api/boards/${boardId}/doc-embeds?embedId=${embedId}`, {
        method: "DELETE",
      });
      if (!res.ok) return;
      setDocEmbeds((prev) => prev.filter((entry) => entry.id !== embedId));
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
              <h3 className="text-sm font-semibold">Item Settings</h3>
              <div className="space-y-3 rounded-md border p-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Recurrence</label>
                  <select
                    className="h-8 w-full rounded border px-2 text-xs"
                    value={item.recurrenceRule ?? "NONE"}
                    onChange={(event) =>
                      onUpdateItemFields(item.id, {
                        recurrenceRule: event.target.value === "NONE" ? null : event.target.value,
                      })
                    }
                  >
                    <option value="NONE">None</option>
                    <option value="DAILY">Daily</option>
                    <option value="WEEKLY">Weekly</option>
                    <option value="MONTHLY">Monthly</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      className="h-7 w-9 rounded border p-0.5"
                      value={item.color ?? "#579bfc"}
                      onChange={(event) => onUpdateItemFields(item.id, { color: event.target.value })}
                    />
                    <span className="text-xs text-muted-foreground">{item.color ?? "No color"}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={cn(
                        "rounded border px-2 py-1 text-[10px]",
                        !item.color && "border-mamba-500 bg-mamba-50 text-mamba-700"
                      )}
                      onClick={() => onUpdateItemFields(item.id, { color: null })}
                    >
                      None
                    </button>
                    {ITEM_COLOR_PRESETS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={cn(
                          "h-6 w-6 rounded-full border-2",
                          item.color === color ? "border-foreground" : "border-transparent"
                        )}
                        style={{ backgroundColor: color }}
                        onClick={() => onUpdateItemFields(item.id, { color })}
                        aria-label={`Set item color ${color}`}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Icon</label>
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      className={cn(
                        "rounded border px-2 py-1 text-xs",
                        !item.icon && "border-mamba-500 bg-mamba-50 text-mamba-700"
                      )}
                      onClick={() => onUpdateItemFields(item.id, { icon: null })}
                    >
                      None
                    </button>
                    {ITEM_ICON_PRESETS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        className={cn(
                          "rounded border px-2 py-1 text-base leading-none",
                          item.icon === emoji && "border-mamba-500 bg-mamba-50"
                        )}
                        onClick={() => onUpdateItemFields(item.id, { icon: emoji })}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

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
                const emptyCv = cv ?? { id: `new-${column.id}`, column, value: null, itemId: item.id };
                return (
                  <div key={column.id} className="rounded-md border p-2">
                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                      {column.title} ({formatColumnLabel(column.columnType)})
                    </p>
                    <DetailValueEditor
                      itemId={item.id}
                      column={column}
                      cv={emptyCv}
                      isNew={!cv}
                      onUpdateValue={onUpdateValue}
                      onUploadFile={onUploadFile}
                    />
                  </div>
                );
              })}
            </section>

            <section className="space-y-2">
              <div className="flex items-center gap-2">
                {(["comments", "activity", "versions", "docs"] as const).map((tab) => (
                  <button
                    key={tab}
                    className={cn(
                      "rounded border px-2 py-1 text-xs capitalize",
                      detailTab === tab
                        ? "border-mamba-500 bg-mamba-50 text-mamba-700"
                        : "border-border text-muted-foreground hover:text-foreground"
                    )}
                    onClick={() => setDetailTab(tab)}
                  >
                    {tab === "versions" ? "Version History" : tab}
                  </button>
                ))}
              </div>

              {detailTab === "comments" && (
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
              )}

              {detailTab === "activity" && (
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
              )}

              {detailTab === "versions" && (
                <div className="space-y-2 rounded-md border p-2">
                  {itemVersions.length > 0 ? (
                    itemVersions.map((version) => (
                      <div key={version.id} className="rounded border bg-muted/20 p-2">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarFallback className="text-[10px]">
                              {version.changedBy.firstName[0]}
                              {version.changedBy.lastName[0]}
                            </AvatarFallback>
                          </Avatar>
                          <p className="text-xs font-medium">
                            {version.changedBy.firstName} {version.changedBy.lastName}
                          </p>
                          <span className="text-[10px] text-muted-foreground">
                            {formatRelativeTime(version.createdAt)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {version.field}: {version.oldValue ?? "∅"} {"->"} {version.newValue ?? "∅"}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">No version history yet</p>
                  )}
                </div>
              )}

              {detailTab === "docs" && (
                <div className="space-y-2 rounded-md border p-2">
                  <div className="flex gap-2">
                    <select
                      className="h-8 flex-1 rounded border px-2 text-xs"
                      value={selectedDocId}
                      onChange={(event) => setSelectedDocId(event.target.value)}
                    >
                      <option value="">Link a doc</option>
                      {workspaceDocs.map((doc) => (
                        <option key={doc.id} value={doc.id}>
                          {(doc.icon ?? "📄")} {doc.title}
                        </option>
                      ))}
                    </select>
                    <Button size="sm" className="h-8" onClick={handleLinkDoc} disabled={!selectedDocId}>
                      Link
                    </Button>
                  </div>
                  {docEmbeds.length > 0 ? (
                    docEmbeds.map((embed) => {
                      const preview = extractDocText(embed.doc.content).replace(/\s+/g, " ").trim().slice(0, 180);
                      return (
                        <div key={embed.id} className="rounded border bg-muted/20 p-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-medium">
                              {(embed.doc.icon ?? "📄")} {embed.doc.title}
                            </p>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 text-[10px]"
                              onClick={() => handleRemoveDocEmbed(embed.id)}
                            >
                              Remove
                            </Button>
                          </div>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {preview || "No preview text"}
                          </p>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-xs text-muted-foreground">No docs linked to this item</p>
                  )}
                </div>
              )}
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

function BulkValueEditor({ column, selectedCount, onClose, onApply }: {
  column: { id: string; title: string; type: string; config: unknown } | null;
  selectedCount: number;
  onClose: () => void;
  onApply: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  if (!column) return null;

  const handleSubmit = () => {
    onApply(value);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit "{column.title}" for {selectedCount} items</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {column.type === "STATUS" ? (
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Select status</label>
              <select
                className="h-8 w-full rounded-md border bg-background px-2 text-sm"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              >
                <option value="" disabled>Choose status...</option>
                {((column.config as { labels?: string[] } | null)?.labels ?? []).map((label, i) => (
                  <option key={i} value={String(i)}>{label}</option>
                ))}
              </select>
            </div>
          ) : column.type === "NUMBER" ? (
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Enter number</label>
              <Input
                type="number"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="0"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Enter value</label>
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Value..."
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button className="bg-mamba-600 hover:bg-mamba-700" onClick={handleSubmit}>
            Apply to {selectedCount} items
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailValueEditor({
  itemId,
  column,
  cv,
  isNew,
  onUpdateValue,
  onUploadFile,
}: {
  itemId: string;
  column: Column;
  cv: ColumnValue;
  isNew?: boolean;
  onUpdateValue: (valueId: string, value: unknown) => void;
  onUploadFile: (itemId: string, columnId: string, file: File) => void;
}) {
  const handleChange = (value: unknown) => {
    if (isNew && value != null) {
      // Create a new column value
      onUpdateValue(`create:${itemId}:${column.id}`, value);
      return;
    }
    onUpdateValue(cv.id, value);
  };
  if (column.columnType === "STATUS") {
    const { labels } = getStatusMeta(cv.column);
    const currentValue = typeof cv.value === "number" ? cv.value : 0;
    return (
      <select
        value={currentValue}
        onChange={(event) => handleChange(Number(event.target.value))}
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
        onChange={(event) => handleChange(event.target.value || null)}
        className="h-8"
      />
    );
  }

  if (column.columnType === "NUMBER") {
    return (
      <Input
        type="number"
        defaultValue={cv.value != null ? String(cv.value) : ""}
        onBlur={(event) => handleChange(event.target.value === "" ? null : Number(event.target.value))}
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
          onChange={(event) => handleChange(event.target.checked)}
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
        onBlur={(event) => handleChange(event.target.value === "" ? null : Number(event.target.value))}
        className="h-8"
      />
    );
  }

  if (column.columnType === "PEOPLE") {
    const assignedUsers = Array.isArray(cv.value) ? cv.value as Array<{ id: string; name: string; avatarUrl?: string }> : [];
    return (
      <div className="space-y-2">
        {assignedUsers.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {assignedUsers.map((u, idx) => (
              <span key={u.id ?? idx} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                {u.avatarUrl && <img src={u.avatarUrl} alt="" className="h-4 w-4 rounded-full" />}
                {u.name}
                <button
                  type="button"
                  className="ml-0.5 text-blue-400 hover:text-blue-600"
                  onClick={() => {
                    const updated = assignedUsers.filter((_, i) => i !== idx);
                    onUpdateValue(cv.id, updated);
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <Input
          placeholder="Type a name and press Enter to assign"
          className="h-8 text-xs"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              const name = event.currentTarget.value.trim();
              if (!name) return;
              const newAssigned = [...assignedUsers, { id: `user-${Date.now()}`, name }];
              onUpdateValue(cv.id, newAssigned);
              event.currentTarget.value = "";
            }
          }}
        />
      </div>
    );
  }

  if (column.columnType === "RATING") {
    const currentRating = typeof cv.value === "number" ? cv.value : 0;
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onUpdateValue(cv.id, star === currentRating ? 0 : star)}
            className={cn(
              "text-lg transition-colors",
              star <= currentRating ? "text-yellow-400" : "text-muted-foreground/30 hover:text-yellow-200"
            )}
          >
            ★
          </button>
        ))}
        <span className="ml-2 text-xs text-muted-foreground">{currentRating}/5</span>
      </div>
    );
  }

  if (column.columnType === "TIMELINE") {
    const timelineValue = cv.value as { start?: string; end?: string } | null;
    return (
      <div className="flex items-center gap-2">
        <Input
          type="date"
          defaultValue={timelineValue?.start ? new Date(timelineValue.start).toISOString().slice(0, 10) : ""}
          onChange={(event) => onUpdateValue(cv.id, { ...timelineValue, start: event.target.value || undefined })}
          className="h-8 text-xs"
        />
        <span className="text-xs text-muted-foreground">→</span>
        <Input
          type="date"
          defaultValue={timelineValue?.end ? new Date(timelineValue.end).toISOString().slice(0, 10) : ""}
          onChange={(event) => onUpdateValue(cv.id, { ...timelineValue, end: event.target.value || undefined })}
          className="h-8 text-xs"
        />
      </div>
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
      onBlur={(event) => handleChange(event.target.value)}
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

function AddColumnModal({
  boardId,
  columns,
  onClose,
}: {
  boardId: string;
  columns: Column[];
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [columnType, setColumnType] = useState("TEXT");
  const [connectColumnId, setConnectColumnId] = useState("");
  const [targetColumnId, setTargetColumnId] = useState("");
  const [rollupOperation, setRollupOperation] = useState("COUNT");
  const [formulaExpression, setFormulaExpression] = useState("");
  const [formulaValid, setFormulaValid] = useState<boolean | null>(null);
  const [formulaError, setFormulaError] = useState("");
 async function validateFormula(expr: string) {
    if (!expr.trim()) { setFormulaValid(null); setFormulaError(""); return; }
    try {
      const res = await fetch("/api/formulas/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formula: expr }),
      });
      const data = await res.json();
      setFormulaValid(data.valid === true);
      setFormulaError(data.error || "");
    } catch {
      setFormulaValid(false);
      setFormulaError("Validation failed");
    }
  }

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
    { value: "CONNECT", label: "Connect" },
    { value: "MIRROR", label: "Mirror" },
    { value: "ROLLUP", label: "Rollup" },
 { value: "FORMULA", label: "Formula" },
  ];

  const connectColumns = columns.filter((column) => column.columnType === "CONNECT");
  const valueColumns = columns.filter((column) => !["CONNECT", "MIRROR", "ROLLUP"].includes(column.columnType));

  const handleCreate = async () => {
    if (!title.trim()) return;
    const config = (() => {
      if (columnType === "MIRROR") {
        return {
          connectColumnId,
          targetColumnId,
        };
      }
      if (columnType === "ROLLUP") {
        return {
          connectColumnId,
          targetColumnId,
          operation: rollupOperation,
        };
      }
    if (columnType === "FORMULA") {
      return { expression: formulaExpression };
    }
      return undefined;
    })();

    await fetch(`/api/columns/${boardId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boardId, title, columnType, config }),
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

          {columnType === "FORMULA" && (
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-xs font-semibold text-muted-foreground">Formula Expression</p>
              <div className="space-y-1">
                <Input
                  value={formulaExpression}
                  onChange={(e) => { setFormulaExpression(e.target.value); validateFormula(e.target.value); }}
                  placeholder='e.g. {Number} * {Rate}'
                  className="font-mono text-xs"
                />
                {formulaValid === true && <p className="text-xs text-green-600">✓ Valid formula</p>}
                {formulaValid === false && <p className="text-xs text-red-500">✗ {formulaError || "Invalid formula"}</p>}
                {formulaValid === null && <p className="text-xs text-muted-foreground">Use {'{'}Column Name{'}'} to reference other columns. Supports +, -, *, /, SUM(), AVG(), COUNT(), MIN(), MAX().</p>}
              </div>
            </div>
          )}
          {(columnType === "MIRROR" || columnType === "ROLLUP") && (
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-xs font-semibold text-muted-foreground">Derived Column Config</p>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Connect column</label>
                <select
                  className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                  value={connectColumnId}
                  onChange={(event) => setConnectColumnId(event.target.value)}
                >
                  <option value="">Select connect column</option>
                  {connectColumns.map((column) => (
                    <option key={column.id} value={column.id}>{column.title}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Target column to read</label>
                <select
                  className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                  value={targetColumnId}
                  onChange={(event) => setTargetColumnId(event.target.value)}
                >
                  <option value="">Select target column</option>
                  {valueColumns.map((column) => (
                    <option key={column.id} value={column.id}>{column.title}</option>
                  ))}
                </select>
              </div>
              {columnType === "ROLLUP" && (
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Aggregation</label>
                  <select
                    className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                    value={rollupOperation}
                    onChange={(event) => setRollupOperation(event.target.value)}
                  >
                    {["COUNT", "SUM", "AVG", "MIN", "MAX"].map((op) => (
                      <option key={op} value={op}>{op}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button className="bg-mamba-600 hover:bg-mamba-700" onClick={handleCreate}>Add Column</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
