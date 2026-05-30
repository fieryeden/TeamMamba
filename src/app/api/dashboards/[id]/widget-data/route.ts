import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";

// Computes live data for a widget based on its type and config
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: dashboardId } = await params;

    const dashboard = await prisma.dashboard.findUnique({
      where: { id: dashboardId, ownerId: user.id },
      include: { widgets: { orderBy: { order: "asc" } } },
    });
    if (!dashboard) return NextResponse.json({ error: "Dashboard not found" }, { status: 404 });

    // Get user's accessible board IDs
    const memberBoards = await prisma.boardMember.findMany({
      where: { userId: user.id },
      select: { boardId: true },
    });
    const boardIds = memberBoards.map((m) => m.boardId);

    const results: Record<string, unknown> = {};

    for (const widget of dashboard.widgets) {
      const config = (widget.config as Record<string, unknown>) ?? {};
      const widgetBoardIds = config.boardId
        ? [config.boardId as string]
        : boardIds;

      switch (widget.type) {
        case "ITEM_COUNT": {
          const count = await prisma.item.count({
            where: { boardId: { in: widgetBoardIds } },
          });
          const byBoard = await prisma.board.findMany({
            where: { id: { in: widgetBoardIds } },
            select: { id: true, name: true, _count: { select: { items: true } } },
          });
          results[widget.id] = { total: count, byBoard };
          break;
        }

        case "STATUS_BREAKDOWN": {
          const columnId = config.columnId as string | undefined;
          if (!columnId) {
            results[widget.id] = { error: "No columnId configured" };
            break;
          }
          const values = await prisma.columnValue.findMany({
            where: {
              columnId,
              item: { boardId: { in: widgetBoardIds } },
            },
            select: { value: true },
          });
          const breakdown: Record<string, number> = {};
          for (const v of values) {
            const val = v.value as Record<string, unknown> | null;
            const label = String(val?.["label"] ?? val?.["index"] ?? "empty");
            breakdown[label] = (breakdown[label] || 0) + 1;
          }
          results[widget.id] = { breakdown };
          break;
        }

        case "TIME_TRACKING_SUMMARY": {
          const entries = await prisma.timeEntry.findMany({
            where: { item: { boardId: { in: widgetBoardIds } } },
            select: { durationSeconds: true, userId: true, isRunning: true },
          });
          const totalSeconds = entries.reduce((sum, e) => sum + e.durationSeconds, 0);
          const runningCount = entries.filter((e) => e.isRunning).length;
          const byUser: Record<string, number> = {};
          for (const e of entries) {
            byUser[e.userId] = (byUser[e.userId] || 0) + e.durationSeconds;
          }
          results[widget.id] = { totalSeconds, runningCount, byUser };
          break;
        }

        case "TEAM_WORKLOAD": {
          const assignees = await prisma.itemAssignee.findMany({
            where: { item: { boardId: { in: widgetBoardIds } } },
            select: {
              userId: true,
              user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
            },
          });
          const workload: Record<string, { user: { id: string; firstName: string; lastName: string; avatarUrl: string | null }; itemCount: number }> = {};
          for (const a of assignees) {
            if (!workload[a.userId]) {
              workload[a.userId] = { user: a.user, itemCount: 0 };
            }
            workload[a.userId].itemCount++;
          }
          results[widget.id] = { workload: Object.values(workload) };
          break;
        }

        case "NUMBER_SUMMARY": {
          const columnId = config.columnId as string | undefined;
          if (!columnId) {
            results[widget.id] = { error: "No columnId configured" };
            break;
          }
          const values = await prisma.columnValue.findMany({
            where: {
              columnId,
              item: { boardId: { in: widgetBoardIds } },
            },
            select: { value: true },
          });
          const nums = values
            .map((v) => {
              const val = v.value as Record<string, unknown> | null;
              return Number(val?.["number"] ?? val?.["value"] ?? 0);
            })
            .filter((n) => Number.isFinite(n));
          const sum = nums.reduce((a, b) => a + b, 0);
          results[widget.id] = {
            sum,
            avg: nums.length ? sum / nums.length : 0,
            min: nums.length ? Math.min(...nums) : 0,
            max: nums.length ? Math.max(...nums) : 0,
            count: nums.length,
          };
          break;
        }

        case "RECENT_ACTIVITY": {
          const activities = await prisma.activity.findMany({
            where: { boardId: { in: widgetBoardIds } },
            include: {
              user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
              item: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: "desc" },
            take: 20,
          });
          results[widget.id] = { activities };
          break;
        }

        case "CHART_BAR":
        case "CHART_LINE":
        case "CHART_PIE": {
          const groupByColumnId = config.columnId as string | undefined;
          const seriesColumnId = config.seriesColumnId as string | undefined;
          const comparePeriod = config.comparePeriod as string | undefined;
          
          if (!groupByColumnId) {
            results[widget.id] = { error: "No columnId configured" };
            break;
          }

          const values = await prisma.columnValue.findMany({
            where: {
              columnId: groupByColumnId,
              item: { boardId: { in: widgetBoardIds } },
            },
            select: {
              value: true,
              itemId: true,
              item: { select: { createdAt: true, updatedAt: true } },
            },
          });

          // Single series (original behavior)
          if (!seriesColumnId && !comparePeriod) {
            const grouped: Record<string, number> = {};
            for (const v of values) {
              const val = v.value as Record<string, unknown> | null;
              const label = String(val?.["label"] ?? val?.["index"] ?? "empty");
              grouped[label] = (grouped[label] || 0) + 1;
            }
            results[widget.id] = {
              chartType: widget.type === "CHART_BAR" ? "bar" : widget.type === "CHART_LINE" ? "line" : "pie",
              labels: Object.keys(grouped),
              data: Object.values(grouped),
            };
            break;
          }

          // Multi-series: group by second column
          const seriesValues = seriesColumnId
            ? await prisma.columnValue.findMany({
                where: {
                  columnId: seriesColumnId,
                  itemId: { in: values.map((v) => v.itemId).filter((id): id is string => id !== null) },
                },
                select: { value: true, itemId: true },
              })
            : [];

          const seriesByItem = new Map<string, string>();
          for (const sv of seriesValues) {
            const val = sv.value as Record<string, unknown> | null;
            if (sv.itemId) seriesByItem.set(sv.itemId, String(val?.["label"] ?? val?.["index"] ?? "Unknown"));
          }

          // Build series data
          const seriesMap: Record<string, Record<string, number>> = {};
          const allLabels = new Set<string>();

          for (const v of values) {
            const val = v.value as Record<string, unknown> | null;
            const label = String(val?.["label"] ?? val?.["index"] ?? "empty");
            const seriesName = seriesByItem.get(v.itemId ?? "") || "Current";
            allLabels.add(label);
            if (!seriesMap[seriesName]) seriesMap[seriesName] = {};
            seriesMap[seriesName][label] = (seriesMap[seriesName][label] || 0) + 1;
          }

          // Compare period support
          if (comparePeriod && comparePeriod !== "none") {
            const now = new Date();
            const periods: Record<string, Date> = {
              "last_week": new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
              "last_month": new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
              "last_quarter": new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
            };
            const cutoff = periods[comparePeriod];
            if (cutoff) {
              const previousValues = values.filter((v) => v.item && v.item.createdAt < cutoff);
              const previousGrouped: Record<string, number> = {};
              for (const v of previousValues) {
                const val = v.value as Record<string, unknown> | null;
                const label = String(val?.["label"] ?? val?.["index"] ?? "empty");
                previousGrouped[label] = (previousGrouped[label] || 0) + 1;
              }
              seriesMap["Previous (" + comparePeriod + ")"] = previousGrouped;
              Object.keys(previousGrouped).forEach((l) => allLabels.add(l));
            }
          }

          const labels = Array.from(allLabels);
          const datasets = Object.entries(seriesMap).map(([name, data]) => ({
            label: name,
            data: labels.map((l) => data[l] || 0),
          }));

          results[widget.id] = {
            chartType: widget.type === "CHART_BAR" ? "bar" : widget.type === "CHART_LINE" ? "line" : "pie",
            labels,
            datasets,
            multiSeries: true,
          };
          break;
        }

        case "BURNDOWN": {
          // Items created vs completed over time (past 30 days)
          const since = new Date();
          since.setDate(since.getDate() - 30);

          const created = await prisma.item.findMany({
            where: { boardId: { in: widgetBoardIds }, createdAt: { gte: since } },
            select: { createdAt: true },
          });

          // Count "Done" status items
          const doneColumns = await prisma.boardColumn.findMany({
            where: { boardId: { in: widgetBoardIds }, columnType: "STATUS" },
            select: { id: true },
          });

          const doneValues = await prisma.columnValue.findMany({
            where: {
              columnId: { in: doneColumns.map((c) => c.id) },
              value: { path: ["label"], string_contains: "Done" },
              item: { boardId: { in: widgetBoardIds } },
            },
            select: { updatedAt: true },
          });

          // Bucket by day
          const byDay: Record<string, { created: number; completed: number }> = {};
          for (let i = 0; i < 30; i++) {
            const d = new Date();
            d.setDate(d.getDate() - (29 - i));
            const key = d.toISOString().slice(0, 10);
            byDay[key] = { created: 0, completed: 0 };
          }
          for (const c of created) {
            const key = c.createdAt.toISOString().slice(0, 10);
            if (byDay[key]) byDay[key].created++;
          }
          for (const d of doneValues) {
            const key = d.updatedAt.toISOString().slice(0, 10);
            if (byDay[key]) byDay[key].completed++;
          }

          results[widget.id] = {
            labels: Object.keys(byDay),
            created: Object.values(byDay).map((v) => v.created),
            completed: Object.values(byDay).map((v) => v.completed),
          };
          break;
        }

        case "KANBAN": {
          const kanbanBoardId = config.boardId as string | undefined;
          if (!kanbanBoardId) {
            results[widget.id] = { error: "No boardId configured" };
            break;
          }
          const boardGroups = await prisma.group.findMany({
            where: { boardId: kanbanBoardId },
            include: {
              items: {
                include: {
                  columnValues: {
                    where: { column: { columnType: "STATUS" } },
                    select: { value: true },
                  },
                },
                take: 50,
              },
            },
            orderBy: { position: "asc" },
          });
          results[widget.id] = {
            kanbanGroups: boardGroups.map((g) => ({
              id: g.id,
              name: g.name,
              color: g.color,
              items: g.items.map((item) => ({
                id: item.id,
                name: item.name,
                status: item.columnValues[0]?.value
                  ? String((item.columnValues[0].value as Record<string, unknown>)?.label ?? (item.columnValues[0].value as Record<string, unknown>)?.index ?? null)
                  : null,
              })),
            })),
          };
          break;
        }

        default:
          results[widget.id] = { error: "Unknown widget type" };
      }
    }

    return NextResponse.json({ data: results });
  } catch (err) {
    console.error("Widget data error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
