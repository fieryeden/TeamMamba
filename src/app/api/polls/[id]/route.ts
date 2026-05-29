import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";

// DELETE /api/polls/[id] — Delete a poll (only creator or board admin)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    const poll = await prisma.poll.findUnique({
      where: { id },
      include: { board: { include: { members: true, workspace: { include: { members: true } } } } },
    });
    if (!poll) return NextResponse.json({ error: "Poll not found" }, { status: 404 });

    // Check if user is poll creator OR board owner/admin OR workspace owner/admin
    const boardMembership = poll.board.members.find((m) => m.userId === user.id);
    const wsMembership = poll.board.workspace.members.find((m) => m.userId === user.id);
    const isCreator = poll.creatorId === user.id;
    const isBoardAdmin = boardMembership?.role === "ADMIN" || boardMembership?.role === "OWNER";
    const isWsAdmin = wsMembership?.role === "OWNER" || wsMembership?.role === "ADMIN";

    if (!isCreator && !isBoardAdmin && !isWsAdmin && user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.poll.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete poll error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
