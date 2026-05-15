import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";

/**
 * POST /api/ai/search
 * Smart search across all boards the user can access.
 * Body: { query: string, workspaceId?: string, limit?: number }
 *
 * Fuzzy matching on item names, descriptions, column values, comments, and docs.
 * Returns ranked results with context snippets.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { query, workspaceId, limit = 20 } = body;

    if (!query?.trim()) {
      return NextResponse.json({ error: "query required" }, { status: 400 });
    }

    const q = query.trim().toLowerCase();

    // Get boards the user can access
    const memberships = await prisma.boardMember.findMany({
      where: { userId: user.id },
      include: {
        board: {
          select: {
            id: true,
            name: true,
            workspaceId: true,
            boardKind: true,
          },
        },
      },
    });

    let boardIds = memberships.map((m) => m.board.id);

    // Get workspace IDs the user can access (for docs)
    const workspaceIds = [...new Set(memberships.map((m) => m.board.workspaceId))];

    // Filter by workspace if specified
    if (workspaceId) {
      boardIds = memberships
        .filter((m) => m.board.workspaceId === workspaceId)
        .map((m) => m.board.id);
    }

    if (boardIds.length === 0) {
      return NextResponse.json({ results: [] });
    }

    type SearchResult = {
      type: "item" | "doc" | "comment";
      id: string;
      title: string;
      snippet: string;
      boardId?: string;
      boardName?: string;
      score: number;
      url: string;
    };

    const results: SearchResult[] = [];

    // Search items by name
    const items = await prisma.item.findMany({
      where: {
        boardId: { in: boardIds },
        name: { contains: q, mode: "insensitive" } },
      include: {
        board: { select: { id: true, name: true } },
        columnValues: {
          include: { column: { select: { title: true } } },
        },
        group: { select: { name: true } },
      },
      take: limit * 2,
    });

    for (const item of items) {
      let score = 0;
      let snippet = "";

      // Name match is strongest signal
      if (item.name.toLowerCase().includes(q)) {
        score += item.name.toLowerCase() === q ? 10 : 5;
        snippet = item.name;
      }

      // Column value match (also catches description-like content in text columns)
      for (const cv of item.columnValues) {
        const valStr = JSON.stringify(cv.value).toLowerCase();
        if (valStr.includes(q)) {
          score += 2;
          if (!snippet) {
            const cvStr = JSON.stringify(cv.value);
            snippet = `${cv.column.title}: ${cvStr.substring(0, 80)}`;
          }
        }
      }

      results.push({
        type: "item",
        id: item.id,
        title: item.name,
        snippet: snippet.substring(0, 200),
        boardId: item.boardId,
        boardName: item.board.name,
        score,
        url: `/boards/${item.boardId}`,
      });
    }

    // Search docs (workspace-scoped, not board-scoped)
    const targetWorkspaceIds = workspaceId ? [workspaceId] : workspaceIds;
    if (targetWorkspaceIds.length > 0) {
      const docs = await prisma.doc.findMany({
        where: {
          workspaceId: { in: targetWorkspaceIds },
          OR: [
            { title: { contains: q, mode: "insensitive" } },
          ],
        },
        include: {
          createdBy: { select: { id: true, firstName: true, lastName: true } },
        },
        take: limit,
      });

      for (const doc of docs) {
        let score = 0;
        if (doc.title.toLowerCase().includes(q)) score += 6;

        // Search in content (JSON field — need to stringify)
        const contentStr = JSON.stringify(doc.content).toLowerCase();
        if (contentStr.includes(q)) {
          score += 3;
        }

        // Build snippet from content
        let snippet = doc.title;
        const idx = contentStr.indexOf(q);
        if (idx >= 0) {
          snippet = `...${contentStr.substring(Math.max(0, idx - 40), idx + q.length + 40)}...`;
        }

        results.push({
          type: "doc",
          id: doc.id,
          title: doc.title,
          snippet: snippet.substring(0, 200),
          score,
          url: `/docs`,
        });
      }
    }

    // Search comments
    const comments = await prisma.comment.findMany({
      where: {
        item: { boardId: { in: boardIds } },
        body: { contains: q, mode: "insensitive" },
      },
      include: {
        item: {
          select: {
            id: true,
            name: true,
            boardId: true,
            board: { select: { name: true } },
          },
        },
        user: { select: { firstName: true, lastName: true } },
      },
      take: limit,
    });

    for (const comment of comments) {
      const idx = comment.body.toLowerCase().indexOf(q);
      const snippet = `...${comment.body.substring(Math.max(0, idx - 30), idx + q.length + 30)}...`;
      results.push({
        type: "comment",
        id: comment.id,
        title: `Comment on "${comment.item.name}"`,
        snippet: snippet.substring(0, 200),
        boardId: comment.item.boardId,
        boardName: comment.item.board.name,
        score: 2,
        url: `/boards/${comment.item.boardId}`,
      });
    }

    // Sort by score descending, take top results
    results.sort((a, b) => b.score - a.score);
    const topResults = results.slice(0, limit);

    return NextResponse.json({
      results: topResults,
      total: results.length,
      query,
    });
  } catch (err) {
    console.error("AI search error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
