import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const take = Math.min(100, Math.max(1, Number(searchParams.get("take") ?? "30")));
    const skip = Math.max(0, Number(searchParams.get("skip") ?? "0"));
    const boardId = searchParams.get("boardId");
    const action = searchParams.get("action");

    const activities = await prisma.activity.findMany({
      where: {
        board: {
          members: { some: { userId: user.id } },
        },
        ...(boardId ? { boardId } : {}),
        ...(action ? { action: action as any } : {}),
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        board: { select: { id: true, name: true } },
        item: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take,
      skip,
    });

    return NextResponse.json({ activities, take, skip });
  } catch (err) {
    console.error("Get activities error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
