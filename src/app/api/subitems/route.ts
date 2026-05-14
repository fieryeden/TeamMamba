import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";
import { createSubitemSchema } from "@/lib/validations";
import { broadcastToBoard } from "@/lib/socket";

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const data = createSubitemSchema.parse(body);

    const parent = await prisma.item.findUnique({
      where: { id: data.parentId },
      select: { id: true, boardId: true },
    });
    if (!parent) return NextResponse.json({ error: "Parent item not found" }, { status: 404 });

    const maxPos = await prisma.subitem.findFirst({
      where: { parentId: data.parentId },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const subitem = await prisma.subitem.create({
      data: {
        parentId: data.parentId,
        name: data.name,
        position: (maxPos?.position ?? -1) + 1,
      },
      include: { columnValues: { include: { column: true } } },
    });

    if (data.statusColumnId) {
      await prisma.columnValue.create({
        data: {
          subitemId: subitem.id,
          columnId: data.statusColumnId,
          value: data.statusValue ?? 0,
        },
      });
    }

    const created = await prisma.subitem.findUnique({
      where: { id: subitem.id },
      include: { columnValues: { include: { column: true } } },
    });

    broadcastToBoard(parent.boardId, "subitem:created", { parentId: data.parentId, subitem: created });
    return NextResponse.json({ subitem: created }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "ZodError") {
      return NextResponse.json({ error: "Invalid subitem payload" }, { status: 400 });
    }
    console.error("Create subitem error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
