import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    const token = await prisma.apiToken.findUnique({ where: { id } });
    if (!token || token.userId !== user.id) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }

    await prisma.apiToken.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Revoke token error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
