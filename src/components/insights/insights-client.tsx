"use client";

import { useState, useCallback, useEffect } from "react";
import {
  LayoutDashboard, Plus, Trash2, Settings2, BarChart3, PieChart, LineChart,
  Activity, Clock, Users, TrendingDown, Hash, BarChart,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  BarChart as RechartsBar, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart as RechartsPie, Pie, Cell, LineChart as RechartsLine, Line,
} from "recharts";

type Dashboard = {
  id: string;
  name: string;
  description: string | null;
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
  { value: "BURNDOWN", label: "Burndown", icon: TrendingDown },
  { value: "NUMBER_SUMMARY", label: "Number Summary", icon: BarChart3 },
  { value: "RECENT_ACTIVITY", label: "Recent Activity", icon: Activity },
  { value: "CHART_BAR", label: "Bar Chart", icon: BarChart },
  { value: "CHART_LINE", label: "Line Chart", icon: LineChart },
  { value: "CHART_PIE", label: "Pie Chart", icon: PieChart },
];

const COLORS = ["#579bfc", "#fdab3d", "#e2445c", "#00c875", "#a25ddc", "#ff158a", "#ff642e", "#037f4c"];

interface InsightsClientProps {
  user: { id: string; firstName: string; lastName: string; email: string; avatarUrl: string | null; role: string };
  dashboards: Dashboard[];
  boards: Board[];
}

