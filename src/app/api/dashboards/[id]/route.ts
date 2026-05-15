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
    const dashboard = await prisma.dashboard.findUnique({
      where: { id, ownerId: user.id },
      include: { widgets: { orderBy: { order: "asc" } } },
    });

    if (!dashboard) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ dashboard });
  } catch (err) {
    console.error("Get dashboard error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();
    const { name, description } = body;

    const dashboard = await prisma.dashboard.update({
      where: { id, ownerId: user.id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
      },
      include: { widgets: { orderBy: { order: "asc" } } },
    });

    return NextResponse.json({ dashboard });
  } catch (err) {
    console.error("Update dashboard error:", err);
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
    await prisma.dashboard.delete({ where: { id, ownerId: user.id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete dashboard error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
