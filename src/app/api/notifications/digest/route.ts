import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";
import { sendEmail } from "@/lib/mailer";

// GET /api/notifications/digest?userId=xxx — Get digest for user
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period") || "daily"; // daily, weekly
    const days = period === "weekly" ? 7 : 1;

    const since = new Date();
    since.setDate(since.getDate() - days);

    const notifications = await prisma.notification.findMany({
      where: {
        userId: user.id,
        createdAt: { gte: since },
        isRead: false,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ notifications, period, since: since.toISOString() });
  } catch (err) {
    console.error("Digest error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/notifications/digest — Send digest email
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { userId, period = "daily" } = body;
    const days = period === "weekly" ? 7 : 1;

    const since = new Date();
    since.setDate(since.getDate() - days);

    const notifications = await prisma.notification.findMany({
      where: {
        userId: userId || user.id,
        createdAt: { gte: since },
        isRead: false,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    if (notifications.length === 0) {
      return NextResponse.json({ sent: false, reason: "No unread notifications" });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId || user.id },
      select: { email: true, firstName: true },
    });

    if (!targetUser?.email) {
      return NextResponse.json({ sent: false, reason: "No email address" });
    }

    const subject = `Your ${period} digest — ${notifications.length} new notification${notifications.length > 1 ? "s" : ""}`;
    const text = notifications.map((n) => `• ${n.title}${n.body ? `: ${n.body}` : ""}`).join("\n");

    await sendEmail({
      to: targetUser.email,
      subject,
      text: `Hi ${targetUser.firstName},\n\nHere's what you missed:\n\n${text}\n\n— TeamMamba`,
    });

    // Mark as read
    await prisma.notification.updateMany({
      where: { id: { in: notifications.map((n) => n.id) } },
      data: { isRead: true },
    });

    return NextResponse.json({ sent: true, count: notifications.length });
  } catch (err) {
    console.error("Send digest error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH /api/notifications/digest — Update digest preferences
export async function PATCH(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { digestFrequency, digestTime, muteBoardId, unmuteBoardId } = body;

    // Store preferences in user settings (using a JSON field or separate model)
    // For now, we'll use the existing notification preferences
    const updateData: Record<string, unknown> = {};
    if (digestFrequency) updateData.emailNotificationsEnabled = digestFrequency !== "never";

    if (Object.keys(updateData).length > 0) {
      await prisma.user.update({
        where: { id: user.id },
        data: updateData,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Update digest prefs error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
