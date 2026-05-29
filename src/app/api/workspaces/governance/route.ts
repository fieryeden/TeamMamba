import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";

// PATCH /api/workspaces/governance — Update workspace governance settings
export async function PATCH(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { workspaceId, autoArchiveDays, retentionDays } = body;

    if (!workspaceId) return NextResponse.json({ error: "workspaceId required" }, { status: 400 });

    const membership = await prisma.workspaceMember.findFirst({
      where: { workspaceId, userId: user.id },
    });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const workspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        ...(autoArchiveDays !== undefined && { dataRetentionPolicy: { autoArchiveDays, retentionDays } }),
      },
    });

    // Apply auto-archive to all boards in workspace if configured
    if (autoArchiveDays && autoArchiveDays > 0) {
      await prisma.board.updateMany({
        where: { workspaceId },
        data: { autoArchiveDays },
      });
    }

    return NextResponse.json({ workspace });
  } catch (err) {
    console.error("Governance update error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
