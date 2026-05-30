import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: boardId } = await ctx.params;

    const membership = await prisma.boardMember.findFirst({
      where: { boardId, userId: user.id },
      select: { id: true },
    });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const groups = await prisma.group.findMany({
      where: { boardId },
      include: {
        items: {
          select: { id: true, name: true },
          orderBy: { position: "asc" },
        },
      },
      orderBy: { position: "asc" },
    });

    const items = groups.flatMap((g) => g.items);
    return NextResponse.json({ items });
  } catch (err) {
    console.error("Board items fetch error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
