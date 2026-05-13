import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";
import { createBoardSchema, updateBoardSchema } from "@/lib/validations";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
    }

    const boards = await prisma.board.findMany({
      where: { workspaceId },
      include: {
        columns: { orderBy: { order: "asc" } },
        groups: { orderBy: { position: "asc" } },
        _count: { select: { items: true } },
        members: {
          include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ boards });
  } catch (err) {
    console.error("Get boards error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const data = createBoardSchema.parse(body);

    // Create board with default columns and groups
    const board = await prisma.board.create({
      data: {
        workspaceId: data.workspaceId,
        name: data.name,
        description: data.description,
        icon: data.icon,
        boardKind: data.boardKind,
        columns: {
          createMany: {
            data: [
              { title: "Status", columnType: "STATUS", order: 0, config: { labels: ["Not Started", "Working on it", "Done", "Stuck"], colors: ["#c4c4c4", "#fdab3d", "#00c875", "#e2445c"] } },
              { title: "People", columnType: "PEOPLE", order: 1 },
              { title: "Date", columnType: "DATE", order: 2 },
              { title: "Priority", columnType: "STATUS", order: 3, config: { labels: ["Critical", "High", "Medium", "Low"], colors: ["#333333", "#e2445c", "#fdab3d", "#579bfc"] } },
            ],
          },
        },
        groups: {
          createMany: {
            data: [
              { name: "Group 1", color: "#579bfc", position: 0 },
            ],
          },
        },
        members: { create: { userId: user.id, role: "OWNER" } },
      },
      include: {
        columns: { orderBy: { order: "asc" } },
        groups: { orderBy: { position: "asc" } },
      },
    });

    // Log activity
    await prisma.activity.create({
      data: {
        boardId: board.id,
        userId: user.id,
        action: "BOARD_CREATED",
        details: { boardName: data.name },
      },
    });

    return NextResponse.json({ board }, { status: 201 });
  } catch (err) {
    console.error("Create board error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
