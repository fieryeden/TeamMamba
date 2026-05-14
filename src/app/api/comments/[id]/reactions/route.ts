import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";
import { commentReactionSchema } from "@/lib/validations";
import { broadcastToBoard } from "@/lib/socket";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const body = await req.json();
    const { emoji } = commentReactionSchema.parse(body);

    const comment = await prisma.comment.findUnique({
      where: { id },
      include: { item: { select: { boardId: true } } },
    });
    if (!comment) return NextResponse.json({ error: "Comment not found" }, { status: 404 });

    const existing = await prisma.commentReaction.findFirst({
      where: { commentId: id, userId: user.id, emoji },
    });

    const reaction = existing
      ? existing
      : await prisma.commentReaction.create({
          data: {
            commentId: id,
            userId: user.id,
            emoji,
          },
        });

    broadcastToBoard(comment.item.boardId, "comment:reaction", { commentId: id, emoji });
    return NextResponse.json({ reaction }, { status: existing ? 200 : 201 });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "ZodError") {
      return NextResponse.json({ error: "Invalid reaction payload" }, { status: 400 });
    }
    console.error("Add reaction error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const emoji = new URL(req.url).searchParams.get("emoji");
    if (!emoji) return NextResponse.json({ error: "emoji required" }, { status: 400 });

    const comment = await prisma.comment.findUnique({
      where: { id },
      include: { item: { select: { boardId: true } } },
    });
    if (!comment) return NextResponse.json({ error: "Comment not found" }, { status: 404 });

    await prisma.commentReaction.deleteMany({
      where: { commentId: id, userId: user.id, emoji },
    });
    broadcastToBoard(comment.item.boardId, "comment:reaction", { commentId: id, emoji, removed: true });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Delete reaction error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
