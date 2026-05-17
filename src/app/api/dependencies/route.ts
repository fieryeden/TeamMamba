import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";
import { createDependencySchema } from "@/lib/validations";
import { broadcastToBoard } from "@/lib/socket";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const searchParams = new URL(req.url).searchParams;
    const itemId = searchParams.get("itemId");
    const boardId = searchParams.get("boardId");
    if (!itemId && !boardId) {
      return NextResponse.json({ error: "itemId or boardId required" }, { status: 400 });
    }

    if (boardId) {
      const membership = await prisma.boardMember.findFirst({
        where: { boardId, userId: user.id },
        select: { id: true },
      });
      if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const dependencies = await prisma.dependency.findMany({
      where: boardId
        ? {
            fromItem: { boardId },
            toItem: { boardId },
          }
        : {
            OR: [{ fromItemId: itemId! }, { toItemId: itemId! }],
          },
      include: {
        fromItem: { select: { id: true, name: true } },
        toItem: { select: { id: true, name: true } },
      },
      orderBy: { id: "desc" },
    });

    return NextResponse.json({ dependencies });
  } catch (err) {
    console.error("Get dependencies error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const data = createDependencySchema.parse(body);
    if (data.fromItemId === data.toItemId) {
      return NextResponse.json({ error: "Cannot depend on self" }, { status: 400 });
    }

    const existing = await prisma.dependency.findFirst({
      where: {
        fromItemId: data.fromItemId,
        toItemId: data.toItemId,
        dependencyType: data.dependencyType,
      },
    });
    if (existing) return NextResponse.json({ dependency: existing });

    const dependency = await prisma.dependency.create({
      data,
      include: {
        fromItem: { select: { id: true, name: true, boardId: true } },
        toItem: { select: { id: true, name: true } },
      },
    });

    broadcastToBoard(dependency.fromItem.boardId, "dependency:created", { dependency });
    return NextResponse.json({ dependency }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "ZodError") {
      return NextResponse.json({ error: "Invalid dependency payload" }, { status: 400 });
    }
    console.error("Create dependency error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const existing = await prisma.dependency.findUnique({
      where: { id },
      include: { fromItem: { select: { boardId: true } } },
    });
    if (!existing) return NextResponse.json({ error: "Dependency not found" }, { status: 404 });

    await prisma.dependency.delete({ where: { id } });
    broadcastToBoard(existing.fromItem.boardId, "dependency:deleted", { id });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Delete dependency error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
