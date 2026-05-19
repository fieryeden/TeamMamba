import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";
import { createWorkspaceSchema } from "@/lib/validations";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workspaces = await prisma.workspace.findMany({
      where: { members: { some: { userId: user.id } } },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        members: {
          include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
        },
        boards: {
          include: { _count: { select: { items: true } } },
          orderBy: { createdAt: "desc" },
        },
        _count: { select: { members: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ workspaces });
  } catch (err) {
    console.error("Get workspaces error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const data = createWorkspaceSchema.parse(body);

    const workspace = await prisma.workspace.create({
      data: {
        name: data.name,
        description: data.description,
        icon: data.icon,
        color: data.color ?? "#579bfc",
        ownerId: user.id,
        members: { create: { userId: user.id, role: "OWNER" } },
      },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        members: {
          include: { user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
        },
      },
    });

    return NextResponse.json({ workspace }, { status: 201 });
  } catch (err) {
    console.error("Create workspace error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
