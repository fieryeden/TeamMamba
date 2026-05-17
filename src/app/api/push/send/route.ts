import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";

const sendSchema = z.object({
  userId: z.string().uuid(),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(1000),
  url: z.string().url().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const payload = sendSchema.safeParse(await req.json());
    if (!payload.success) {
      return NextResponse.json({ error: "Invalid payload", details: payload.error.flatten() }, { status: 400 });
    }

    const subscription = await prisma.pushSubscription.findFirst({
      where: { userId: payload.data.userId },
      orderBy: { updatedAt: "desc" },
    });

    if (!subscription) {
      return NextResponse.json({ success: false, message: "No push subscription found for user" }, { status: 404 });
    }

    const attempt = {
      endpoint: subscription.endpoint,
      title: payload.data.title,
      body: payload.data.body,
      url: payload.data.url ?? "/dashboard",
      sentBy: user.id,
      sentAt: new Date().toISOString(),
      mode: "skeleton",
    };

    console.info("Push send skeleton:", attempt);

    return NextResponse.json({ success: true, message: "Push send attempt logged", attempt });
  } catch (err) {
    console.error("Push send error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
