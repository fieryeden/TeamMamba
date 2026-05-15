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

    const { id: dashboardId } = await params;
    const body = await req.json();
    const { type, title, config, width, height } = body;

    if (!type || !title) {
      return NextResponse.json({ error: "type and title required" }, { status: 400 });
    }

    const dashboard = await prisma.dashboard.findUnique({
      where: { id: dashboardId, ownerId: user.id },
    });
    if (!dashboard) return NextResponse.json({ error: "Dashboard not found" }, { status: 404 });

    const maxOrder = await prisma.widget.findFirst({
      where: { dashboardId },
      orderBy: { order: "desc" },
      select: { order: true },
    });

    const widget = await prisma.widget.create({
      data: {
        dashboardId,
        type,
        title,
        config: config ?? null,
        order: (maxOrder?.order ?? -1) + 1,
        width: width ?? 1,
        height: height ?? 1,
      },
    });

    return NextResponse.json({ widget }, { status: 201 });
  } catch (err) {
    console.error("Create widget error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: dashboardId } = await params;
    const dashboard = await prisma.dashboard.findUnique({
      where: { id: dashboardId, ownerId: user.id },
    });
    if (!dashboard) return NextResponse.json({ error: "Dashboard not found" }, { status: 404 });

    const widgets = await prisma.widget.findMany({
      where: { dashboardId },
      orderBy: { order: "asc" },
    });

    return NextResponse.json({ widgets });
  } catch (err) {
    console.error("Get widgets error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
