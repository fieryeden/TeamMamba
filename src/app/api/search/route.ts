import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
    if (!q) {
      return NextResponse.json({ boards: [], items: [], workspaces: [] });
    }

    const [boards, items, workspaces] = await Promise.all([
      prisma.board.findMany({
        where: {
          name: { contains: q, mode: "insensitive" },
          workspace: { members: { some: { userId: user.id } } },
        },
        select: { id: true, name: true },
        take: 8,
        orderBy: { updatedAt: "desc" },
      }),
      prisma.item.findMany({
        where: {
          name: { contains: q, mode: "insensitive" },
          board: { workspace: { members: { some: { userId: user.id } } } },
        },
        select: { id: true, name: true, boardId: true, board: { select: { name: true } } },
        take: 8,
        orderBy: { updatedAt: "desc" },
      }),
      prisma.workspace.findMany({
        where: {
          name: { contains: q, mode: "insensitive" },
          members: { some: { userId: user.id } },
        },
        select: { id: true, name: true },
        take: 8,
        orderBy: { updatedAt: "desc" },
      }),
    ]);

    return NextResponse.json({ boards, items, workspaces });
  } catch (err) {
    console.error("Global search error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
