import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();

    const webhook = await prisma.webhook.findUnique({ where: { id } });
    if (!webhook) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const membership = await prisma.boardMember.findFirst({
      where: { boardId: webhook.boardId, userId: user.id },
    });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const updated = await prisma.webhook.update({
      where: { id },
      data: {
        ...(body.url !== undefined && { url: body.url }),
        ...(body.events !== undefined && { events: body.events }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.isEnabled !== undefined && { isEnabled: body.isEnabled }),
      },
    });

    return NextResponse.json({ webhook: updated });
  } catch (err) {
    console.error("Update webhook error:", err);
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

    const webhook = await prisma.webhook.findUnique({ where: { id } });
    if (!webhook) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const membership = await prisma.boardMember.findFirst({
      where: { boardId: webhook.boardId, userId: user.id },
    });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await prisma.webhookEvent.deleteMany({ where: { webhookId: id } });
    await prisma.webhook.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete webhook error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Test a webhook by sending a ping event
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    const webhook = await prisma.webhook.findUnique({ where: { id } });
    if (!webhook) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const membership = await prisma.boardMember.findFirst({
      where: { boardId: webhook.boardId, userId: user.id },
    });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const payload = {
      event: "WEBHOOK_PING",
      timestamp: new Date().toISOString(),
      webhookId: webhook.id,
      boardId: webhook.boardId,
    };

    const crypto = await import("crypto");
    const secret = webhook.secret || "default-secret";
    const signature = crypto
      .createHmac("sha256", secret)
      .update(JSON.stringify(payload))
      .digest("hex");

    let statusCode = 0;
    let success = false;

    try {
      const res = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": signature,
          "X-Webhook-Event": "WEBHOOK_PING",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });
      statusCode = res.status;
      success = res.ok;
    } catch {
      success = false;
      statusCode = 0;
    }

    // Log the delivery event
    await prisma.webhookEvent.create({
      data: {
        webhookId: webhook.id,
        eventType: "WEBHOOK_PING",
        payload: payload as any,
        statusCode,
        success,
      },
    });

    // Update lastFiredAt
    await prisma.webhook.update({
      where: { id: webhook.id },
      data: { lastFiredAt: new Date() },
    }).catch(() => {});

    return NextResponse.json({ success, statusCode });
  } catch (err) {
    console.error("Test webhook error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
