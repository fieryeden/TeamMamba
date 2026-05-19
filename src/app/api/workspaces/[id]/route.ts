import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";
import { updateWorkspaceSchema } from "@/lib/validations";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();
    const data = updateWorkspaceSchema.parse(body);

    const membership = await prisma.workspaceMember.findFirst({
      where: { workspaceId: id, userId: user.id },
      select: { role: true },
    });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const workspace = await prisma.workspace.update({
      where: { id },
      data,
    });

    return NextResponse.json({ workspace });
  } catch (err) {
    console.error("Update workspace error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
