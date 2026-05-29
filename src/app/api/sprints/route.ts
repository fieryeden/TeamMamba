import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const boardId = url.searchParams.get("boardId");
    if (!boardId) {
      return NextResponse.json({ error: "boardId required" }, { status: 400 });
    }

    const membership = await prisma.boardMember.findFirst({
      where: { boardId, userId: user.id },
    });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const sprints = await prisma.sprint.findMany({
      where: { boardId },
      include: {
        items: {
          include: {
            item: {
              select: { id: true, name: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ sprints });
  } catch (err) {
    console.error("Get sprints error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { boardId, name, goal, startDate, endDate } = body;

    if (!boardId || !name?.trim() || !startDate || !endDate) {
      return NextResponse.json({ error: "boardId, name, startDate, and endDate required" }, { status: 400 });
    }

    const membership = await prisma.boardMember.findFirst({
      where: { boardId, userId: user.id },
    });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const sprint = await prisma.sprint.create({
      data: {
        boardId,
        name: name.trim(),
        goal: goal?.trim() || null,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      },
      include: {
        items: true,
      },
    });

    return NextResponse.json({ sprint }, { status: 201 });
  } catch (err) {
    console.error("Create sprint error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
