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

    const { id: boardId } = await params;
    const q = new URL(req.url).searchParams.get("q")?.trim().toLowerCase() ?? "";

    const membership = await prisma.boardMember.findFirst({
      where: { boardId, userId: user.id },
      select: { id: true },
    });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const memberships = await prisma.boardMember.findMany({
      where: {
        userId: user.id,
        boardId: { not: boardId },
      },
      include: {
        board: {
          select: {
            id: true,
            name: true,
            workspace: { select: { id: true, name: true } },
            groups: {
              select: {
                id: true,
                name: true,
                items: {
                  select: { id: true, name: true },
                  orderBy: { position: "asc" },
                },
              },
              orderBy: { position: "asc" },
            },
          },
        },
      },
      orderBy: { board: { name: "asc" } },
    });

    const boards = memberships.map((entry) => {
      const items = entry.board.groups.flatMap((group) =>
        group.items.map((item) => ({
          id: item.id,
          name: item.name,
          groupId: group.id,
          groupName: group.name,
          boardId: entry.board.id,
          boardName: entry.board.name,
        }))
      );
      const filteredItems = q
        ? items.filter((item) => item.name.toLowerCase().includes(q))
        : items;

      return {
        id: entry.board.id,
        name: entry.board.name,
        workspace: entry.board.workspace,
        items: filteredItems,
      };
    }).filter((board) => board.items.length > 0 || !q);

    return NextResponse.json({ boards });
  } catch (err) {
    console.error("Connect options error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

