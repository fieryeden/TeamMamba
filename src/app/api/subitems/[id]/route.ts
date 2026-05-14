import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";
import { updateSubitemSchema } from "@/lib/validations";
import { broadcastToBoard } from "@/lib/socket";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const body = await req.json();
    const data = updateSubitemSchema.parse(body);

    const subitem = await prisma.subitem.findUnique({
      where: { id },
      include: { parent: { select: { boardId: true } } },
    });
    if (!subitem) return NextResponse.json({ error: "Subitem not found" }, { status: 404 });

    const updates: { name?: string } = {};
    if (data.name) updates.name = data.name;
    if (Object.keys(updates).length > 0) {
      await prisma.subitem.update({ where: { id }, data: updates });
    }

    if (data.statusColumnId && typeof data.statusValue === "number") {
      const existing = await prisma.columnValue.findFirst({
        where: { subitemId: id, columnId: data.statusColumnId },
      });
      if (existing) {
        await prisma.columnValue.update({
          where: { id: existing.id },
          data: { value: data.statusValue as any },
        });
      } else {
        await prisma.columnValue.create({
          data: { subitemId: id, columnId: data.statusColumnId, value: data.statusValue as any },
        });
      }
    }

    const refreshed = await prisma.subitem.findUnique({
      where: { id },
      include: { columnValues: { include: { column: true } } },
    });

    broadcastToBoard(subitem.parent.boardId, "subitem:updated", { subitem: refreshed });
    return NextResponse.json({ subitem: refreshed });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "ZodError") {
      return NextResponse.json({ error: "Invalid subitem payload" }, { status: 400 });
    }
    console.error("Update subitem error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;

    const subitem = await prisma.subitem.findUnique({
      where: { id },
      include: { parent: { select: { boardId: true, id: true } } },
    });
    if (!subitem) return NextResponse.json({ error: "Subitem not found" }, { status: 404 });

    await prisma.subitem.delete({ where: { id } });
    broadcastToBoard(subitem.parent.boardId, "subitem:deleted", { subitemId: id, parentId: subitem.parent.id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Delete subitem error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
