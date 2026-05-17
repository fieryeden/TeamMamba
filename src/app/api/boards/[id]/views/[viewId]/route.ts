import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";
import { z } from "zod";

const patchViewSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  filters: z.unknown().optional(),
  isDefault: z.boolean().optional(),
});

async function ensureBoardAccess(boardId: string, userId: string) {
  const membership = await prisma.boardMember.findFirst({
    where: { boardId, userId },
    select: { id: true },
  });
  return Boolean(membership);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; viewId: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: boardId, viewId } = await params;
    const allowed = await ensureBoardAccess(boardId, user.id);
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const existing = await prisma.boardView.findFirst({
      where: { id: viewId, boardId },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();
    const parsed = patchViewSchema.parse(body);

    const view = await prisma.$transaction(async (tx) => {
      if (parsed.isDefault) {
        await tx.boardView.updateMany({
          where: { boardId },
          data: { isDefault: false },
        });
      }
      return tx.boardView.update({
        where: { id: viewId },
        data: {
          ...(parsed.name !== undefined ? { name: parsed.name.trim() } : {}),
          ...(parsed.filters !== undefined ? { filters: JSON.parse(JSON.stringify(parsed.filters)) } : {}),
          ...(parsed.isDefault !== undefined ? { isDefault: parsed.isDefault } : {}),
        },
        include: {
          createdBy: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        },
      });
    });

    return NextResponse.json({ view });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "ZodError") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    console.error("Patch board view error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; viewId: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: boardId, viewId } = await params;
    const allowed = await ensureBoardAccess(boardId, user.id);
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const existing = await prisma.boardView.findFirst({
      where: { id: viewId, boardId },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.boardView.delete({ where: { id: viewId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete board view error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
