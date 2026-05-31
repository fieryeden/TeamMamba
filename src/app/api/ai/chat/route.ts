import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";
import { chatWithTools, isLLMConfigured, type LLMTool, type LLMToolCall } from "@/lib/llm";
import { getAIConfig, type AIConfig } from "@/lib/ai-config";
import { executeBoardTool, getBoardTools } from "@/lib/ai-tools";
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
    const dbConfig = await getAIConfig(user.id);
    const envConfigured = isLLMConfigured();
    const hasDbKey = Boolean(dbConfig?.apiKey);
    return NextResponse.json({
      configured: envConfigured || hasDbKey,
      provider: dbConfig?.provider ?? null,
      model: dbConfig?.model ?? null,
      baseUrl: dbConfig?.baseUrl ?? null,
      hasApiKey: hasDbKey,
    });
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
    const { boardId, message, conversationHistory, provider, model, baseUrl, apiKey } = body as {
      boardId?: string;
      message?: string;
      conversationHistory?: ChatMessage[];
      provider?: string;
      model?: string;
      baseUrl?: string;
      apiKey?: string;
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

    const dbConfig = await getAIConfig(user.id);
    const effectiveConfig: AIConfig = {
      provider: (provider || dbConfig?.provider || undefined) as AIConfig["provider"],
      model: model || dbConfig?.model || undefined,
      baseUrl: baseUrl || dbConfig?.baseUrl || undefined,
      apiKey: apiKey || dbConfig?.apiKey || undefined,
    };
    const hasConfig = Boolean(effectiveConfig.apiKey || isLLMConfigured());
    if (!hasConfig) {
      return NextResponse.json({
        response: "AI chat requires an OpenAI or Anthropic API key. Configure one in the AI settings panel or your .env.",
        suggestions: ["Configure OPENAI_API_KEY or ANTHROPIC_API_KEY", "Try AI summarize for heuristic insights"],
        provider: "none",
        fallback: true,
      });
    }

    const context = buildBoardContext(boardShape);
    const historyText = Array.isArray(conversationHistory) ? formatConversation(conversationHistory) : "";

    // Build tool definitions from board schema
    const tools: LLMTool[] = getBoardTools(board);

    const systemPrompt = `You are TeamMamba AI assistant. You can manage this board by using available tools.
Board context:
${context.summary}

Use tools when the user asks you to create, modify, assign, or move items. Answer directly for questions about board status.`;

    const userContent = [
      historyText ? `Conversation history:\n${historyText}` : "",
      `User message: ${message.trim()}`,
    ].filter(Boolean).join("\n\n");

    try {
      const llm = await chatWithTools(
        systemPrompt,
        userContent,
        tools,
        { temperature: 0.3, maxOutputTokens: 800, model: effectiveConfig.model, provider: effectiveConfig.provider, baseUrl: effectiveConfig.baseUrl, apiKey: effectiveConfig.apiKey }
      );

      if (llm.fallback || (!llm.text.trim() && llm.toolCalls.length === 0)) {
        const fallback = heuristicChatResponse(message, boardShape, metrics);
        return NextResponse.json({
          response: fallback.answer,
          suggestions: fallback.actionSuggestions,
          provider: llm.provider,
          fallback: true,
        });
      }

      // Execute any tool calls
      const toolResults: Array<{ tool: string; result: Record<string, unknown> }> = [];
      for (const tc of llm.toolCalls) {
        const result = await executeBoardTool(tc, board, user.id);
        toolResults.push({ tool: tc.name, result });
      }

      // Build response text
      let responseText = llm.text.trim();
      if (toolResults.length > 0 && !responseText) {
        const summaries = toolResults.map((tr) => {
          if (tr.result.success) return `✓ ${tr.tool}: ${tr.result.message || "Done"}`;
          return `✗ ${tr.tool}: ${tr.result.error || "Failed"}`;
        });
        responseText = summaries.join("\n");
      }

      return NextResponse.json({
        response: responseText,
        toolResults,
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
