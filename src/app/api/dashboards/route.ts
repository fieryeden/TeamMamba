import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const dashboards = await prisma.dashboard.findMany({
      where: { ownerId: user.id },
      include: { widgets: { orderBy: { order: "asc" } } },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ dashboards });
  } catch (err) {
    console.error("Get dashboards error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { name, description } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const dashboard = await prisma.dashboard.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        ownerId: user.id,
      },
      include: { widgets: true },
    });

    return NextResponse.json({ dashboard }, { status: 201 });
  } catch (err) {
    console.error("Create dashboard error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
