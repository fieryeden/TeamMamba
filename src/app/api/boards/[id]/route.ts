import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const board = await prisma.board.findUnique({
      where: { id },
      include: {
        columns: { orderBy: { order: "asc" } },
        groups: {
          orderBy: { position: "asc" },
          include: {
            items: {
              orderBy: { position: "asc" },
              include: {
                columnValues: { include: { column: true } },
                assignees: { include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } } },
                comments: { take: 0, include: { user: true } },
                _count: { select: { comments: true, subitems: true } },
              },
            },
          },
        },
        members: {
          include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
        },
        views: { where: { userId: user.id }, orderBy: { isDefault: "desc" } },
        automations: { where: { isEnabled: true } },
      },
    });

    if (!board) return NextResponse.json({ error: "Board not found" }, { status: 404 });

    return NextResponse.json({ board });
  } catch (err) {
    console.error("Get board error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();

    const board = await prisma.board.update({
      where: { id },
      data: body,
    });

    return NextResponse.json({ board });
  } catch (err) {
    console.error("Update board error:", err);
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
    await prisma.board.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete board error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
