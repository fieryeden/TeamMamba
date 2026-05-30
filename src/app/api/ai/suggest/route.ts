import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";
import { chatJSON } from "@/lib/llm";
import { buildBoardContext, type AISuggestAction } from "@/lib/ai-utils";

type AssignResponse = {
  suggestions: Array<{ userId: string; name: string; itemCount: number; reason: string }>;
};

type PriorityResponse = {
  suggestion: string;
  confidence: number;
};

type StatusResponse = {
  suggestion: string;
  confidence: number;
  currentStatus: string | null;
};

type CategorizeResponse = {
  suggestion: string | null;
  groupId: string | null;
  confidence: number;
  alternatives: Array<{ groupId: string; groupName: string; score: number; itemCount: number }>;
};

type SummarizeResponse = {
  totalItems: number;
  statusBreakdown: Record<string, number>;
  unassignedItems: number;
  overdueItems: number;
  memberCount: number;
  groupCount: number;
  healthScore: number;
};

function clampConfidence(value: unknown, fallback = 0.5): number {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

function heuristicSuggestFallback(
  board: {
    groups: Array<{
      id: string;
      name: string;
      items: Array<{
        id: string;
        name: string;
        createdAt: Date;
        columnValues: Array<{ columnId: string; value: unknown }>;
        assignees: Array<{ userId: string }>;
      }>;
    }>;
    members: Array<{ user: { id: string; firstName: string; lastName: string } }>;
    columns: Array<{ id: string; title: string; columnType: string }>;
  },
  action: AISuggestAction,
  itemId?: string
): AssignResponse | PriorityResponse | StatusResponse | CategorizeResponse | SummarizeResponse {
  const allItems = board.groups.flatMap((g) => g.items);
  const statusCol = board.columns.find((c) => c.columnType === "STATUS" && c.title.toLowerCase().includes("status"));

  switch (action) {
    case "assign": {
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
      return { suggestions: sorted };
    }

    case "priority": {
      const item = allItems.find((i) => i.id === itemId);
      if (!item) return { suggestion: "Medium", confidence: 0.5 };

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

      return { suggestion: suggestedPriority, confidence };
    }

    case "status": {
      const item = allItems.find((i) => i.id === itemId);
      if (!item) return { suggestion: "Working on it", confidence: 0.5, currentStatus: null };

      const statusVal = item.columnValues.find((cv) => cv.columnId === statusCol?.id);
      const currentStatus = ((statusVal?.value as Record<string, unknown> | null)?.label as string | undefined) ?? null;

      let suggestion = "Working on it";
      let confidence = 0.5;

      if (!currentStatus || currentStatus === "Not Started") {
        suggestion = "Working on it";
        confidence = 0.7;
      } else if (currentStatus === "Working on it") {
        const age = Date.now() - new Date(item.createdAt).getTime();
        const hasAssignees = item.assignees.length > 0;
        if (hasAssignees && age > 86400000 * 3) {
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

      return { suggestion, confidence, currentStatus };
    }

    case "categorize": {
      const item = allItems.find((i) => i.id === itemId);
      if (!item) return { suggestion: null, groupId: null, confidence: 0, alternatives: [] };

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

      return {
        suggestion: best && best.score > 0 ? best.groupName : null,
        groupId: best && best.score > 0 ? best.groupId : null,
        confidence: best ? Math.min(best.score * 2, 1) : 0,
        alternatives: groupScores.slice(1, 3).filter((g) => g.score > 0),
      };
    }

    case "summarize": {
      const statusCounts: Record<string, number> = {};
      let unassigned = 0;
      let overdue = 0;
      const dateCol = board.columns.find((c) => c.columnType === "DATE");

      for (const item of allItems) {
        const sv = item.columnValues.find((cv) => cv.columnId === statusCol?.id);
        const status = ((sv?.value as Record<string, unknown> | null)?.label as string | undefined) ?? "No Status";
        statusCounts[status] = (statusCounts[status] ?? 0) + 1;

        if (item.assignees.length === 0) unassigned++;

        if (dateCol) {
          const dv = item.columnValues.find((cv) => cv.columnId === dateCol.id);
          const dateStr = ((dv?.value as Record<string, unknown> | null)?.date as string | undefined) ?? null;
          if (dateStr && new Date(dateStr) < new Date()) overdue++;
        }
      }

      return {
        totalItems: allItems.length,
        statusBreakdown: statusCounts,
        unassignedItems: unassigned,
        overdueItems: overdue,
        memberCount: board.members.length,
        groupCount: board.groups.length,
        healthScore: Math.max(0, 100 - unassigned * 5 - overdue * 10),
      };
    }

    default:
      return { totalItems: 0, statusBreakdown: {}, unassignedItems: 0, overdueItems: 0, memberCount: 0, groupCount: 0, healthScore: 100 };
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { boardId, itemId, action, provider, model } = body as { boardId?: string; itemId?: string; action?: AISuggestAction; provider?: string; model?: string };

    if (!boardId) return NextResponse.json({ error: "boardId required" }, { status: 400 });

    const membership = await prisma.boardMember.findFirst({
      where: { boardId, userId: user.id },
      select: { role: true },
    });
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
                assignees: { include: { user: true } },
              },
            },
          },
        },
        members: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, email: true } },
          },
        },
      },
    });

    if (!board) return NextResponse.json({ error: "Board not found" }, { status: 404 });

    if (!action || !["assign", "priority", "status", "categorize", "summarize"].includes(action)) {
      return NextResponse.json({ error: "Unknown action. Use: assign, priority, status, categorize, summarize" }, { status: 400 });
    }

    if ((action === "priority" || action === "status" || action === "categorize") && !itemId) {
      const message =
        action === "priority"
          ? "itemId required for priority suggestion"
          : action === "status"
            ? "itemId required for status suggestion"
            : "itemId required for categorization";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const allItems = board.groups.flatMap((g) => g.items);
    if ((action === "priority" || action === "status" || action === "categorize") && !allItems.some((item) => item.id === itemId)) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const fallbackResult: any = heuristicSuggestFallback(board, action, itemId);
    const boardContext = buildBoardContext(board);

    try {
      if (action === "assign") {
        const llm = await chatJSON<{ suggestions?: Array<{ userId?: string; name?: string; itemCount?: number; reason?: string }> }>(
          "You suggest assignees for project items. Always return JSON only.",
          [
            `Board context:\n${boardContext.summary}`,
            "Task: suggest exactly 3 assignees based on balanced workload and board context.",
            "Return JSON: {\"suggestions\":[{\"userId\":string,\"name\":string,\"itemCount\":number,\"reason\":string}]}",
          ].join("\n\n"),
          { temperature: 0.2, maxOutputTokens: 500, model: model, provider: provider as any }
        );

        const suggestions = llm.data?.suggestions
          ?.filter((entry) => typeof entry.userId === "string")
          .slice(0, 3)
          .map((entry) => ({
            userId: entry.userId as string,
            name:
              typeof entry.name === "string" && entry.name.trim().length > 0
                ? entry.name
                : fallbackResult.suggestions.find((fallback: any) => fallback.userId === entry.userId)?.name ?? entry.userId,
            itemCount: typeof entry.itemCount === "number" ? Math.max(0, Math.round(entry.itemCount)) : 0,
            reason: typeof entry.reason === "string" && entry.reason.trim().length > 0 ? entry.reason : "Suggested from board context",
          }));

        if (llm.fallback || !suggestions || suggestions.length === 0) {
          return NextResponse.json(fallbackResult);
        }

        return NextResponse.json({ suggestions });
      }

      if (action === "priority") {
        const item = allItems.find((entry) => entry.id === itemId)!;
        const llm = await chatJSON<{ suggestion?: string; confidence?: number }>(
          "You classify priority labels from project items. Return strict JSON only.",
          [
            `Board context:\n${boardContext.summary}`,
            `Item: ${item.name}`,
            "Pick one concise priority label and confidence.",
            "Return JSON: {\"suggestion\":string,\"confidence\":number}",
          ].join("\n\n"),
          { temperature: 0.1, maxOutputTokens: 200, model: model, provider: provider as any }
        );

        if (llm.fallback || !llm.data?.suggestion) {
          return NextResponse.json(fallbackResult);
        }

        return NextResponse.json({
          suggestion: llm.data.suggestion,
          confidence: clampConfidence(llm.data.confidence, fallbackResult.confidence),
        });
      }

      if (action === "status") {
        const item = allItems.find((entry) => entry.id === itemId)!;
        const llm = await chatJSON<{ suggestion?: string; confidence?: number; currentStatus?: string | null }>(
          "You predict likely next workflow status values. Return JSON only.",
          [
            `Board context:\n${boardContext.summary}`,
            `Item: ${item.name}`,
            `Current status: ${fallbackResult.currentStatus ?? "No Status"}`,
            "Return JSON: {\"suggestion\":string,\"confidence\":number,\"currentStatus\":string|null}",
          ].join("\n\n"),
          { temperature: 0.2, maxOutputTokens: 220, model: model, provider: provider as any }
        );

        if (llm.fallback || !llm.data?.suggestion) {
          return NextResponse.json(fallbackResult);
        }

        return NextResponse.json({
          suggestion: llm.data.suggestion,
          confidence: clampConfidence(llm.data.confidence, fallbackResult.confidence),
          currentStatus: llm.data.currentStatus ?? fallbackResult.currentStatus,
        });
      }

      if (action === "categorize") {
        const item = allItems.find((entry) => entry.id === itemId)!;
        const llm = await chatJSON<{
          suggestion?: string | null;
          groupId?: string | null;
          confidence?: number;
          alternatives?: Array<{ groupId?: string; groupName?: string; score?: number; itemCount?: number }>;
        }>(
          "You suggest the most likely group for an item. Return JSON only.",
          [
            `Board context:\n${boardContext.summary}`,
            `Item: ${item.name}`,
            "Return JSON: {\"suggestion\":string|null,\"groupId\":string|null,\"confidence\":number,\"alternatives\":[{\"groupId\":string,\"groupName\":string,\"score\":number,\"itemCount\":number}]}",
          ].join("\n\n"),
          { temperature: 0.2, maxOutputTokens: 420, model: model, provider: provider as any }
        );

        if (llm.fallback || !llm.data) {
          return NextResponse.json(fallbackResult);
        }

        const alternatives = (llm.data.alternatives ?? [])
          .filter((entry) => typeof entry.groupId === "string" && typeof entry.groupName === "string")
          .slice(0, 2)
          .map((entry) => ({
            groupId: entry.groupId as string,
            groupName: entry.groupName as string,
            score: typeof entry.score === "number" ? entry.score : 0,
            itemCount: typeof entry.itemCount === "number" ? entry.itemCount : 0,
          }));

        return NextResponse.json({
          suggestion: llm.data.suggestion ?? fallbackResult.suggestion,
          groupId: llm.data.groupId ?? fallbackResult.groupId,
          confidence: clampConfidence(llm.data.confidence, fallbackResult.confidence),
          alternatives,
        });
      }

      const llm = await chatJSON<{
        totalItems?: number;
        statusBreakdown?: Record<string, number>;
        unassignedItems?: number;
        overdueItems?: number;
        healthScore?: number;
      }>(
        "You summarize project board metrics. Return strict JSON only.",
        [
          `Board context:\n${boardContext.summary}`,
          "Return JSON: {\"totalItems\":number,\"statusBreakdown\":Record<string,number>,\"unassignedItems\":number,\"overdueItems\":number,\"healthScore\":number}",
        ].join("\n\n"),
        { temperature: 0.2, maxOutputTokens: 350, model: model, provider: provider as any }
      );

      if (llm.fallback || !llm.data) {
        return NextResponse.json(fallbackResult);
      }

      return NextResponse.json({
        totalItems: typeof llm.data.totalItems === "number" ? llm.data.totalItems : fallbackResult.totalItems,
        statusBreakdown:
          llm.data.statusBreakdown && typeof llm.data.statusBreakdown === "object"
            ? llm.data.statusBreakdown
            : fallbackResult.statusBreakdown,
        unassignedItems: typeof llm.data.unassignedItems === "number" ? llm.data.unassignedItems : fallbackResult.unassignedItems,
        overdueItems: typeof llm.data.overdueItems === "number" ? llm.data.overdueItems : fallbackResult.overdueItems,
        memberCount: board.members.length,
        groupCount: board.groups.length,
        healthScore: typeof llm.data.healthScore === "number" ? Math.round(llm.data.healthScore) : fallbackResult.healthScore,
      });
    } catch (llmError) {
      console.error("AI suggest LLM fallback:", llmError);
      return NextResponse.json(fallbackResult);
    }
  } catch (err) {
    console.error("AI suggest error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
