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

    const milestones = await prisma.milestone.findMany({
      where: { boardId },
      include: {
        board: { select: { id: true, name: true } },
      },
      orderBy: { targetDate: "asc" },
    });

    return NextResponse.json({ milestones });
  } catch (err) {
    console.error("Get milestones error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { boardId, name, description, targetDate, color } = body;

    if (!boardId || !name?.trim() || !targetDate) {
      return NextResponse.json({ error: "boardId, name, and targetDate required" }, { status: 400 });
    }

    const membership = await prisma.boardMember.findFirst({
      where: { boardId, userId: user.id },
    });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const milestone = await prisma.milestone.create({
      data: {
        boardId,
        name: name.trim(),
        description: description?.trim() || null,
        targetDate: new Date(targetDate),
        color: color ?? "#579bfc",
      },
      include: {
        board: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ milestone }, { status: 201 });
  } catch (err) {
    console.error("Create milestone error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
