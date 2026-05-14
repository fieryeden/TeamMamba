import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formSubmissionSchema } from "@/lib/validations";
import { broadcastToBoard } from "@/lib/socket";

function toInputJsonValue(value: unknown): Prisma.InputJsonValue {
  if (value === null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => toInputJsonValue(entry)) as Prisma.InputJsonValue;
  }
  if (typeof value === "object") {
    const output: Record<string, Prisma.InputJsonValue> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      output[key] = toInputJsonValue(entry);
    }
    return output as Prisma.InputJsonValue;
  }
  return String(value);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ boardId: string }> }
) {
  try {
    const { boardId } = await params;
    const body = await req.json();
    const parsed = formSubmissionSchema.parse(body);

    const board = await prisma.board.findUnique({
      where: { id: boardId },
      include: {
        groups: { orderBy: { position: "asc" }, take: 1 },
        columns: { select: { id: true } },
      },
    });

    if (!board) {
      return NextResponse.json({ error: "Board not found" }, { status: 404 });
    }

    const targetGroupId = parsed.groupId ?? board.groups[0]?.id;
    if (!targetGroupId) {
      return NextResponse.json({ error: "Board has no groups" }, { status: 400 });
    }

    const position = await prisma.item.count({ where: { groupId: targetGroupId } });
    const item = await prisma.item.create({
      data: {
        boardId,
        groupId: targetGroupId,
        name: parsed.itemName,
        position,
      },
    });

    const allowedColumnIds = new Set(board.columns.map((column) => column.id));
    const valueRows = Object.entries(parsed.values)
      .filter(([columnId, value]) => allowedColumnIds.has(columnId) && value !== null && value !== "")
      .map(([columnId, value]) => ({
        itemId: item.id,
        columnId,
        value: toInputJsonValue(value),
      }));

    if (valueRows.length > 0) {
      await prisma.columnValue.createMany({ data: valueRows });
    }

    broadcastToBoard(boardId, "item:created", { boardId, item });
    return NextResponse.json({ item }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "ZodError") {
      return NextResponse.json({ error: "Invalid form submission" }, { status: 400 });
    }
    console.error("Public form submission error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
