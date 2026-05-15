import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";
import { fireWebhooks } from "@/lib/webhooks";
import { createAuditLog } from "@/lib/audit";
import { createColumnSchema } from "@/lib/validations";

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const data = createColumnSchema.parse(body);

    const maxOrder = await prisma.boardColumn.findFirst({
      where: { boardId: data.boardId },
      orderBy: { order: "desc" },
      select: { order: true },
    });

    const column = await prisma.boardColumn.create({
      data: {
        boardId: data.boardId,
        title: data.title,
        columnType: data.columnType,
        config: data.config ? JSON.parse(JSON.stringify(data.config)) : undefined,
        order: (maxOrder?.order ?? -1) + 1,
      },
    });

    return NextResponse.json({ column }, { status: 201 });
  } catch (err) {
    console.error("Create column error:", err);
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

    const column = await prisma.boardColumn.update({
      where: { id },
      data: body,
    });

    return NextResponse.json({ column });
  } catch (err) {
    console.error("Update column error:", err);
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
    await prisma.boardColumn.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete column error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
