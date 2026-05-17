import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";
import { z } from "zod";

const createViewSchema = z.object({
  name: z.string().min(1).max(200),
  filters: z.unknown(),
  isDefault: z.boolean().optional(),
});

async function ensureBoardAccess(boardId: string, userId: string) {
  const membership = await prisma.boardMember.findFirst({
    where: { boardId, userId },
    select: { id: true },
  });
  return Boolean(membership);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id: boardId } = await params;

    const allowed = await ensureBoardAccess(boardId, user.id);
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const views = await prisma.boardView.findMany({
      where: { boardId },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ views });
  } catch (err) {
    console.error("Get board views error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id: boardId } = await params;
    const allowed = await ensureBoardAccess(boardId, user.id);
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const parsed = createViewSchema.parse(body);

    const view = await prisma.$transaction(async (tx) => {
      if (parsed.isDefault) {
        await tx.boardView.updateMany({
          where: { boardId },
          data: { isDefault: false },
        });
      }
      return tx.boardView.create({
        data: {
          boardId,
          name: parsed.name.trim(),
          filters: JSON.parse(JSON.stringify(parsed.filters)),
          isDefault: Boolean(parsed.isDefault),
          createdById: user.id,
        },
        include: {
          createdBy: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        },
      });
    });

    return NextResponse.json({ view }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "ZodError") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    console.error("Create board view error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
