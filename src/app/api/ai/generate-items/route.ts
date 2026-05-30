import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";
import { chatJSON } from "@/lib/llm";
import { buildBoardContext } from "@/lib/ai-utils";

interface GeneratedItemDraft {
  name: string;
  priority?: string;
  groupId?: string;
}

function heuristicParseItems(description: string): string[] {
  const text = description.trim();
  const itemNames: string[] = [];

  const numberedMatch = text.match(/(?:\d+[.)]\s+.+)/g);
  if (numberedMatch && numberedMatch.length >= 2) {
    for (const m of numberedMatch) {
      const cleaned = m.replace(/^\d+[.)]\s+/, "").trim();
      if (cleaned) itemNames.push(cleaned);
    }
  }

  if (itemNames.length === 0) {
    const colonSplit = text.split(":").slice(1).join(":").trim();
    const candidates = (colonSplit || text)
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (candidates.length >= 2) {
      itemNames.push(...candidates);
    }
  }

  if (itemNames.length === 0) {
    const lines = text
      .split(/\n/)
      .map((s) => s.replace(/^[-•*]\s+/, "").trim())
      .filter((s) => s.length > 0);
    if (lines.length >= 2) {
      itemNames.push(...lines);
    }
  }

  if (itemNames.length === 0) {
    itemNames.push(text);
  }

  return itemNames;
}

function normalizeGeneratedItems(raw: unknown): GeneratedItemDraft[] {
 if (!Array.isArray(raw)) return [];
 const results: GeneratedItemDraft[] = [];
 for (const entry of raw) {
 if (!entry || typeof entry !== "object") continue;
 const item = entry as Record<string, unknown>;
 const name = typeof item.name === "string" ? item.name.trim() : "";
 if (!name) continue;
 results.push({
 name,
 priority: typeof item.priority === "string" ? item.priority.trim() : undefined,
 groupId: typeof item.groupId === "string" ? item.groupId : undefined,
 });
 }
 return results;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { boardId, description, groupId, provider, model } = body as { boardId?: string; description?: string; groupId?: string; provider?: string; model?: string };

    if (!boardId || !description?.trim()) {
      return NextResponse.json({ error: "boardId and description required" }, { status: 400 });
    }

    const membership = await prisma.boardMember.findFirst({ where: { boardId, userId: user.id } });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const board = await prisma.board.findUnique({
      where: { id: boardId },
      include: {
        groups: { orderBy: { position: "asc" }, include: { items: { include: { assignees: true, columnValues: true } } } },
        columns: true,
        members: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } },
      },
    });
    if (!board) return NextResponse.json({ error: "Board not found" }, { status: 404 });

    const fallbackNames = heuristicParseItems(description);
    let parsedItems: GeneratedItemDraft[] = [];

    const boardContext = buildBoardContext(board);
    try {
      const llm = await chatJSON<{ items?: Array<{ name?: string; priority?: string; groupId?: string }> }>(
        "You extract actionable board items from natural language. Return JSON only.",
        [
          `Board context:\n${boardContext.summary}`,
          `User request: ${description.trim()}`,
          "Extract clear items. Keep names concise and specific.",
          "Return JSON: {\"items\":[{\"name\":string,\"priority\"?:string,\"groupId\"?:string}]}",
        ].join("\n\n"),
        { temperature: 0.2, maxOutputTokens: 900, model: model, provider: provider as any }
      );

      if (!llm.fallback) {
        parsedItems = normalizeGeneratedItems(llm.data?.items ?? []);
      }
    } catch (llmError) {
      console.error("AI generate-items LLM fallback:", llmError);
    }

    if (parsedItems.length === 0) {
      parsedItems = fallbackNames.map((name) => ({ name }));
    }

    const fallbackGroup = groupId ? board.groups.find((g) => g.id === groupId) : board.groups[0];
    if (!fallbackGroup) {
      return NextResponse.json({ error: "No group found" }, { status: 400 });
    }

    const created: Array<{ id: string; name: string }> = [];

    for (const draft of parsedItems.slice(0, 50)) {
      const targetGroup =
        (draft.groupId ? board.groups.find((group) => group.id === draft.groupId) : null) ??
        fallbackGroup;

      const lastItem = await prisma.item.findFirst({
        where: { groupId: targetGroup.id },
        orderBy: { position: "desc" },
        select: { position: true },
      });
      const position = (lastItem?.position ?? -1) + 1;

      const item = await prisma.item.create({
        data: {
          name: draft.name,
          boardId,
          groupId: targetGroup.id,
          position,
        },
      });

      for (const column of board.columns) {
        let defaultValue: unknown = null;

        if (column.columnType === "STATUS") {
          const config = column.config as Record<string, unknown> | null;
          const labels = (config?.labels as string[]) ?? ["Not Started", "Working on it", "Done", "Stuck"];

          if (draft.priority && column.title.toLowerCase().includes("priority")) {
            defaultValue = { label: draft.priority };
          } else {
            defaultValue = { label: labels[0] };
          }
        } else if (column.columnType === "PROGRESS") {
          defaultValue = 0;
        }

        if (defaultValue !== null) {
          await prisma.columnValue.create({
            data: {
              itemId: item.id,
              columnId: column.id,
              value: JSON.parse(JSON.stringify(defaultValue)),
            },
          });
        }
      }

      created.push({ id: item.id, name: item.name });
    }

    return NextResponse.json({
      created: created.length,
      items: created,
      group: { id: fallbackGroup.id, name: fallbackGroup.name },
    });
  } catch (err) {
    console.error("AI generate-items error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
