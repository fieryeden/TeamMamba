import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";
import { fireWebhooks } from "@/lib/webhooks";
import { createAuditLog } from "@/lib/audit";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    const board = await prisma.board.findUnique({
      where: { id },
      include: {
        columns: { orderBy: { order: "asc" } },
        groups: {
          orderBy: { position: "asc" },
          include: {
            items: {
              orderBy: { position: "asc" },
              include: {
                columnValues: { include: { column: true } },
                assignees: {
                  include: {
                    user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
                  },
                },
                comments: { take: 0, include: { user: true } },
                _count: { select: { comments: true, subitems: true } },
              },
            },
          },
        },
        members: {
          include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
        },
        views: { where: { userId: user.id }, orderBy: { isDefault: "desc" } },
        automations: { where: { isEnabled: true } },
      },
    });

    if (!board) return NextResponse.json({ error: "Board not found" }, { status: 404 });

    // Private board access check
    if (board.boardKind === "PRIVATE") {
      const membership = await prisma.boardMember.findFirst({
        where: { boardId: id, userId: user.id },
      });
      if (!membership) {
        return NextResponse.json({ error: "This board is private" }, { status: 403 });
      }
    }

    return NextResponse.json({ board });
  } catch (err) {
    console.error("Get board error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();

    // Verify access (especially for private boards)
    const existing = await prisma.board.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Board not found" }, { status: 404 });

    const membership = await prisma.boardMember.findFirst({
      where: { boardId: id, userId: user.id },
    });
    if (existing.boardKind === "PRIVATE" && !membership) {
      return NextResponse.json({ error: "This board is private" }, { status: 403 });
    }

    // If changing boardKind to PRIVATE, ensure the user is an owner
    if (body.boardKind === "PRIVATE" && membership?.role !== "OWNER") {
      return NextResponse.json(
        { error: "Only board owners can make a board private" },
        { status: 403 }
      );
    }

    const board = await prisma.board.update({
      where: { id },
      data: body,
    });

    // Fire webhooks + audit log
    fireWebhooks({
      event: "BOARD_UPDATED",
      boardId: id,
      userId: user.id,
      payload: { name: board.name, changes: Object.keys(body) },
    });
    createAuditLog({
      action: "BOARD_UPDATED",
      boardId: id,
      userId: user.id,
      details: { boardName: board.name, changes: Object.keys(body) },
    });

    return NextResponse.json({ board });
  } catch (err) {
    console.error("Update board error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    // Only board owners can delete
    const membership = await prisma.boardMember.findFirst({
      where: { boardId: id, userId: user.id, role: "OWNER" },
    });
    if (!membership) {
      return NextResponse.json({ error: "Only board owners can delete" }, { status: 403 });
    }

    const board = await prisma.board.findUnique({ where: { id } });
    const boardName = board?.name ?? "Unknown";

    await prisma.board.delete({ where: { id } });

    // Audit log (board is deleted, so no boardId relation, but we log it anyway)
    createAuditLog({
      action: "BOARD_DELETED",
      boardId: id,
      userId: user.id,
      details: { boardName },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete board error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
