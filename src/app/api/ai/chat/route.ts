import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";
import { chat, isLLMConfigured } from "@/lib/llm";
import {
  buildBoardContext,
  computeBoardMetrics,
  heuristicChatResponse,
  type BoardShape,
} from "@/lib/ai-utils";

type ChatMessage = { role: "user" | "assistant"; content: string };

function formatConversation(history: ChatMessage[]): string {
  return history
    .filter((entry) => (entry.role === "user" || entry.role === "assistant") && entry.content.trim().length > 0)
    .slice(-12)
    .map((entry) => `${entry.role.toUpperCase()}: ${entry.content.trim()}`)
    .join("\n");
}

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ configured: isLLMConfigured() });
  } catch (err) {
    console.error("AI chat status error:", err);
    return NextResponse.json({ configured: false });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { boardId, message, conversationHistory } = body as {
      boardId?: string;
      message?: string;
      conversationHistory?: ChatMessage[];
    };

    if (!boardId || !message?.trim()) {
      return NextResponse.json({ error: "boardId and message required" }, { status: 400 });
    }

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

    if (!isLLMConfigured()) {
      return NextResponse.json({
        response: "AI chat requires an OpenAI or Anthropic API key. Configure one in your environment to enable conversational responses.",
        suggestions: ["Configure OPENAI_API_KEY or ANTHROPIC_API_KEY", "Try AI summarize for heuristic insights"],
        provider: "none",
        fallback: true,
      });
    }

    const context = buildBoardContext(boardShape);
    const historyText = Array.isArray(conversationHistory) ? formatConversation(conversationHistory) : "";

    try {
      const llm = await chat(
        "You are TeamMamba AI assistant. Answer based on board context, keep replies practical and concise.",
        [
          `Board context:\n${context.summary}`,
          historyText ? `Conversation history:\n${historyText}` : "",
          `User message: ${message.trim()}`,
          "If useful, include up to 3 actionable follow-up suggestions as plain lines prefixed with 'Suggestion:'.",
        ]
          .filter(Boolean)
          .join("\n\n"),
        { temperature: 0.3, maxOutputTokens: 550 }
      );

      if (llm.fallback || !llm.text.trim()) {
        const fallback = heuristicChatResponse(message, boardShape, metrics);
        return NextResponse.json({
          response: fallback.answer,
          suggestions: fallback.actionSuggestions,
          provider: llm.provider,
          fallback: true,
        });
      }

      const lines = llm.text
        .trim()
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      const suggestions = lines
        .filter((line) => line.toLowerCase().startsWith("suggestion:"))
        .map((line) => line.replace(/^suggestion:\s*/i, "").trim())
        .filter((line) => line.length > 0)
        .slice(0, 3);

      const response = lines
        .filter((line) => !line.toLowerCase().startsWith("suggestion:"))
        .join(" ")
        .trim();

      return NextResponse.json({
        response: response || llm.text.trim(),
        suggestions: suggestions.length > 0 ? suggestions : undefined,
        provider: llm.provider,
        fallback: false,
      });
    } catch (llmError) {
      console.error("AI chat LLM fallback:", llmError);
      const fallback = heuristicChatResponse(message, boardShape, metrics);
      return NextResponse.json({
        response: fallback.answer,
        suggestions: fallback.actionSuggestions,
        provider: "none",
        fallback: true,
      });
    }
  } catch (err) {
    console.error("AI chat error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
