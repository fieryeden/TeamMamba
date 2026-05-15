import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";

/**
 * POST /api/ai/suggest
 * AI-powered suggestions for items: auto-assign, predict status, suggest priority
 * Body: { boardId, itemId?, action: "assign" | "priority" | "status" | "categorize" }
 *
 * Uses heuristics + board patterns (no external LLM needed for v1).
 * Future: plug in OpenAI/Anthropic for smarter suggestions.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { boardId, itemId, action } = body;

    if (!boardId) return NextResponse.json({ error: "boardId required" }, { status: 400 });

    const membership = await prisma.boardMember.findFirst({
      where: { boardId, userId: user.id },
    });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const board = await prisma.board.findUnique({
      where: { id: boardId },
      include: {
        columns: true,
        groups: { include: { items: { include: { columnValues: { include: { column: true } }, assignees: { include: { user: true } } } } } },
        members: { include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } } },
      },
    });

    if (!board) return NextResponse.json({ error: "Board not found" }, { status: 404 });

    const allItems = board.groups.flatMap((g) => g.items);
    const statusCol = board.columns.find((c) => c.columnType === "STATUS" && c.title.toLowerCase().includes("status"));
    const priorityCol = board.columns.find((c) => c.columnType === "STATUS" && c.title.toLowerCase().includes("priority"));
    const peopleCol = board.columns.find((c) => c.columnType === "PEOPLE");

    switch (action) {
      case "assign": {
        // Suggest assignees based on workload balance — who has the fewest items?
        const memberWorkload = new Map<string, number>();
        for (const member of board.members) {
          memberWorkload.set(member.user.id, 0);
        }
        for (const item of allItems) {
          for (const assignee of item.assignees) {
            memberWorkload.set(assignee.userId, (memberWorkload.get(assignee.userId) ?? 0) + 1);
          }
        }
        const sorted = Array.from(memberWorkload.entries())
          .sort((a, b) => a[1] - b[1])
          .slice(0, 3)
          .map(([userId, count]) => {
            const member = board.members.find((m) => m.user.id === userId);
            return {
              userId,
              name: member ? `${member.user.firstName} ${member.user.lastName}` : userId,
              itemCount: count,
              reason: count === 0 ? "No current assignments" : `Only ${count} item${count > 1 ? "s" : ""} assigned`,
            };
          });
        return NextResponse.json({ suggestions: sorted });
      }

      case "priority": {
        // Suggest priority based on item name keywords
        if (!itemId) return NextResponse.json({ error: "itemId required for priority suggestion" }, { status: 400 });

        const item = allItems.find((i) => i.id === itemId);
        if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

        const name = item.name.toLowerCase();
        let suggestedPriority = "Medium";
        let confidence = 0.5;

        const criticalWords = ["urgent", "critical", "asap", "blocker", "down", "outage", "broken"];
        const highWords = ["important", "high", "deadline", "release", "launch", "fix"];
        const lowWords = ["nice to have", "later", "someday", "chore", "cleanup", "refactor"];

        if (criticalWords.some((w) => name.includes(w))) {
          suggestedPriority = "Critical";
          confidence = 0.9;
        } else if (highWords.some((w) => name.includes(w))) {
          suggestedPriority = "High";
          confidence = 0.8;
        } else if (lowWords.some((w) => name.includes(w))) {
          suggestedPriority = "Low";
          confidence = 0.7;
        }

        return NextResponse.json({ suggestion: suggestedPriority, confidence });
      }

      case "status": {
        // Predict likely next status based on board patterns
        if (!itemId) return NextResponse.json({ error: "itemId required for status suggestion" }, { status: 400 });

        const item = allItems.find((i) => i.id === itemId);
        if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

        // If item has no status, suggest "Working on it"
        // If item is "Working on it", suggest "Done" if it has assignees and is older
        const statusVal = item.columnValues.find((cv) => cv.columnId === statusCol?.id);
        const currentStatus = (statusVal?.value as any)?.label ?? null;

        let suggestion = "Working on it";
        let confidence = 0.5;

        if (!currentStatus || currentStatus === "Not Started") {
          suggestion = "Working on it";
          confidence = 0.7;
        } else if (currentStatus === "Working on it") {
          const age = Date.now() - new Date(item.createdAt).getTime();
          const hasAssignees = item.assignees.length > 0;
          if (hasAssignees && age > 86400000 * 3) { // 3+ days with assignees
            suggestion = "Done";
            confidence = 0.6;
          } else {
            suggestion = "Working on it";
            confidence = 0.8;
          }
        } else if (currentStatus === "Stuck") {
          suggestion = "Working on it";
          confidence = 0.5;
        }

        return NextResponse.json({ suggestion, confidence, currentStatus });
      }

      case "categorize": {
        // Suggest which group an item belongs to based on name patterns
        if (!itemId) return NextResponse.json({ error: "itemId required for categorization" }, { status: 400 });

        const item = allItems.find((i) => i.id === itemId);
        if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

        const groupScores = board.groups.map((group) => {
          const groupItems = group.items.map((i) => i.name.toLowerCase());
          const groupWords = groupItems.join(" ").split(/\s+/).filter((w) => w.length > 3);
          const itemWords = item.name.toLowerCase().split(/\s+/).filter((w) => w.length > 3);

          const overlap = itemWords.filter((w) => groupWords.includes(w)).length;
          return {
            groupId: group.id,
            groupName: group.name,
            score: groupItems.length === 0 ? 0 : overlap / Math.max(itemWords.length, 1),
            itemCount: groupItems.length,
          };
        });

        groupScores.sort((a, b) => b.score - a.score);
        const best = groupScores[0];

        return NextResponse.json({
          suggestion: best.score > 0 ? best.groupName : null,
          groupId: best.score > 0 ? best.groupId : null,
          confidence: Math.min(best.score * 2, 1),
          alternatives: groupScores.slice(1, 3).filter((g) => g.score > 0),
        });
      }

      case "summarize": {
        // Summarize board status — counts by status, overdue items, workload
        const statusCounts: Record<string, number> = {};
        let unassigned = 0;
        let overdue = 0;

        const dateCol = board.columns.find((c) => c.columnType === "DATE");

        for (const item of allItems) {
          // Status
          const sv = item.columnValues.find((cv) => cv.columnId === statusCol?.id);
          const status = (sv?.value as any)?.label ?? "No Status";
          statusCounts[status] = (statusCounts[status] ?? 0) + 1;

          // Assignees
          if (item.assignees.length === 0) unassigned++;

          // Overdue check
          if (dateCol) {
            const dv = item.columnValues.find((cv) => cv.columnId === dateCol.id);
            const dateStr = (dv?.value as any)?.date;
            if (dateStr && new Date(dateStr) < new Date()) overdue++;
          }
        }

        return NextResponse.json({
          totalItems: allItems.length,
          statusBreakdown: statusCounts,
          unassignedItems: unassigned,
          overdueItems: overdue,
          memberCount: board.members.length,
          groupCount: board.groups.length,
          healthScore: Math.max(0, 100 - (unassigned * 5) - (overdue * 10)),
        });
      }

      default:
        return NextResponse.json({ error: "Unknown action. Use: assign, priority, status, categorize, summarize" }, { status: 400 });
    }
  } catch (err) {
    console.error("AI suggest error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
