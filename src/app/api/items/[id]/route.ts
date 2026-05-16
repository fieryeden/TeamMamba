import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";
import { fireWebhooks } from "@/lib/webhooks";
import { createAuditLog } from "@/lib/audit";
import { broadcastToBoard } from "@/lib/socket";
import { processAutomation } from "@/lib/automation-engine";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();
    const existingItem = await prisma.item.findUnique({
      where: { id },
      select: { id: true, boardId: true, groupId: true, name: true },
    });
    if (!existingItem) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const item = await prisma.item.update({
      where: { id },
      data: body,
      include: {
        columnValues: { include: { column: true } },
        assignees: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
          },
        },
      },
    });

    // Log activity
    if (body.groupId && body.groupId !== existingItem.groupId) {
      await prisma.activity.create({
        data: {
          boardId: item.boardId,
          itemId: item.id,
          userId: user.id,
          action: "ITEM_MOVED",
          details: { toGroup: body.groupId },
        },
      });

      await processAutomation(item.boardId, "ITEM_MOVED_TO_GROUP", {
        id: item.id,
        boardId: item.boardId,
        groupId: item.groupId,
        name: item.name,
        previousGroupId: existingItem.groupId,
        triggeredByUserId: user.id,
      });
    }

    // Fire webhooks + audit log
    fireWebhooks({
      event: "ITEM_UPDATED",
      boardId: item.boardId,
      itemId: item.id,
      userId: user.id,
      payload: { name: item.name, changes: Object.keys(body) },
    });
    createAuditLog({
      action: "ITEM_UPDATED",
      boardId: item.boardId,
      itemId: item.id,
      userId: user.id,
      details: { itemName: item.name, changes: Object.keys(body) },
    });
    broadcastToBoard(item.boardId, "item:updated", { boardId: item.boardId, item });

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
    const item = await prisma.item.findUnique({ where: { id } });
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const boardId = item.boardId;
    const itemName = item.name;

    await prisma.item.delete({ where: { id } });

    await prisma.activity.create({
      data: {
        boardId,
        userId: user.id,
        action: "ITEM_DELETED",
        details: { itemName },
      },
    });

    // Fire webhooks + audit log (after delete, use captured boardId)
    fireWebhooks({
      event: "ITEM_DELETED",
      boardId,
      itemId: id,
      userId: user.id,
      payload: { name: itemName },
    });
    createAuditLog({
      action: "ITEM_DELETED",
      boardId,
      itemId: id,
      userId: user.id,
      details: { itemName },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete item error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
