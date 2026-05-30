"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import {
  LayoutDashboard,
  Plus,
  Trash2,
  Pencil,
  Share2,
  Copy,
  Check,
  BarChart3,
  PieChart,
  LineChart,
  Activity,
  Clock,
  Users,
  TrendingDown,
  Hash,
  BarChart,
  GripVertical,
  LayoutGrid,
} from "lucide-react";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart as RechartsBar,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RechartsPie,
  Pie,
  Cell,
  LineChart as RechartsLine,
  Line,
} from "recharts";

type Dashboard = {
  id: string;
  name: string;
  description: string | null;
  shareEnabled: boolean;
  shareToken: string | null;
  widgets: Widget[];
};

type Widget = {
  id: string;
  type: string;
  title: string;
  config: Record<string, unknown> | null;
  order: number;
  width: number;
  height: number;
};

type Board = {
  id: string;
  name: string;
  columns: { id: string; title: string; columnType: string }[];
};

const WIDGET_TYPES = [
  { value: "ITEM_COUNT", label: "Item Count", icon: Hash },
  { value: "STATUS_BREAKDOWN", label: "Status Breakdown", icon: PieChart },
  { value: "TIME_TRACKING_SUMMARY", label: "Time Tracking", icon: Clock },
  { value: "TEAM_WORKLOAD", label: "Team Workload", icon: Users },
  { value: "NUMBER_SUMMARY", label: "Number Summary", icon: BarChart3 },
  { value: "CHART_BAR", label: "Bar Chart", icon: BarChart },
  { value: "CHART_LINE", label: "Line Chart", icon: LineChart },
  { value: "CHART_PIE", label: "Pie Chart", icon: PieChart },
  { value: "BURNDOWN", label: "Burndown", icon: TrendingDown },
  { value: "RECENT_ACTIVITY", label: "Recent Activity", icon: Activity },
  { value: "KANBAN", label: "Kanban", icon: LayoutGrid },
];

const WIDGETS_REQUIRING_COLUMN = new Set([
  "STATUS_BREAKDOWN",
  "NUMBER_SUMMARY",
  "CHART_BAR",
  "CHART_LINE",
  "CHART_PIE",
]);

const COLORS = ["#579bfc", "#fdab3d", "#e2445c", "#00c875", "#a25ddc", "#ff158a", "#ff642e", "#037f4c"];

function defaultSize(type: string) {
  if (["STATUS_BREAKDOWN", "CHART_BAR", "CHART_LINE", "CHART_PIE", "BURNDOWN", "RECENT_ACTIVITY", "KANBAN"].includes(type)) {
    return { width: 2, height: 1 };
  }
  return { width: 1, height: 1 };
}

interface InsightsClientProps {
  user: { id: string; firstName: string; lastName: string; email: string; avatarUrl: string | null; role: string };
  dashboards: Dashboard[];
  boards: Board[];
  initialDashboardId?: string;
}

