import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";

// POST /api/polls/[id]/vote — Cast a vote
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    const poll = await prisma.poll.findUnique({
      where: { id },
      include: { board: true },
    });
    if (!poll) return NextResponse.json({ error: "Poll not found" }, { status: 404 });

    // Check if poll is closed
    if (poll.closesAt && new Date() > new Date(poll.closesAt)) {
      return NextResponse.json({ error: "Poll is closed" }, { status: 400 });
    }

    const body = await req.json();
    const { optionIdx } = body as { optionIdx: number };

    if (typeof optionIdx !== "number" || optionIdx < 0 || optionIdx >= poll.options.length) {
      return NextResponse.json({ error: "Invalid option index" }, { status: 400 });
    }

    if (!poll.isMultiSelect) {
      // Remove existing votes for this user before adding new one
      await prisma.pollVote.deleteMany({
        where: { pollId: id, userId: user.id },
      });
    }

    const vote = await prisma.pollVote.create({
      data: {
        pollId: id,
        userId: user.id,
        optionIdx,
      },
    });

    return NextResponse.json({ vote }, { status: 201 });
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return NextResponse.json({ error: "Already voted for this option" }, { status: 409 });
    }
    console.error("Vote error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/polls/[id]/vote — Remove your vote from a poll
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    const poll = await prisma.poll.findUnique({ where: { id } });
    if (!poll) return NextResponse.json({ error: "Poll not found" }, { status: 404 });

    // Check if poll is closed
    if (poll.closesAt && new Date() > new Date(poll.closesAt)) {
      return NextResponse.json({ error: "Poll is closed" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const optionIdxParam = searchParams.get("optionIdx");
    const optionIdx = optionIdxParam !== null ? Number(optionIdxParam) : null;

    if (optionIdx !== null) {
      // Remove vote for specific option
      await prisma.pollVote.deleteMany({
        where: { pollId: id, userId: user.id, optionIdx },
      });
    } else {
      // Remove all votes for this user on this poll
      await prisma.pollVote.deleteMany({
        where: { pollId: id, userId: user.id },
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Remove vote error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
