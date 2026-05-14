import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";
import { createItemCommentSchema } from "@/lib/validations";
import { broadcastToBoard } from "@/lib/socket";
import { sendEmail } from "@/lib/mailer";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const itemId = new URL(req.url).searchParams.get("itemId");
    if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });

    const comments = await prisma.comment.findMany({
      where: { itemId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        reactions: true,
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ comments });
  } catch (err) {
    console.error("Get comments error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const data = createItemCommentSchema.parse(body);

    const item = await prisma.item.findUnique({
      where: { id: data.itemId },
      select: { boardId: true },
    });
    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

    const comment = await prisma.comment.create({
      data: {
        itemId: data.itemId,
        userId: user.id,
        body: data.body,
        parentId: data.parentId,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        reactions: true,
      },
    });

    const mentionMatches = Array.from(data.body.matchAll(/@([\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/g)).map(
      (match) => match[1].toLowerCase()
    );
    if (mentionMatches.length > 0) {
      const recipients = await prisma.user.findMany({
        where: {
          email: { in: mentionMatches },
          emailNotificationsEnabled: true,
          emailOnMentions: true,
        },
        select: { email: true, firstName: true },
      });
      await Promise.all(
        recipients
          .filter((recipient) => recipient.email !== user.email)
          .map((recipient) =>
            sendEmail({
              to: recipient.email,
              subject: `You were mentioned in TeamMamba`,
              text: `${user.firstName} mentioned you: "${data.body}"`,
            })
          )
      );
    }

    broadcastToBoard(item.boardId, "comment:created", { comment });
    return NextResponse.json({ comment }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "ZodError") {
      return NextResponse.json({ error: "Invalid comment payload" }, { status: 400 });
    }
    console.error("Create comment error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
