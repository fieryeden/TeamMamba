import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const workspaceId = url.searchParams.get("workspaceId");

    const docs = await prisma.doc.findMany({
      where: {
        ...(workspaceId ? { workspaceId } : {}),
        workspace: { members: { some: { userId: user.id } } },
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        workspace: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ docs });
  } catch (err) {
    console.error("Get docs error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { workspaceId, title, icon } = body;

    if (!workspaceId || !title?.trim()) {
      return NextResponse.json({ error: "workspaceId and title required" }, { status: 400 });
    }

    // Verify membership
    const membership = await prisma.workspaceMember.findFirst({
      where: { workspaceId, userId: user.id },
    });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const doc = await prisma.doc.create({
      data: {
        workspaceId,
        title: title.trim(),
        content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Start writing..." }] }] },
        icon: icon ?? "📄",
        createdById: user.id,
      },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        workspace: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ doc }, { status: 201 });
  } catch (err) {
    console.error("Create doc error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
