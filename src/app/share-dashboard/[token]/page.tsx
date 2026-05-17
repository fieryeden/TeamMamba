import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === "object") {
    const entry = value as Record<string, unknown>;
    if (typeof entry.number === "number") return entry.number;
    if (typeof entry.value === "number") return entry.value;
  }
  return null;
}

async function computeWidgetData(token: string) {
  const dashboard = await prisma.dashboard.findFirst({
    where: { shareToken: token, shareEnabled: true },
    include: { widgets: { orderBy: { order: "asc" } } },
  });
  if (!dashboard) return null;

  const memberBoards = await prisma.boardMember.findMany({
    where: { userId: dashboard.ownerId },
    select: { boardId: true },
  });
  const boardIds = memberBoards.map((entry) => entry.boardId);

  const data: Record<string, unknown> = {};

  for (const widget of dashboard.widgets) {
    const config = (widget.config as Record<string, unknown>) ?? {};
    const widgetBoardIds = config.boardId ? [String(config.boardId)] : boardIds;

    if (widget.type === "ITEM_COUNT") {
      data[widget.id] = {
        total: await prisma.item.count({ where: { boardId: { in: widgetBoardIds } } }),
      };
      continue;
    }

    if (widget.type === "NUMBER_SUMMARY") {
      const columnId = typeof config.columnId === "string" ? config.columnId : null;
      if (!columnId) {
        data[widget.id] = { error: "No column configured" };
        continue;
      }
      const values = await prisma.columnValue.findMany({
        where: { columnId, item: { boardId: { in: widgetBoardIds } } },
        select: { value: true },
      });
      const nums = values.map((entry) => toNumber(entry.value)).filter((entry): entry is number => entry != null);
      const sum = nums.reduce((acc, entry) => acc + entry, 0);
      data[widget.id] = {
        sum,
        avg: nums.length ? sum / nums.length : 0,
        min: nums.length ? Math.min(...nums) : 0,
        max: nums.length ? Math.max(...nums) : 0,
        count: nums.length,
      };
      continue;
    }

    if (widget.type === "TIME_TRACKING_SUMMARY") {
      const entries = await prisma.timeEntry.findMany({
        where: { item: { boardId: { in: widgetBoardIds } } },
        select: { durationSeconds: true, isRunning: true },
      });
      data[widget.id] = {
        totalSeconds: entries.reduce((sum, entry) => sum + entry.durationSeconds, 0),
        runningCount: entries.filter((entry) => entry.isRunning).length,
      };
      continue;
    }

    if (widget.type === "RECENT_ACTIVITY") {
      data[widget.id] = {
        activities: await prisma.activity.findMany({
          where: { boardId: { in: widgetBoardIds } },
          include: {
            user: { select: { firstName: true, lastName: true } },
            item: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
      };
      continue;
    }

    data[widget.id] = { note: "Widget is available in the full app view" };
  }

  return { dashboard, data };
}

export default async function SharedDashboardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const payload = await computeWidgetData(token);
  if (!payload) return notFound();

  const { dashboard, data } = payload;

  return (
    <div className="min-h-screen bg-muted/20 px-4 py-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="rounded-lg border bg-card p-4">
          <h1 className="text-2xl font-semibold">{dashboard.name}</h1>
          <p className="text-sm text-muted-foreground">Public dashboard view</p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {dashboard.widgets.map((widget) => {
            const widgetData = data[widget.id] as Record<string, unknown> | undefined;
            return (
              <div key={widget.id} className="rounded-lg border bg-card p-4">
                <p className="text-sm font-semibold">{widget.title}</p>
                <p className="mb-3 text-xs text-muted-foreground">{widget.type.replace(/_/g, " ")}</p>
                {widget.type === "ITEM_COUNT" && (
                  <p className="text-3xl font-bold">{Number(widgetData?.total ?? 0).toLocaleString()}</p>
                )}
                {widget.type === "NUMBER_SUMMARY" && (
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>Sum: {Number(widgetData?.sum ?? 0).toLocaleString()}</div>
                    <div>Avg: {Number(widgetData?.avg ?? 0).toFixed(1)}</div>
                    <div>Min: {Number(widgetData?.min ?? 0).toLocaleString()}</div>
                    <div>Max: {Number(widgetData?.max ?? 0).toLocaleString()}</div>
                  </div>
                )}
                {widget.type === "TIME_TRACKING_SUMMARY" && (
                  <div className="text-sm">
                    <p>Total seconds: {Number(widgetData?.totalSeconds ?? 0).toLocaleString()}</p>
                    <p>Running timers: {Number(widgetData?.runningCount ?? 0).toLocaleString()}</p>
                  </div>
                )}
                {widget.type === "RECENT_ACTIVITY" && (
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {((widgetData?.activities as Array<{ id: string; action: string; item: { name: string } | null; user: { firstName: string; lastName: string } }> | undefined) ?? []).slice(0, 5).map((activity) => (
                      <p key={activity.id}>
                        {activity.user.firstName} {activity.user.lastName} • {activity.action.replace(/_/g, " ").toLowerCase()}
                        {activity.item ? ` • ${activity.item.name}` : ""}
                      </p>
                    ))}
                  </div>
                )}
                {!["ITEM_COUNT", "NUMBER_SUMMARY", "TIME_TRACKING_SUMMARY", "RECENT_ACTIVITY"].includes(widget.type) && (
                  <p className="text-xs text-muted-foreground">{String(widgetData?.note ?? "No public preview")}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
