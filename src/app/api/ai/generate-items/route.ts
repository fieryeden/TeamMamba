import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";

/**
 * POST /api/ai/generate-items
 * Generate multiple items from a natural language description.
 * Body: { boardId, description, groupId? }
 *
 * Parses the description to extract item names and creates them.
 * Supports patterns like "Create items: A, B, C" or numbered lists.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { boardId, description, groupId } = body;

    if (!boardId || !description?.trim()) {
      return NextResponse.json({ error: "boardId and description required" }, { status: 400 });
    }

    const membership = await prisma.boardMember.findFirst({ where: { boardId, userId: user.id } });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const board = await prisma.board.findUnique({
      where: { id: boardId },
      include: { groups: { orderBy: { position: "asc" } }, columns: true },
    });
    if (!board) return NextResponse.json({ error: "Board not found" }, { status: 404 });

    // Parse description into item names
    const text = description.trim();
    const itemNames: string[] = [];

    // Try numbered list: "1. Foo 2. Bar" or "1) Foo"
    const numberedMatch = text.match(/(?:\d+[.)]\s+.+)/g);
    if (numberedMatch && numberedMatch.length >= 2) {
      for (const m of numberedMatch) {
        const cleaned = m.replace(/^\d+[.)]\s+/, "").trim();
        if (cleaned) itemNames.push(cleaned);
      }
    }

    // Try comma-separated: "Create items: A, B, C"
    if (itemNames.length === 0) {
      const colonSplit = text.split(":").slice(1).join(":").trim();
      const candidates = (colonSplit || text).split(/[,\n]/).map((s: string) => s.trim()).filter((s: string) => s.length > 0);
      if (candidates.length >= 2) {
        itemNames.push(...candidates);
      }
    }

    // Try line-separated
    if (itemNames.length === 0) {
      const lines = text.split(/\n/).map((s: string) => s.replace(/^[-•*]\s+/, "").trim()).filter((s: string) => s.length > 0);
      if (lines.length >= 2) {
        itemNames.push(...lines);
      }
    }

    // Fallback: treat entire description as one item
    if (itemNames.length === 0) {
      itemNames.push(text);
    }

    // Determine target group
    const targetGroup = groupId
      ? board.groups.find((g) => g.id === groupId)
      : board.groups[0];

    if (!targetGroup) {
      return NextResponse.json({ error: "No group found" }, { status: 400 });
    }

    // Get max position in target group
    const lastItem = await prisma.item.findFirst({
      where: { groupId: targetGroup.id },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    let position = (lastItem?.position ?? -1) + 1;

    // Create items
    const created = [];
    for (const name of itemNames.slice(0, 50)) {
      const item = await prisma.item.create({
        data: {
          name,
          boardId,
          groupId: targetGroup.id,
          position: position++,
        },
      });

      // Create default column values for each column
      for (const column of board.columns) {
        let defaultValue: unknown = null;
        if (column.columnType === "STATUS") {
          const config = column.config as Record<string, unknown> | null;
          const labels = (config?.labels as string[]) ?? ["Not Started", "Working on it", "Done", "Stuck"];
          defaultValue = { label: labels[0] };
        } else if (column.columnType === "PROGRESS") {
          defaultValue = 0;
        }
        if (defaultValue !== null) {
          await prisma.columnValue.create({
            data: { itemId: item.id, columnId: column.id, value: JSON.parse(JSON.stringify(defaultValue)) },
          });
        }
      }

      created.push({ id: item.id, name: item.name });
    }

    return NextResponse.json({
      created: created.length,
      items: created,
      group: { id: targetGroup.id, name: targetGroup.name },
    });
  } catch (err) {
    console.error("AI generate-items error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
