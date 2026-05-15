import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";
import crypto from "crypto";

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

    const webhooks = await prisma.webhook.findMany({
      where: { boardId },
      include: {
        deliveries: {
          take: 5,
          orderBy: { createdAt: "desc" },
        },
        _count: { select: { deliveries: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ webhooks });
  } catch (err) {
    console.error("Get webhooks error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { boardId, url: webhookUrl, events, description, secret } = body;

    if (!boardId || !webhookUrl?.trim()) {
      return NextResponse.json({ error: "boardId and url required" }, { status: 400 });
    }

    // Validate URL
    try { new URL(webhookUrl); } catch {
      return NextResponse.json({ error: "Invalid webhook URL" }, { status: 400 });
    }

    const membership = await prisma.boardMember.findFirst({
      where: { boardId, userId: user.id },
    });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const webhookSecret = secret || crypto.randomBytes(32).toString("hex");

    const webhook = await prisma.webhook.create({
      data: {
        boardId,
        url: webhookUrl.trim(),
        events: events || ["ITEM_CREATED", "ITEM_UPDATED", "ITEM_DELETED"],
        description: description?.trim() || null,
        secret: webhookSecret,
        isEnabled: true,
      },
    });

    return NextResponse.json({ webhook }, { status: 201 });
  } catch (err) {
    console.error("Create webhook error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
