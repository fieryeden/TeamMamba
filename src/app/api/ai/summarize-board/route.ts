import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";
import { chat } from "@/lib/llm";
import {
  buildBoardContext,
  computeBoardMetrics,
  heuristicSummaryText,
  type BoardShape,
} from "@/lib/ai-utils";

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { boardId } = body as { boardId?: string };
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
        members: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } },
      },
    });
    if (!board) return NextResponse.json({ error: "Board not found" }, { status: 404 });

    const boardShape = board as unknown as BoardShape;
    const metrics = computeBoardMetrics(boardShape);
    const context = buildBoardContext(boardShape);

    let summary = heuristicSummaryText(board.name, metrics);
    let provider: "openai" | "anthropic" | "none" = "none";
    let fallback = true;

    try {
      const llm = await chat(
        "You are a concise project-management analyst. Write a clear board health summary in plain language.",
        [
          `Board context:\n${context.summary}`,
          `Metrics JSON:\n${JSON.stringify(metrics)}`,
          "Write 3-5 sentences with progress, blockers, and next focus. No markdown bullets.",
        ].join("\n\n"),
        { temperature: 0.2, maxOutputTokens: 350 }
      );

      provider = llm.provider;
      fallback = llm.fallback;
      if (!llm.fallback && llm.text.trim().length > 0) {
        summary = llm.text.trim();
      }
    } catch (llmError) {
      console.error("AI summarize-board LLM fallback:", llmError);
    }

    return NextResponse.json({
      summary,
      metrics,
      provider,
      fallback,
      totalItems: metrics.totalItems,
      completionRate: metrics.completionRate,
      statusBreakdown: metrics.statusBreakdown,
      unassignedItems: metrics.unassignedItems,
      overdueItems: metrics.overdueItems,
      overdueItemNames: metrics.overdueItemNames.slice(0, 10),
      groupSummaries: metrics.groupSummaries,
      workload: metrics.workload,
      healthScore: metrics.healthScore,
    });
  } catch (err) {
    console.error("AI summarize-board error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
