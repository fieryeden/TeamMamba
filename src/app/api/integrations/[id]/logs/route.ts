import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const integration = await prisma.integrationConfig.findUnique({
      where: { id },
      select: { id: true, createdById: true },
    });
    if (!integration || integration.createdById !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const requestedLimit = Number(searchParams.get("limit") ?? "5");
    const take = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.floor(requestedLimit), 1), 50)
      : 5;

    const logs = await prisma.integrationLog.findMany({
      where: { integrationId: id },
      orderBy: { createdAt: "desc" },
      take,
    });

    return NextResponse.json({ logs });
  } catch (err) {
    console.error("Integration logs error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
