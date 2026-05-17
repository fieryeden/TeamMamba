import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";

/**
 * POST /api/ai/summarize-board
 * Generate a natural language summary of a board's status.
 * Body: { boardId }
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { boardId } = body;
    if (!boardId) return NextResponse.json({ error: "boardId required" }, { status: 400 });

    const membership = await prisma.boardMember.findFirst({ where: { boardId, userId: user.id } });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const board = await prisma.board.findUnique({
      where: { id: boardId },
      include: {
        columns: true,
        groups: {
          include: {
            items: {
              include: {
                columnValues: { include: { column: true } },
                assignees: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
              },
            },
          },
        },
        members: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
      },
    });
    if (!board) return NextResponse.json({ error: "Board not found" }, { status: 404 });

    const allItems = board.groups.flatMap((g) => g.items);
    const statusCol = board.columns.find((c) => c.columnType === "STATUS");
    const dateCol = board.columns.find((c) => c.columnType === "DATE");

    // Status breakdown
    const statusCounts: Record<string, number> = {};
    let unassigned = 0;
    let overdue = 0;
    const overdueItems: string[] = [];

    for (const item of allItems) {
      const sv = item.columnValues.find((cv) => cv.columnId === statusCol?.id);
      const status = (sv?.value as Record<string, unknown> | null)?.label ?? "No Status";
      statusCounts[String(status)] = (statusCounts[String(status)] ?? 0) + 1;

      if (item.assignees.length === 0) unassigned++;

      if (dateCol) {
        const dv = item.columnValues.find((cv) => cv.columnId === dateCol.id);
        const dateStr = (dv?.value as Record<string, unknown> | null)?.date ?? (dv?.value as string | null);
        if (dateStr && new Date(String(dateStr)) < new Date()) {
          overdue++;
          overdueItems.push(item.name);
        }
      }
    }

    // Group summaries
    const groupSummaries = board.groups.map((g) => {
      const items = g.items;
      const doneCount = items.filter((item) => {
        const sv = item.columnValues.find((cv) => cv.columnId === statusCol?.id);
        const label = (sv?.value as Record<string, unknown> | null)?.label;
        return label === "Done" || label === "Complete";
      }).length;
      return {
        name: g.name,
        total: items.length,
        done: doneCount,
        progress: items.length > 0 ? Math.round((doneCount / items.length) * 100) : 0,
      };
    });

    // Workload per member
    const workload: Record<string, number> = {};
    for (const item of allItems) {
      for (const assignee of item.assignees) {
        const name = `${assignee.user.firstName} ${assignee.user.lastName}`;
        workload[name] = (workload[name] ?? 0) + 1;
      }
    }

    const healthScore = Math.max(0, 100 - unassigned * 5 - overdue * 10);

    // Build natural language summary
    const totalItems = allItems.length;
    const doneCount = statusCounts["Done"] ?? statusCounts["Complete"] ?? 0;
    const completionRate = totalItems > 0 ? Math.round((doneCount / totalItems) * 100) : 0;

    let summary = `Board "${board.name}" has ${totalItems} items across ${board.groups.length} groups. `;
    summary += `${completionRate}% complete (${doneCount} done). `;
    if (overdue > 0) {
      summary += `⚠️ ${overdue} item${overdue > 1 ? "s" : ""} overdue. `;
    }
    if (unassigned > 0) {
      summary += `${unassigned} item${unassigned > 1 ? "s" : ""} unassigned. `;
    }
    summary += `Health score: ${healthScore}/100.`;

    return NextResponse.json({
      summary,
      totalItems,
      completionRate,
      statusBreakdown: statusCounts,
      unassignedItems: unassigned,
      overdueItems: overdue,
      overdueItemNames: overdueItems.slice(0, 10),
      groupSummaries,
      workload,
      healthScore,
    });
  } catch (err) {
    console.error("AI summarize-board error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
