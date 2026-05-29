import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";
import { broadcastToBoard } from "@/lib/socket";
import { processAutomation } from "@/lib/automation-engine";

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { itemId, columnId, value } = body;

    if (!itemId || !columnId) {
      return NextResponse.json({ error: "itemId and columnId required" }, { status: 400 });
    }

    const columnValue = await prisma.columnValue.create({
      data: {
        itemId,
        columnId,
        value: value !== undefined ? JSON.parse(JSON.stringify(value)) : null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      include: { column: true },
    });

    // Broadcast update
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: { boardId: true },
    });
    if (item) {
      broadcastToBoard(item.boardId, "column:updated", {
        boardId: item.boardId,
        columnValue,
      });
      await processAutomation(item.boardId, "COLUMN_VALUE_CHANGED", {
        id: itemId,
        boardId: item.boardId,
        columnId,
        value,
        triggeredByUserId: user.id,
      });
    }

    return NextResponse.json({ columnValue }, { status: 201 });
  } catch (err) {
    console.error("Create column value error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