export function InsightsClient({ dashboards: initialDashboards, boards, initialDashboardId }: InsightsClientProps) {
  const [dashboards, setDashboards] = useState<Dashboard[]>(initialDashboards);
  const [activeDashboardId, setActiveDashboardId] = useState<string>(
    initialDashboardId && initialDashboards.some((d) => d.id === initialDashboardId)
      ? initialDashboardId
      : initialDashboards[0]?.id ?? ""
  );
  const [widgetData, setWidgetData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);

  const [showCreateDashboard, setShowCreateDashboard] = useState(false);
  const [showRenameDashboard, setShowRenameDashboard] = useState(false);
  const [showWidgetDialog, setShowWidgetDialog] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);

  const [newDashboardName, setNewDashboardName] = useState("");
  const [renameDashboardName, setRenameDashboardName] = useState("");

  const [editingWidget, setEditingWidget] = useState<Widget | null>(null);
  const [widgetType, setWidgetType] = useState("ITEM_COUNT");
  const [widgetTitle, setWidgetTitle] = useState("");
  const [widgetBoardId, setWidgetBoardId] = useState("all");
  const [widgetColumnId, setWidgetColumnId] = useState("none");
  const [shareEnabled, setShareEnabled] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [embedCode, setEmbedCode] = useState("");
  const [shareLoading, setShareLoading] = useState(false);
  const [copiedShare, setCopiedShare] = useState<"" | "url" | "embed">("");

  const activeDashboard = useMemo(
    () => dashboards.find((dashboard) => dashboard.id === activeDashboardId) ?? null,
    [dashboards, activeDashboardId]
  );

  const selectedBoard = useMemo(
    () => (widgetBoardId === "all" ? undefined : boards.find((board) => board.id === widgetBoardId)),
    [widgetBoardId, boards]
  );

  const loadWidgetData = useCallback(async () => {
    if (!activeDashboard) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboards/${activeDashboard.id}/widget-data`);
      if (res.ok) {
        const json = await res.json();
        setWidgetData(json.data ?? {});
      }
    } catch (err) {
      console.error("Failed to load widget data:", err);
    } finally {
      setLoading(false);
    }
  }, [activeDashboard]);

  useEffect(() => {
    loadWidgetData();
  }, [loadWidgetData]);

  useEffect(() => {
    if (!activeDashboardId && dashboards[0]?.id) {
      setActiveDashboardId(dashboards[0].id);
    }
  }, [activeDashboardId, dashboards]);

  const createDashboard = async () => {
    if (!newDashboardName.trim()) return;
    const res = await fetch("/api/dashboards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newDashboardName.trim() }),
    });
    if (!res.ok) return;
    const json = await res.json();
    const created = json.dashboard as Dashboard;
    setDashboards((prev) => [created, ...prev]);
    setActiveDashboardId(created.id);
    setNewDashboardName("");
    setShowCreateDashboard(false);
  };

  const renameDashboard = async () => {
    if (!activeDashboard || !renameDashboardName.trim()) return;
    const res = await fetch(`/api/dashboards/${activeDashboard.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: renameDashboardName.trim() }),
    });
    if (!res.ok) return;
    const json = await res.json();
    const updated = json.dashboard as Dashboard;
    setDashboards((prev) => prev.map((d) => (d.id === updated.id ? { ...d, ...updated } : d)));
    setShowRenameDashboard(false);
  };

  const deleteDashboard = async () => {
    if (!activeDashboard) return;
    await fetch(`/api/dashboards/${activeDashboard.id}`, { method: "DELETE" });
    const updated = dashboards.filter((d) => d.id !== activeDashboard.id);
    setDashboards(updated);
    setActiveDashboardId(updated[0]?.id ?? "");
  };

  const openShareDialog = async () => {
    if (!activeDashboard) return;
    setShowShareDialog(true);
    setShareLoading(true);
    try {
      const res = await fetch(`/api/dashboards/${activeDashboard.id}/share`);
      const data = await res.json();
      if (!res.ok) return;
      setShareEnabled(Boolean(data.shareEnabled));
      setShareUrl(data.shareUrl ?? "");
      setEmbedCode(data.embedCode ?? "");
    } finally {
      setShareLoading(false);
    }
  };

  const updateShare = async (enabled: boolean, regenerate = false) => {
    if (!activeDashboard) return;
    setShareLoading(true);
    try {
      const res = await fetch(`/api/dashboards/${activeDashboard.id}/share`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, regenerate }),
      });
      const data = await res.json();
      if (!res.ok) return;
      setShareEnabled(Boolean(data.shareEnabled));
      setShareUrl(data.shareUrl ?? "");
      setEmbedCode(data.embedCode ?? "");
      setDashboards((prev) =>
        prev.map((dashboard) =>
          dashboard.id === activeDashboard.id
            ? { ...dashboard, shareEnabled: Boolean(data.shareEnabled), shareToken: data.shareToken ?? null }
            : dashboard
        )
      );
    } finally {
      setShareLoading(false);
    }
  };

  const copyShareValue = async (type: "url" | "embed", value: string) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopiedShare(type);
    setTimeout(() => setCopiedShare(""), 1500);
  };

  const openCreateWidget = () => {
    setEditingWidget(null);
    setWidgetType("ITEM_COUNT");
    setWidgetTitle("Item Count");
    setWidgetBoardId("all");
    setWidgetColumnId("none");
    setShowWidgetDialog(true);
  };

  const openEditWidget = (widget: Widget) => {
    const config = widget.config ?? {};
    setEditingWidget(widget);
    setWidgetType(widget.type);
    setWidgetTitle(widget.title);
    setWidgetBoardId(typeof config.boardId === "string" ? config.boardId : "all");
    setWidgetColumnId(typeof config.columnId === "string" ? config.columnId : "none");
    setShowWidgetDialog(true);
  };

  const saveWidget = async () => {
    if (!activeDashboard || !widgetTitle.trim()) return;

    const config: Record<string, unknown> = {};
    if (widgetBoardId !== "all") config.boardId = widgetBoardId;
    if (widgetColumnId !== "none") config.columnId = widgetColumnId;

    if (editingWidget) {
      const res = await fetch(`/api/dashboards/${activeDashboard.id}/widgets/${editingWidget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: widgetType,
          title: widgetTitle.trim(),
          config,
        }),
      });
      if (!res.ok) return;
      const json = await res.json();
      const updatedWidget = json.widget as Widget;
      setDashboards((prev) =>
        prev.map((dashboard) =>
          dashboard.id === activeDashboard.id
            ? {
                ...dashboard,
                widgets: dashboard.widgets.map((widget) =>
                  widget.id === updatedWidget.id ? updatedWidget : widget
                ),
              }
            : dashboard
        )
      );
    } else {
      const size = defaultSize(widgetType);
      const res = await fetch(`/api/dashboards/${activeDashboard.id}/widgets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: widgetType,
          title: widgetTitle.trim(),
          config,
          width: size.width,
          height: size.height,
        }),
      });
      if (!res.ok) return;
      const json = await res.json();
      const widget = json.widget as Widget;
      setDashboards((prev) =>
        prev.map((dashboard) =>
          dashboard.id === activeDashboard.id
            ? { ...dashboard, widgets: [...dashboard.widgets, widget] }
            : dashboard
        )
      );
    }

    setShowWidgetDialog(false);
    await loadWidgetData();
  };

  const deleteWidget = async (widgetId: string) => {
    if (!activeDashboard) return;
    await fetch(`/api/dashboards/${activeDashboard.id}/widgets/${widgetId}`, { method: "DELETE" });
    setDashboards((prev) =>
      prev.map((dashboard) =>
        dashboard.id === activeDashboard.id
          ? { ...dashboard, widgets: dashboard.widgets.filter((widget) => widget.id !== widgetId) }
          : dashboard
      )
    );
    setWidgetData((prev) => {
      const next = { ...prev };
      delete next[widgetId];
      return next;
    });
  };

  const persistOrder = async (dashboardId: string, widgets: Widget[]) => {
    await Promise.all(
      widgets.map((widget, index) =>
        fetch(`/api/dashboards/${dashboardId}/widgets/${widget.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: index }),
        })
      )
    );
  };

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination || !activeDashboard) return;
    if (result.destination.index === result.source.index) return;

    const widgets = [...activeDashboard.widgets].sort((a, b) => a.order - b.order);
    const [moved] = widgets.splice(result.source.index, 1);
    if (!moved) return;
    widgets.splice(result.destination.index, 0, moved);

    const reordered = widgets.map((widget, index) => ({ ...widget, order: index }));
    setDashboards((prev) =>
      prev.map((dashboard) =>
        dashboard.id === activeDashboard.id ? { ...dashboard, widgets: reordered } : dashboard
      )
    );

    await persistOrder(activeDashboard.id, reordered);
  };

  const renderWidget = (widget: Widget) => {
    const data = widgetData[widget.id] as Record<string, unknown> | undefined;

    if (loading) {
      return (
        <div className="flex h-32 items-center justify-center text-muted-foreground">
          Loading...
        </div>
      );
    }

    if (!data) {
      return (
        <div className="flex h-32 items-center justify-center text-muted-foreground text-sm">
          No data yet
        </div>
      );
    }

    if (data.error) {
      return (
        <div className="flex h-32 items-center justify-center text-destructive text-sm">
          {data.error as string}
        </div>
      );
    }

    switch (widget.type) {
      case "ITEM_COUNT": {
        const byBoard = (data.byBoard as { name: string; _count: { items: number } }[]) ?? [];
        return (
          <div className="space-y-3">
            <div className="text-3xl font-bold">{(data.total as number) ?? 0}</div>
            <div className="space-y-1">
              {byBoard.slice(0, 5).map((board) => (
                <div key={board.name} className="flex justify-between text-sm">
                  <span className="truncate">{board.name}</span>
                  <span className="font-medium">{board._count.items}</span>
                </div>
              ))}
            </div>
          </div>
        );
      }

      case "STATUS_BREAKDOWN":
      case "CHART_PIE": {
        const breakdown = (data.breakdown ?? data) as Record<string, number>;
        const chartData = Object.entries(breakdown).map(([name, value]) => ({ name, value }));
        return (
          <ResponsiveContainer width="100%" height={220}>
            <RechartsPie>
              <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}>
                {chartData.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </RechartsPie>
          </ResponsiveContainer>
        );
      }

      case "TIME_TRACKING_SUMMARY": {
        const totalSeconds = (data.totalSeconds as number) ?? 0;
        const hours = Math.floor(totalSeconds / 3600);
        const mins = Math.floor((totalSeconds % 3600) / 60);
        const running = (data.runningCount as number) ?? 0;
        return (
          <div className="space-y-3">
            <div className="text-3xl font-bold">{hours}h {mins}m</div>
            <div className="text-sm text-muted-foreground">
              {running} timer{running !== 1 ? "s" : ""} running
            </div>
          </div>
        );
      }

      case "TEAM_WORKLOAD": {
        const workload = (data.workload as { user: { firstName: string; lastName: string }; itemCount: number }[]) ?? [];
        const max = Math.max(...workload.map((entry) => entry.itemCount), 1);
        return (
          <div className="space-y-2">
            {workload.slice(0, 8).map((entry) => (
              <div key={`${entry.user.firstName}-${entry.user.lastName}`} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>{entry.user.firstName} {entry.user.lastName}</span>
                  <span className="font-medium">{entry.itemCount}</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-mamba-600" style={{ width: `${(entry.itemCount / max) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        );
      }

      case "NUMBER_SUMMARY": {
        return (
          <div className="grid grid-cols-2 gap-3">
            <div><div className="text-xs text-muted-foreground">Sum</div><div className="text-xl font-bold">{(data.sum as number)?.toLocaleString()}</div></div>
            <div><div className="text-xs text-muted-foreground">Average</div><div className="text-xl font-bold">{(data.avg as number)?.toFixed(1)}</div></div>
            <div><div className="text-xs text-muted-foreground">Min</div><div className="text-xl font-bold">{(data.min as number)?.toLocaleString()}</div></div>
            <div><div className="text-xs text-muted-foreground">Max</div><div className="text-xl font-bold">{(data.max as number)?.toLocaleString()}</div></div>
          </div>
        );
      }

      case "RECENT_ACTIVITY": {
        const activities = (data.activities as { user: { firstName: string; lastName: string }; action: string; item: { name: string } | null }[]) ?? [];
        return (
          <div className="space-y-2 max-h-64 overflow-auto">
            {activities.slice(0, 10).map((entry, index) => (
              <div key={index} className="flex items-start gap-2 text-sm">
                <div className="h-6 w-6 rounded-full bg-mamba-100 dark:bg-mamba-900/20 flex items-center justify-center text-xs font-bold text-mamba-700 dark:text-mamba-400 shrink-0">
                  {entry.user.firstName[0]}{entry.user.lastName[0]}
                </div>
                <div className="min-w-0">
                  <span className="font-medium">{entry.user.firstName} {entry.user.lastName}</span>{" "}
                  <span className="text-muted-foreground">{entry.action.replace(/_/g, " ").toLowerCase()}</span>
                  {entry.item && <span className="text-muted-foreground"> · {entry.item.name}</span>}
                </div>
              </div>
            ))}
          </div>
        );
      }

      case "CHART_BAR": {
        const labels = (data.labels as string[]) ?? [];
        const values = (data.data as number[]) ?? [];
        const chartData = labels.map((label, index) => ({ label, value: values[index] }));
        return (
          <ResponsiveContainer width="100%" height={220}>
            <RechartsBar data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Bar dataKey="value" fill="#579bfc" radius={[4, 4, 0, 0]} />
            </RechartsBar>
          </ResponsiveContainer>
        );
      }

      case "CHART_LINE": {
        const labels = (data.labels as string[]) ?? [];
        const values = (data.data as number[]) ?? [];
        const chartData = labels.map((label, index) => ({ label, value: values[index] }));
        return (
          <ResponsiveContainer width="100%" height={220}>
            <RechartsLine data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Line type="monotone" dataKey="value" stroke="#579bfc" strokeWidth={2} />
            </RechartsLine>
          </ResponsiveContainer>
        );
      }

      case "BURNDOWN": {
        const labels = (data.labels as string[]) ?? [];
        const created = (data.created as number[]) ?? [];
        const completed = (data.completed as number[]) ?? [];
        const chartData = labels.map((label, index) => ({ label, created: created[index], completed: completed[index] }));
        return (
          <ResponsiveContainer width="100%" height={220}>
            <RechartsLine data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Line type="monotone" dataKey="created" stroke="#579bfc" name="Created" />
              <Line type="monotone" dataKey="completed" stroke="#00c875" name="Completed" />
            </RechartsLine>
          </ResponsiveContainer>
        );
      }

      case "KANBAN": {
        const boardId = (widget.config as Record<string, unknown>)?.boardId as string | undefined;
        const kanbanGroups = (data.kanbanGroups as Array<{ id: string; name: string; color: string; items: Array<{ id: string; name: string; status: string | null }> }>) ?? [];
        return (
          <div className="space-y-3">
            {!boardId && (
              <p className="text-xs text-muted-foreground">Select a board to display Kanban view</p>
            )}
            {kanbanGroups.map((group) => (
              <div key={group.id} className="rounded-md border p-2">
                <div className="mb-1 flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: group.color }} />
                  <span className="text-xs font-medium">{group.name}</span>
                  <span className="text-[10px] text-muted-foreground">{group.items.length}</span>
                </div>
                <div className="space-y-1">
                  {group.items.slice(0, 5).map((item) => (
                    <div key={item.id} className="flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px] hover:bg-accent/30">
                      {item.status && <div className="h-1.5 w-1.5 rounded-full bg-blue-400" />}
                      <span className="truncate">{item.name}</span>
                    </div>
                  ))}
                  {group.items.length > 5 && <p className="text-[10px] text-muted-foreground pl-3">+{group.items.length - 5} more</p>}
                </div>
              </div>
            ))}
          </div>
        );
      }

      default:
        return <div className="text-sm text-muted-foreground">Unknown widget type</div>;
    }
  };

  const orderedWidgets = (activeDashboard?.widgets ?? []).slice().sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Insights</h1>
          <p className="text-muted-foreground">Cross-board dashboards and analytics</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowCreateDashboard(true)}>
            <Plus className="mr-1 h-4 w-4" /> New Dashboard
          </Button>
          {activeDashboard && (
            <Button size="sm" onClick={openCreateWidget}>
              <Plus className="mr-1 h-4 w-4" /> Add Widget
            </Button>
          )}
        </div>
      </div>

      {dashboards.length > 0 && (
        <div className="flex items-center gap-2 border-b pb-2">
          {dashboards.map((dashboard) => (
            <button
              key={dashboard.id}
              onClick={() => setActiveDashboardId(dashboard.id)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                activeDashboard?.id === dashboard.id
                  ? "bg-mamba-600 text-white"
                  : "text-muted-foreground hover:bg-accent"
              }`}
            >
              {dashboard.name}
            </button>
          ))}
          {activeDashboard && (
            <div className="ml-auto flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  setRenameDashboardName(activeDashboard.name);
                  setShowRenameDashboard(true);
                }}
                title="Rename dashboard"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={openShareDialog}
                title="Share dashboard"
              >
                <Share2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={deleteDashboard}
                title="Delete dashboard"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}

      {activeDashboard ? (
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="widgets">
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps} className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                {orderedWidgets.map((widget, index) => (
                  <Draggable key={widget.id} draggableId={widget.id} index={index}>
                    {(dragProvided, snapshot) => (
                      <Card
                        ref={dragProvided.innerRef}
                        {...dragProvided.draggableProps}
                        className={`${widget.width >= 2 ? "md:col-span-2" : ""} ${snapshot.isDragging ? "shadow-lg" : ""}`}
                      >
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                          <div className="flex items-center gap-2">
                            <button
                              {...dragProvided.dragHandleProps}
                              className="cursor-grab text-muted-foreground hover:text-foreground"
                              title="Drag to reorder"
                            >
                              <GripVertical className="h-4 w-4" />
                            </button>
                            <CardTitle className="text-sm font-medium">{widget.title}</CardTitle>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditWidget(widget)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => deleteWidget(widget.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent>{renderWidget(widget)}</CardContent>
                      </Card>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
                {orderedWidgets.length === 0 && (
                  <div className="col-span-full flex h-48 items-center justify-center rounded-lg border-2 border-dashed text-muted-foreground">
                    <div className="text-center">
                      <LayoutDashboard className="mx-auto mb-2 h-8 w-8" />
                      <p>No widgets yet. Add one to get started.</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      ) : (
        <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed text-muted-foreground">
          <div className="text-center">
            <LayoutDashboard className="mx-auto mb-2 h-8 w-8" />
            <p>Create a dashboard to start tracking insights</p>
            <Button className="mt-4" onClick={() => setShowCreateDashboard(true)}>
              <Plus className="mr-1 h-4 w-4" /> New Dashboard
            </Button>
          </div>
        </div>
      )}

      <Dialog open={showCreateDashboard} onOpenChange={setShowCreateDashboard}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Dashboard</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Dashboard name"
            value={newDashboardName}
            onChange={(event) => setNewDashboardName(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && createDashboard()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDashboard(false)}>Cancel</Button>
            <Button onClick={createDashboard} disabled={!newDashboardName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRenameDashboard} onOpenChange={setShowRenameDashboard}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Dashboard</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Dashboard name"
            value={renameDashboardName}
            onChange={(event) => setRenameDashboardName(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && renameDashboard()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRenameDashboard(false)}>Cancel</Button>
            <Button onClick={renameDashboard} disabled={!renameDashboardName.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showWidgetDialog} onOpenChange={setShowWidgetDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingWidget ? "Edit Widget" : "Add Widget"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Widget Type</label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {WIDGET_TYPES.map((type) => (
                  <button
                    key={type.value}
                    onClick={() => {
                      setWidgetType(type.value);
                      if (!editingWidget) {
                        setWidgetTitle(type.label);
                      }
                    }}
                    className={`flex items-center gap-2 rounded-lg border p-2 text-sm transition-colors ${
                      widgetType === type.value
                        ? "border-mamba-600 bg-mamba-50 dark:bg-mamba-900/20"
                        : "hover:bg-accent"
                    }`}
                  >
                    <type.icon className="h-4 w-4" />
                    {type.label}
                  </button>
                ))}
              </div>
            </div>
            <Input
              placeholder="Widget title"
              value={widgetTitle}
              onChange={(event) => setWidgetTitle(event.target.value)}
            />
            <div>
              <label className="text-sm font-medium">Board Filter</label>
              <Select value={widgetBoardId} onValueChange={(value) => {
                setWidgetBoardId(value);
                setWidgetColumnId("none");
              }}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="All boards" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Boards</SelectItem>
                  {boards.map((board) => (
                    <SelectItem key={board.id} value={board.id}>{board.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {WIDGETS_REQUIRING_COLUMN.has(widgetType) && selectedBoard && (
              <div>
                <label className="text-sm font-medium">Column</label>
                <Select value={widgetColumnId} onValueChange={setWidgetColumnId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select column" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {selectedBoard.columns.map((column) => (
                      <SelectItem key={column.id} value={column.id}>
                        {column.title} ({column.columnType})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWidgetDialog(false)}>Cancel</Button>
            <Button
              onClick={saveWidget}
              disabled={
                !widgetTitle.trim() ||
                (WIDGETS_REQUIRING_COLUMN.has(widgetType) && widgetBoardId !== "all" && widgetColumnId === "none")
              }
            >
              {editingWidget ? "Save" : "Add Widget"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Share Dashboard</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Public sharing</p>
                <p className="text-xs text-muted-foreground">Anyone with the link can view this dashboard.</p>
              </div>
              <Button
                size="sm"
                onClick={() => updateShare(!shareEnabled)}
                disabled={shareLoading}
                variant={shareEnabled ? "outline" : "default"}
              >
                {shareEnabled ? "Disable" : "Enable"}
              </Button>
            </div>

            {shareEnabled && (
              <>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Share link</label>
                  <div className="flex gap-2">
                    <Input value={shareUrl} readOnly />
                    <Button variant="outline" size="icon" onClick={() => copyShareValue("url", shareUrl)}>
                      {copiedShare === "url" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Embed iframe code</label>
                  <div className="flex gap-2">
                    <Input value={embedCode} readOnly />
                    <Button variant="outline" size="icon" onClick={() => copyShareValue("embed", embedCode)}>
                      {copiedShare === "embed" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => updateShare(true, true)} disabled={shareLoading}>
                  Regenerate Link
                </Button>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowShareDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
