import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";
import { createItemSchema, updateItemSchema } from "@/lib/validations";
import { fireWebhooks } from "@/lib/webhooks";
import { createAuditLog } from "@/lib/audit";
import { broadcastToBoard } from "@/lib/socket";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const boardId = searchParams.get("boardId");
    const groupId = searchParams.get("groupId");

    if (!boardId) return NextResponse.json({ error: "boardId required" }, { status: 400 });

    const where: Record<string, unknown> = { boardId };
    if (groupId) where.groupId = groupId;

    const items = await prisma.item.findMany({
      where,
      include: {
        columnValues: { include: { column: true } },
        assignees: { include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } } },
        _count: { select: { comments: true, subitems: true } },
      },
      orderBy: { position: "asc" },
    });

    return NextResponse.json({ items });
  } catch (err) {
    console.error("Get items error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const data = createItemSchema.parse(body);

    // Get next position
    const maxPos = await prisma.item.findFirst({
      where: { groupId: data.groupId },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const item = await prisma.item.create({
      data: {
        boardId: data.boardId,
        groupId: data.groupId,
        name: data.name,
        position: (maxPos?.position ?? -1) + 1,
      },
      include: {
        columnValues: { include: { column: true } },
        assignees: { include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } } },
      },
    });

    // Create default column values
    if (data.columnValues) {
      const columns = await prisma.boardColumn.findMany({ where: { boardId: data.boardId } });
      const values = columns.map((col) => ({
        itemId: item.id,
        columnId: col.id,
          value: JSON.parse(JSON.stringify((data.columnValues as Record<string, unknown>)?.[col.id] ?? null)) as any,
      }));
      await prisma.columnValue.createMany({ data: values });
    }

    // Log activity
    await prisma.activity.create({
      data: {
        boardId: data.boardId,
        itemId: item.id,
        userId: user.id,
        action: "ITEM_CREATED",
        details: { itemName: data.name },
      },
    });

    // Fire webhooks (non-blocking)
    fireWebhooks({ event: "ITEM_CREATED", boardId: data.boardId, itemId: item.id, userId: user.id, payload: { name: data.name } });

    // Audit log (non-blocking)
    createAuditLog({ action: "ITEM_CREATED", boardId: data.boardId, itemId: item.id, userId: user.id, details: { itemName: data.name } });
    broadcastToBoard(data.boardId, "item:created", { boardId: data.boardId, item });

    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    console.error("Create item error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
