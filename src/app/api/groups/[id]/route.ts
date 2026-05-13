import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";
import { createGroupSchema, updateGroupSchema } from "@/lib/validations";

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const data = createGroupSchema.parse(body);

    const maxPos = await prisma.group.findFirst({
      where: { boardId: data.boardId },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    const group = await prisma.group.create({
      data: {
        boardId: data.boardId,
        name: data.name,
        color: data.color ?? "#579bfc",
        position: (maxPos?.position ?? -1) + 1,
      },
    });

    return NextResponse.json({ group }, { status: 201 });
  } catch (err) {
    console.error("Create group error:", err);
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

    const group = await prisma.group.update({
      where: { id },
      data: body,
    });

    return NextResponse.json({ group });
  } catch (err) {
    console.error("Update group error:", err);
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
    await prisma.group.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete group error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