export function InsightsClient({ user, dashboards: initialDashboards, boards }: InsightsClientProps) {
  const [dashboards, setDashboards] = useState<Dashboard[]>(initialDashboards);
  const [activeDashboard, setActiveDashboard] = useState<Dashboard | null>(
    initialDashboards[0] || null
  );
  const [widgetData, setWidgetData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [showNewDashboard, setShowNewDashboard] = useState(false);
  const [showAddWidget, setShowAddWidget] = useState(false);
  const [newDashName, setNewDashName] = useState("");
  const [newWidgetType, setNewWidgetType] = useState("ITEM_COUNT");
  const [newWidgetTitle, setNewWidgetTitle] = useState("");
  const [newWidgetBoardId, setNewWidgetBoardId] = useState<string>("");
  const [newWidgetColumnId, setNewWidgetColumnId] = useState<string>("");

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

  const createDashboard = async () => {
    if (!newDashName.trim()) return;
    const res = await fetch("/api/dashboards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newDashName.trim() }),
    });
    if (res.ok) {
      const json = await res.json();
      setDashboards((prev) => [...prev, json.dashboard]);
      setActiveDashboard(json.dashboard);
      setNewDashName("");
      setShowNewDashboard(false);
    }
  };

  const addWidget = async () => {
    if (!activeDashboard || !newWidgetTitle.trim()) return;
    const config: Record<string, unknown> = {};
    if (newWidgetBoardId) config.boardId = newWidgetBoardId;
    if (newWidgetColumnId) config.columnId = newWidgetColumnId;

    const res = await fetch(`/api/dashboards/${activeDashboard.id}/widgets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: newWidgetType,
        title: newWidgetTitle.trim(),
        config,
        width: ["CHART_BAR", "CHART_LINE", "CHART_PIE", "BURNDOWN", "STATUS_BREAKDOWN"].includes(newWidgetType) ? 2 : 1,
        height: ["BURNDOWN", "CHART_LINE"].includes(newWidgetType) ? 2 : 1,
      }),
    });
    if (res.ok) {
      const json = await res.json();
      setActiveDashboard((prev) =>
        prev ? { ...prev, widgets: [...prev.widgets, json.widget] } : null
      );
      setDashboards((prev) =>
        prev.map((d) =>
          d.id === activeDashboard.id
            ? { ...d, widgets: [...d.widgets, json.widget] }
            : d
        )
      );
      setShowAddWidget(false);
      setNewWidgetTitle("");
      setNewWidgetType("ITEM_COUNT");
      loadWidgetData();
    }
  };

  const deleteWidget = async (widgetId: string) => {
    if (!activeDashboard) return;
    await fetch(`/api/dashboards/${activeDashboard.id}/widgets/${widgetId}`, { method: "DELETE" });
    setActiveDashboard((prev) =>
      prev ? { ...prev, widgets: prev.widgets.filter((w) => w.id !== widgetId) } : null
    );
    setWidgetData((prev) => {
      const next = { ...prev };
      delete next[widgetId];
      return next;
    });
  };

  const deleteDashboard = async (dashId: string) => {
    await fetch(`/api/dashboards/${dashId}`, { method: "DELETE" });
    const updated = dashboards.filter((d) => d.id !== dashId);
    setDashboards(updated);
    if (activeDashboard?.id === dashId) {
      setActiveDashboard(updated[0] || null);
    }
  };

  const selectedBoard = boards.find((b) => b.id === newWidgetBoardId);

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
              {byBoard.slice(0, 5).map((b) => (
                <div key={b.name} className="flex justify-between text-sm">
                  <span className="truncate">{b.name}</span>
                  <span className="font-medium">{b._count.items}</span>
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
          <ResponsiveContainer width="100%" height={200}>
            <RechartsPie>
              <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
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
        const max = Math.max(...workload.map((w) => w.itemCount), 1);
        return (
          <div className="space-y-2">
            {workload.slice(0, 8).map((w) => (
              <div key={w.user.firstName + w.user.lastName} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>{w.user.firstName} {w.user.lastName}</span>
                  <span className="font-medium">{w.itemCount}</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-mamba-600"
                    style={{ width: `${(w.itemCount / max) * 100}%` }}
                  />
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
        const activities = (data.activities as { user: { firstName: string; lastName: string }; action: string; item: { name: string } | null; createdAt: string }[]) ?? [];
        return (
          <div className="space-y-2 max-h-64 overflow-auto">
            {activities.slice(0, 10).map((a, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <div className="h-6 w-6 rounded-full bg-mamba-100 dark:bg-mamba-900/20 flex items-center justify-center text-xs font-bold text-mamba-700 dark:text-mamba-400 shrink-0">
                  {a.user.firstName[0]}{a.user.lastName[0]}
                </div>
                <div className="min-w-0">
                  <span className="font-medium">{a.user.firstName} {a.user.lastName}</span>{" "}
                  <span className="text-muted-foreground">{a.action.replace(/_/g, " ").toLowerCase()}</span>
                  {a.item && <span className="text-muted-foreground"> · {a.item.name}</span>}
                </div>
              </div>
            ))}
          </div>
        );
      }

      case "CHART_BAR": {
        const labels = (data.labels as string[]) ?? [];
        const chartValues = (data.data as number[]) ?? [];
        const chartData = labels.map((label, i) => ({ label, value: chartValues[i] }));
        return (
          <ResponsiveContainer width="100%" height={200}>
            <RechartsBar data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Bar dataKey="value" fill="#6B4F9F" radius={[4, 4, 0, 0]} />
            </RechartsBar>
          </ResponsiveContainer>
        );
      }

      case "CHART_LINE": {
        const labels = (data.labels as string[]) ?? [];
        const chartValues = (data.data as number[]) ?? [];
        const chartData = labels.map((label, i) => ({ label, value: chartValues[i] }));
        return (
          <ResponsiveContainer width="100%" height={200}>
            <RechartsLine data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" fontSize={10} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Line type="monotone" dataKey="value" stroke="#6B4F9F" strokeWidth={2} />
            </RechartsLine>
          </ResponsiveContainer>
        );
      }

      case "BURNDOWN": {
        const labels = (data.labels as string[]) ?? [];
        const created = (data.created as number[]) ?? [];
        const completed = (data.completed as number[]) ?? [];
        const chartData = labels.map((label, i) => ({ label, created: created[i], completed: completed[i] }));
        return (
          <ResponsiveContainer width="100%" height={250}>
            <RechartsLine data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" fontSize={10} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Line type="monotone" dataKey="created" stroke="#579bfc" name="Created" />
              <Line type="monotone" dataKey="completed" stroke="#00c875" name="Completed" />
            </RechartsLine>
          </ResponsiveContainer>
        );
      }

      default:
        return <div className="text-sm text-muted-foreground">Unknown widget type</div>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Insights</h1>
          <p className="text-muted-foreground">Cross-board dashboards and analytics</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowNewDashboard(true)}>
            <Plus className="mr-1 h-4 w-4" /> New Dashboard
          </Button>
          {activeDashboard && (
            <Button size="sm" onClick={() => setShowAddWidget(true)}>
              <Plus className="mr-1 h-4 w-4" /> Add Widget
            </Button>
          )}
        </div>
      </div>

      {/* Dashboard tabs */}
      {dashboards.length > 0 && (
        <div className="flex items-center gap-2 border-b pb-2">
          {dashboards.map((d) => (
            <button
              key={d.id}
              onClick={() => setActiveDashboard(d)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                activeDashboard?.id === d.id
                  ? "bg-mamba-600 text-white"
                  : "text-muted-foreground hover:bg-accent"
              }`}
            >
              {d.name}
            </button>
          ))}
          {activeDashboard && (
            <button
              onClick={() => deleteDashboard(activeDashboard.id)}
              className="ml-auto text-muted-foreground hover:text-destructive"
              title="Delete dashboard"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* Widget Grid */}
      {activeDashboard ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {activeDashboard.widgets.map((widget) => (
            <Card
              key={widget.id}
              className={`${
                widget.width >= 2 ? "md:col-span-2" : ""
              } ${widget.height >= 2 ? "row-span-2" : ""}`}
            >
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">{widget.title}</CardTitle>
                <button
                  onClick={() => deleteWidget(widget.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </CardHeader>
              <CardContent>{renderWidget(widget)}</CardContent>
            </Card>
          ))}
          {activeDashboard.widgets.length === 0 && (
            <div className="col-span-full flex h-48 items-center justify-center rounded-lg border-2 border-dashed text-muted-foreground">
              <div className="text-center">
                <LayoutDashboard className="mx-auto mb-2 h-8 w-8" />
                <p>No widgets yet. Add one to get started.</p>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed text-muted-foreground">
          <div className="text-center">
            <LayoutDashboard className="mx-auto mb-2 h-8 w-8" />
            <p>Create a dashboard to start tracking insights</p>
            <Button className="mt-4" onClick={() => setShowNewDashboard(true)}>
              <Plus className="mr-1 h-4 w-4" /> New Dashboard
            </Button>
          </div>
        </div>
      )}

      {/* New Dashboard Dialog */}
      <Dialog open={showNewDashboard} onOpenChange={setShowNewDashboard}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Dashboard</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Dashboard name"
            value={newDashName}
            onChange={(e) => setNewDashName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createDashboard()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewDashboard(false)}>Cancel</Button>
            <Button onClick={createDashboard} disabled={!newDashName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Widget Dialog */}
      <Dialog open={showAddWidget} onOpenChange={setShowAddWidget}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Widget</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Widget Type</label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {WIDGET_TYPES.map((wt) => (
                  <button
                    key={wt.value}
                    onClick={() => {
                      setNewWidgetType(wt.value);
                      if (!newWidgetTitle) setNewWidgetTitle(wt.label);
                    }}
                    className={`flex items-center gap-2 rounded-lg border p-2 text-sm transition-colors ${
                      newWidgetType === wt.value
                        ? "border-mamba-600 bg-mamba-50 dark:bg-mamba-900/20"
                        : "hover:bg-accent"
                    }`}
                  >
                    <wt.icon className="h-4 w-4" />
                    {wt.label}
                  </button>
                ))}
              </div>
            </div>
            <Input
              placeholder="Widget title"
              value={newWidgetTitle}
              onChange={(e) => setNewWidgetTitle(e.target.value)}
            />
            <div>
              <label className="text-sm font-medium">Board (optional — leave empty for all boards)</label>
              <select
                className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
                value={newWidgetBoardId}
                onChange={(e) => {
                  setNewWidgetBoardId(e.target.value);
                  setNewWidgetColumnId("");
                }}
              >
                <option value="">All Boards</option>
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            {newWidgetBoardId && selectedBoard && (
              <div>
                <label className="text-sm font-medium">Column (optional)</label>
                <select
                  className="mt-1 w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
                  value={newWidgetColumnId}
                  onChange={(e) => setNewWidgetColumnId(e.target.value)}
                >
                  <option value="">None</option>
                  {selectedBoard.columns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title} ({c.columnType})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddWidget(false)}>Cancel</Button>
            <Button onClick={addWidget} disabled={!newWidgetTitle.trim()}>Add Widget</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
