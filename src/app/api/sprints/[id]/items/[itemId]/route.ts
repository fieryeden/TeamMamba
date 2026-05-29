import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: sprintId, itemId } = await params;

    const sprint = await prisma.sprint.findUnique({ where: { id: sprintId } });
    if (!sprint) return NextResponse.json({ error: "Sprint not found" }, { status: 404 });

    const membership = await prisma.boardMember.findFirst({
      where: { boardId: sprint.boardId, userId: user.id },
    });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await prisma.sprintItem.delete({
      where: { sprintId_itemId: { sprintId, itemId } },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Remove sprint item error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: sprintId, itemId } = await params;
    const body = await req.json();
    const { storyPoints, burnedPoints, completedAt, originalEstimate, addedDuringSprint } = body;

    const sprint = await prisma.sprint.findUnique({ where: { id: sprintId } });
    if (!sprint) return NextResponse.json({ error: "Sprint not found" }, { status: 404 });

    const membership = await prisma.boardMember.findFirst({
      where: { boardId: sprint.boardId, userId: user.id },
    });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const updated = await prisma.sprintItem.update({
      where: { sprintId_itemId: { sprintId, itemId } },
      data: {
        ...(storyPoints !== undefined && { storyPoints }),
        ...(burnedPoints !== undefined && { burnedPoints }),
        ...(completedAt !== undefined && { completedAt: completedAt ? new Date(completedAt) : null }),
        ...(originalEstimate !== undefined && { originalEstimate }),
        ...(addedDuringSprint !== undefined && { addedDuringSprint }),
      },
      include: {
        item: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ sprintItem: updated });
  } catch (err) {
    console.error("Update sprint item error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
