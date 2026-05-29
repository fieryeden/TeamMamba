import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";

// GET /api/polls?boardId=xxx — Get all polls for a board with vote summaries
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const boardId = searchParams.get("boardId");
    if (!boardId) return NextResponse.json({ error: "boardId is required" }, { status: 400 });

    // Verify board access
    const boardMembership = await prisma.boardMember.findFirst({
      where: { boardId, userId: user.id },
    });
    if (!boardMembership && user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const polls = await prisma.poll.findMany({
      where: { boardId },
      include: {
        creator: { select: { id: true, firstName: true, lastName: true } },
        item: { select: { id: true, name: true } },
        votes: { select: { id: true, userId: true, optionIdx: true } },
        _count: { select: { votes: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ polls });
  } catch (err) {
    console.error("Get polls error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/polls — Create a poll
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { boardId, itemId, question, options, isAnonymous, isMultiSelect, closesAt } = body as {
      boardId: string;
      itemId?: string;
      question: string;
      options: string[];
      isAnonymous?: boolean;
      isMultiSelect?: boolean;
      closesAt?: string;
    };

    if (!boardId) return NextResponse.json({ error: "boardId is required" }, { status: 400 });
    if (!question?.trim()) return NextResponse.json({ error: "question is required" }, { status: 400 });
    if (!options || options.length < 2) return NextResponse.json({ error: "At least 2 options are required" }, { status: 400 });
    if (options.length > 10) return NextResponse.json({ error: "Maximum 10 options allowed" }, { status: 400 });

    // Verify board access
    const boardMembership = await prisma.boardMember.findFirst({
      where: { boardId, userId: user.id },
    });
    if (!boardMembership && user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const poll = await prisma.poll.create({
      data: {
        boardId,
        itemId: itemId ?? null,
        creatorId: user.id,
        question: question.trim(),
        options,
        isAnonymous: isAnonymous ?? false,
        isMultiSelect: isMultiSelect ?? false,
        closesAt: closesAt ? new Date(closesAt) : null,
      },
      include: {
        creator: { select: { id: true, firstName: true, lastName: true } },
        item: { select: { id: true, name: true } },
        votes: { select: { id: true, userId: true, optionIdx: true } },
        _count: { select: { votes: true } },
      },
    });

    return NextResponse.json({ poll }, { status: 201 });
  } catch (err) {
    console.error("Create poll error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
