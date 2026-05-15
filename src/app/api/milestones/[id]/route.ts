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

    const milestone = await prisma.milestone.findUnique({ where: { id } });
    if (!milestone) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const membership = await prisma.boardMember.findFirst({
      where: { boardId: milestone.boardId, userId: user.id },
    });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const updated = await prisma.milestone.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.title !== undefined && { name: body.title }), // accept both
        ...(body.description !== undefined && { description: body.description }),
        ...(body.targetDate !== undefined && { targetDate: new Date(body.targetDate) }),
        ...(body.color !== undefined && { color: body.color }),
        ...(body.completed !== undefined && { achievedAt: body.completed ? new Date() : null }),
      },
      include: {
        board: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ milestone: updated });
  } catch (err) {
    console.error("Update milestone error:", err);
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

    const milestone = await prisma.milestone.findUnique({ where: { id } });
    if (!milestone) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const membership = await prisma.boardMember.findFirst({
      where: { boardId: milestone.boardId, userId: user.id },
    });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await prisma.milestone.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete milestone error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
