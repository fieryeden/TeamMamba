import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; widgetId: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: dashboardId, widgetId } = await params;
    const body = await req.json();

    // Verify ownership
    const dashboard = await prisma.dashboard.findUnique({
      where: { id: dashboardId, ownerId: user.id },
    });
    if (!dashboard) return NextResponse.json({ error: "Dashboard not found" }, { status: 404 });

    const widget = await prisma.widget.update({
      where: { id: widgetId },
      data: {
        ...(body.title !== undefined && { title: body.title }),
        ...(body.type !== undefined && { type: body.type }),
        ...(body.config !== undefined && { config: body.config }),
        ...(body.order !== undefined && { order: body.order }),
        ...(body.width !== undefined && { width: body.width }),
        ...(body.height !== undefined && { height: body.height }),
      },
    });

    return NextResponse.json({ widget });
  } catch (err) {
    console.error("Update widget error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; widgetId: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: dashboardId, widgetId } = await params;

    const dashboard = await prisma.dashboard.findUnique({
      where: { id: dashboardId, ownerId: user.id },
    });
    if (!dashboard) return NextResponse.json({ error: "Dashboard not found" }, { status: 404 });

    await prisma.widget.delete({ where: { id: widgetId } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete widget error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
