import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const workspaceId = url.searchParams.get("workspaceId");
    const boardId = url.searchParams.get("boardId");
    const action = url.searchParams.get("action");
    const userId = url.searchParams.get("userId");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);
    const cursor = url.searchParams.get("cursor");

    // Build where clause
    const where: Record<string, unknown> = {};
    if (boardId) where.boardId = boardId;
    if (action) where.action = action;
    if (userId) where.userId = userId;

    // If workspaceId given, filter to boards in that workspace
    if (workspaceId && !boardId) {
      const boards = await prisma.board.findMany({
        where: { workspaceId },
        select: { id: true },
      });
      where.boardId = { in: boards.map((b) => b.id) };
    }

    // If no workspace/board filter, limit to boards user can see
    if (!workspaceId && !boardId) {
      const memberships = await prisma.boardMember.findMany({
        where: { userId: user.id },
        select: { boardId: true },
      });
      where.boardId = { in: memberships.map((m) => m.boardId) };
    }

    if (cursor) where.id = { lt: cursor };

    const logs = await prisma.auditLog.findMany({
      where,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, email: true } },
        board: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const nextCursor = logs.length === limit ? logs[logs.length - 1].id : null;

    return NextResponse.json({ logs, nextCursor });
  } catch (err) {
    console.error("Get audit logs error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
