import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";

/**
 * GET /api/tags?workspaceId=xxx
 * List all tags used across boards in a workspace (global tag index)
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const workspaceId = url.searchParams.get("workspaceId");
    const search = url.searchParams.get("search");

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
    }

    // Verify user is a workspace member
    const membership = await prisma.workspaceMember.findFirst({
      where: { workspaceId, userId: user.id },
    });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Get all boards in workspace
    const boards = await prisma.board.findMany({
      where: { workspaceId },
      select: { id: true },
    });
    const boardIds = boards.map((b) => b.id);

    // Find all TAGS-type columns across those boards
    const tagColumns = await prisma.boardColumn.findMany({
      where: { boardId: { in: boardIds }, columnType: "TAGS" },
      select: { id: true, title: true, boardId: true, board: { select: { name: true } } },
    });

    const tagColumnIds = tagColumns.map((c) => c.id);

    if (tagColumnIds.length === 0) {
      return NextResponse.json({ tags: [], columns: [] });
    }

    // Get all distinct tag values from column values
    const columnValues = await prisma.columnValue.findMany({
      where: {
        columnId: { in: tagColumnIds },
        NOT: [{ value: { equals: Prisma.DbNull } }],
      },
      select: {
        columnId: true,
        value: true,
        itemId: true,
      },
    });

    // Extract and aggregate tags
    const tagMap = new Map<string, { name: string; count: number; boards: Set<string>; columns: Set<string> }>();

    for (const cv of columnValues) {
      const val = cv.value as any;
      if (!val) continue;

      // Tags can be stored as { tags: ["tag1", "tag2"] } or { label: "tag1" } or just a string
      let tags: string[] = [];
      if (Array.isArray(val?.tags)) {
        tags = val.tags;
      } else if (typeof val?.label === "string") {
        tags = [val.label];
      } else if (typeof val === "string") {
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) tags = parsed;
          else if (typeof parsed === "string") tags = [parsed];
        } catch {
          tags = val.split(",").map((s: string) => s.trim());
        }
      }

      const col = tagColumns.find((c) => c.id === cv.columnId);
      if (!col) continue;

      for (const tag of tags) {
        const key = tag.toLowerCase().trim();
        if (!key) continue;

        // Apply search filter
        if (search && !key.includes(search.toLowerCase())) continue;

        const existing = tagMap.get(key);
        if (existing) {
          existing.count++;
          existing.boards.add(col.board.name);
          existing.columns.add(col.title);
        } else {
          tagMap.set(key, {
            name: tag.trim(),
            count: 1,
            boards: new Set([col.board.name]),
            columns: new Set([col.title]),
          });
        }
      }
    }

    // Sort by usage count
    const tags = Array.from(tagMap.values())
      .map((t) => ({
        name: t.name,
        count: t.count,
        boards: Array.from(t.boards),
        columns: Array.from(t.columns),
      }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({
      tags,
      totalColumns: tagColumns.length,
    });
  } catch (err) {
    console.error("Get tags error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
