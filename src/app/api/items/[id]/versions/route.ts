import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const item = await prisma.item.findUnique({
      where: { id },
      select: { id: true, boardId: true },
    });
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const membership = await prisma.boardMember.findFirst({
      where: { boardId: item.boardId, userId: user.id },
      select: { id: true },
    });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const versions = await prisma.itemVersion.findMany({
      where: { itemId: id },
      include: {
        changedBy: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ versions });
  } catch (err) {
    console.error("Get item versions error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
