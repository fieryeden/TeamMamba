import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";

// GET /api/governance/export?boardId=xxx — Compliance export (GDPR)
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const boardId = searchParams.get("boardId");
    const workspaceId = searchParams.get("workspaceId");

    if (!boardId && !workspaceId) {
      return NextResponse.json({ error: "boardId or workspaceId required" }, { status: 400 });
    }

    const membership = await prisma.workspaceMember.findFirst({
      where: { userId: user.id, ...(workspaceId ? { workspaceId } : {}) },
    });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const exportData: Record<string, unknown> = {};

    if (boardId) {
      const board = await prisma.board.findUnique({
        where: { id: boardId },
        include: {
          columns: true,
          groups: {
            include: {
              items: {
                include: {
                  columnValues: true,
                  assignees: { include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } } },
                  comments: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
                },
              },
            },
          },
          activities: { orderBy: { createdAt: "desc" }, take: 1000 },
        },
      });
      exportData.board = board;
    }

    if (workspaceId) {
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        include: {
          boards: {
            include: {
              groups: {
                include: {
                  items: {
                    include: {
                      columnValues: true,
                      assignees: { include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } } },
                    },
                  },
                },
              },
            },
          },
          docs: true,
        },
      });
      exportData.workspace = workspace;
    }

    const filename = `compliance-export-${new Date().toISOString().slice(0, 10)}.json`;
    return new NextResponse(JSON.stringify(exportData, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("Export error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/governance/export — Trigger auto-archive
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { boardId } = body;

    if (!boardId) return NextResponse.json({ error: "boardId required" }, { status: 400 });

    const board = await prisma.board.findUnique({ where: { id: boardId } });
    if (!board) return NextResponse.json({ error: "Board not found" }, { status: 404 });

    const membership = await prisma.workspaceMember.findFirst({
      where: { workspaceId: board.workspaceId, userId: user.id },
    });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const archiveDays = board.autoArchiveDays;
    if (!archiveDays || archiveDays <= 0) {
      return NextResponse.json({ error: "Auto-archive not configured for this board" }, { status: 400 });
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - archiveDays);

    const result = await prisma.item.updateMany({
      where: { boardId, updatedAt: { lt: cutoffDate }, archivedAt: null },
      data: { archivedAt: new Date() },
    });

    return NextResponse.json({ archived: result.count });
  } catch (err) {
    console.error("Auto-archive error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
