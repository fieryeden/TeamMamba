import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();

    const item = await prisma.item.update({
      where: { id },
      data: body,
      include: {
        columnValues: { include: { column: true } },
        assignees: { include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } } },
      },
    });

    // Log activity
    if (body.groupId) {
      await prisma.activity.create({
        data: {
          boardId: item.boardId,
          itemId: item.id,
          userId: user.id,
          action: "ITEM_MOVED",
          details: { toGroup: body.groupId },
        },
      });
    }

    return NextResponse.json({ item });
  } catch (err) {
    console.error("Update item error:", err);
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
    const item = await prisma.item.delete({ where: { id } });

    await prisma.activity.create({
      data: {
        boardId: item.boardId,
        userId: user.id,
        action: "ITEM_DELETED",
        details: { itemName: item.name },
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete item error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
