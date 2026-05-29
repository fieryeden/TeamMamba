import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: workspaceId } = await params;
    const body = await req.json();
    const { title, body: messageBody, severity = "info" } = body as {
      title: string;
      body?: string;
      severity?: "info" | "warning" | "success";
    };

    if (!title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    // Verify the user is a member of this workspace
    const membership = await prisma.workspaceMember.findFirst({
      where: { workspaceId, userId: user.id },
    });
    if (!membership) {
      return NextResponse.json({ error: "Not a workspace member" }, { status: 403 });
    }

    // Get all workspace members
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId },
      select: { userId: true },
    });

    // Create notifications for all members
    const notifications = await Promise.all(
      members.map((member) =>
        prisma.notification.create({
          data: {
            userId: member.userId,
            title: title.trim(),
            body: messageBody?.trim() || null,
            type: "BROADCAST" as any,
            actionUrl: `/workspace/${workspaceId}`,
          },
        })
      )
    );

    return NextResponse.json({
      success: true,
      recipientCount: members.length,
    });
  } catch (err) {
    console.error("Broadcast error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
