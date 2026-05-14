import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";
import { WorkspaceRole } from "@prisma/client";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();
    const { role } = body as { role?: string };

    const validRoles = ["OWNER", "ADMIN", "MEMBER", "VIEWER"];
    if (!role || !validRoles.includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    const typedRole = role as WorkspaceRole;

    // Check the current user is an owner or admin of a workspace the target user belongs to
    const membership = await prisma.workspaceMember.findFirst({
      where: { id },
      include: { workspace: { include: { members: { where: { userId: user.id } } } } },
    });

    if (!membership) {
      return NextResponse.json({ error: "Membership not found" }, { status: 404 });
    }

    const callerMember = membership.workspace.members[0];
    if (!callerMember || !["OWNER", "ADMIN"].includes(callerMember.role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const updated = await prisma.workspaceMember.update({
      where: { id },
      data: { role: typedRole },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        workspace: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ membership: updated });
  } catch (err) {
    console.error("Update membership error:", err);
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

    const membership = await prisma.workspaceMember.findFirst({
      where: { id },
      include: { workspace: { include: { members: { where: { userId: user.id } } } } },
    });

    if (!membership) {
      return NextResponse.json({ error: "Membership not found" }, { status: 404 });
    }

    const callerMember = membership.workspace.members[0];
    if (!callerMember || !["OWNER", "ADMIN"].includes(callerMember.role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    await prisma.workspaceMember.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Remove member error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
