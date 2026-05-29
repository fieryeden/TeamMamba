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

    const sprint = await prisma.sprint.findUnique({ where: { id } });
    if (!sprint) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const membership = await prisma.boardMember.findFirst({
      where: { boardId: sprint.boardId, userId: user.id },
    });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const updated = await prisma.sprint.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.goal !== undefined && { goal: body.goal }),
        ...(body.startDate !== undefined && { startDate: new Date(body.startDate) }),
        ...(body.endDate !== undefined && { endDate: new Date(body.endDate) }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.velocity !== undefined && { velocity: body.velocity }),
      },
      include: {
        items: {
          include: {
            item: { select: { id: true, name: true } },
          },
        },
      },
    });

    return NextResponse.json({ sprint: updated });
  } catch (err) {
    console.error("Update sprint error:", err);
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

    const sprint = await prisma.sprint.findUnique({ where: { id } });
    if (!sprint) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const membership = await prisma.boardMember.findFirst({
      where: { boardId: sprint.boardId, userId: user.id },
    });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await prisma.sprint.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete sprint error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
