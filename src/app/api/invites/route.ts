import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { email, workspaceId } = body as { email?: string; workspaceId?: string };

    if (!email || !email.trim()) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Find or create the user by email
    let targetUser = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });

    if (!targetUser) {
      // Create a placeholder user with status "INVITED"
      targetUser = await prisma.user.create({
        data: {
          email: email.trim().toLowerCase(),
          firstName: email.split("@")[0],
          lastName: "",
          passwordHash: crypto.randomUUID(), // placeholder, user will reset on first login
          status: "ACTIVE",
        },
      });
    }

    // Determine workspace(s) to add them to
    if (workspaceId) {
      // Add to specific workspace
      const callerMembership = await prisma.workspaceMember.findFirst({
        where: { workspaceId, userId: user.id },
      });
      if (!callerMembership || !["OWNER", "ADMIN"].includes(callerMembership.role)) {
        return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
      }

      const existing = await prisma.workspaceMember.findFirst({
        where: { workspaceId, userId: targetUser.id },
      });
      if (existing) {
        return NextResponse.json({ error: "User is already a member of this workspace" }, { status: 409 });
      }

      await prisma.workspaceMember.create({
        data: { workspaceId, userId: targetUser.id, role: "MEMBER" },
      });
    } else {
      // Add to all workspaces the caller is an owner/admin of
      const callerWorkspaces = await prisma.workspaceMember.findMany({
        where: { userId: user.id, role: { in: ["OWNER", "ADMIN"] } },
        select: { workspaceId: true },
      });

      for (const { workspaceId: wid } of callerWorkspaces) {
        const existing = await prisma.workspaceMember.findFirst({
          where: { workspaceId: wid, userId: targetUser.id },
        });
        if (!existing) {
          await prisma.workspaceMember.create({
            data: { workspaceId: wid, userId: targetUser.id, role: "MEMBER" },
          });
        }
      }

      if (callerWorkspaces.length === 0) {
        return NextResponse.json({ error: "No workspaces to invite to" }, { status: 400 });
      }
    }

    return NextResponse.json({ success: true, invitedUser: { id: targetUser.id, email: targetUser.email } });
  } catch (err) {
    console.error("Send invite error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
