import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";
import {
  recomputeDerivedColumnsForItem,
  syncConnectColumnValue,
} from "@/lib/connect-columns";

const payloadSchema = z.object({
  columnId: z.string().uuid(),
  sourceItemId: z.string().uuid(),
  targetItemId: z.string().uuid(),
  targetBoardId: z.string().uuid(),
  action: z.enum(["link", "unlink"]).default("link"),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const data = payloadSchema.parse(body);
    if (data.sourceItemId === data.targetItemId) {
      return NextResponse.json({ error: "Cannot connect item to itself" }, { status: 400 });
    }

    const [sourceItem, targetItem, column] = await Promise.all([
      prisma.item.findUnique({
        where: { id: data.sourceItemId },
        select: { id: true, boardId: true },
      }),
      prisma.item.findUnique({
        where: { id: data.targetItemId },
        select: { id: true, boardId: true, name: true, board: { select: { name: true } } },
      }),
      prisma.boardColumn.findUnique({
        where: { id: data.columnId },
        select: { id: true, boardId: true, columnType: true },
      }),
    ]);

    if (!sourceItem || !targetItem || !column) {
      return NextResponse.json({ error: "Invalid source/target/column" }, { status: 400 });
    }
    if (targetItem.boardId !== data.targetBoardId) {
      return NextResponse.json({ error: "targetBoardId does not match target item" }, { status: 400 });
    }
    if (column.boardId !== sourceItem.boardId || column.columnType !== "CONNECT") {
      return NextResponse.json({ error: "Column must be a CONNECT column on source board" }, { status: 400 });
    }

    const memberships = await prisma.boardMember.findMany({
      where: {
        userId: user.id,
        boardId: { in: [sourceItem.boardId, data.targetBoardId] },
      },
      select: { boardId: true },
    });
    const memberBoardIds = new Set(memberships.map((entry) => entry.boardId));
    if (!memberBoardIds.has(sourceItem.boardId) || !memberBoardIds.has(data.targetBoardId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (data.action === "link") {
      await prisma.connectColumn.upsert({
        where: {
          columnId_sourceItemId_targetItemId: {
            columnId: data.columnId,
            sourceItemId: data.sourceItemId,
            targetItemId: data.targetItemId,
          },
        },
        update: {},
        create: {
          columnId: data.columnId,
          sourceItemId: data.sourceItemId,
          targetItemId: data.targetItemId,
          targetBoardId: data.targetBoardId,
        },
      });
    } else {
      await prisma.connectColumn.deleteMany({
        where: {
          columnId: data.columnId,
          sourceItemId: data.sourceItemId,
          targetItemId: data.targetItemId,
        },
      });
    }

    await syncConnectColumnValue(data.sourceItemId, data.columnId);
    await recomputeDerivedColumnsForItem(data.sourceItemId);

    const [columnValue, derivedValues] = await Promise.all([
      prisma.columnValue.findFirst({
        where: { itemId: data.sourceItemId, columnId: data.columnId },
        include: {
          column: { select: { id: true, title: true, columnType: true, config: true } },
        },
      }),
      prisma.columnValue.findMany({
        where: {
          itemId: data.sourceItemId,
          column: {
            boardId: sourceItem.boardId,
            columnType: { in: ["MIRROR", "ROLLUP"] },
          },
        },
        include: {
          column: { select: { id: true, title: true, columnType: true, config: true } },
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      linkedItem: {
        id: targetItem.id,
        name: targetItem.name,
        boardId: targetItem.boardId,
        boardName: targetItem.board.name,
      },
      columnValue,
      derivedValues,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "ZodError") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    console.error("Connect column link error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

