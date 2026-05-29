import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const sprintId = (await params).id;
    const body = await req.json();
    const { itemId, storyPoints, originalEstimate, addedDuringSprint } = body;

    if (!itemId) {
      return NextResponse.json({ error: "itemId required" }, { status: 400 });
    }

    const sprint = await prisma.sprint.findUnique({ where: { id: sprintId } });
    if (!sprint) return NextResponse.json({ error: "Sprint not found" }, { status: 404 });

    const membership = await prisma.boardMember.findFirst({
      where: { boardId: sprint.boardId, userId: user.id },
    });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const existing = await prisma.sprintItem.findUnique({
      where: { sprintId_itemId: { sprintId, itemId } },
    });
    if (existing) {
      return NextResponse.json({ error: "Item already in sprint" }, { status: 409 });
    }

    const sprintItem = await prisma.sprintItem.create({
      data: {
        sprintId,
        itemId,
        storyPoints: storyPoints ?? null,
        originalEstimate: originalEstimate ?? null,
        addedDuringSprint: addedDuringSprint ?? false,
      },
      include: {
        item: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ sprintItem }, { status: 201 });
  } catch (err) {
    console.error("Add sprint item error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
