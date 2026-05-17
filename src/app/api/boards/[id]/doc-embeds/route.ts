import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";
import { z } from "zod";

const createBoardEmbedSchema = z.object({
  docId: z.string().uuid(),
  itemId: z.string().uuid().optional().nullable(),
  embedType: z.string().min(1).max(100).default("ITEM_DOC"),
  embedData: z.record(z.unknown()).default({}),
});

async function ensureBoardAccess(boardId: string, userId: string) {
  const membership = await prisma.boardMember.findFirst({
    where: { boardId, userId },
    select: { id: true },
  });
  return Boolean(membership);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: boardId } = await params;
    const allowed = await ensureBoardAccess(boardId, user.id);
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const itemId = searchParams.get("itemId");

    const embeds = await prisma.docEmbed.findMany({
      where: {
        boardId,
        ...(itemId ? { itemId } : {}),
      },
      include: {
        doc: {
          select: {
            id: true,
            title: true,
            icon: true,
            content: true,
            updatedAt: true,
            workspaceId: true,
          },
        },
        item: { select: { id: true, name: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ embeds });
  } catch (err) {
    console.error("Get board doc embeds error:", err);
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
    const parsed = createBoardEmbedSchema.parse(body);

    const doc = await prisma.doc.findUnique({
      where: { id: parsed.docId },
      select: { id: true, workspaceId: true },
    });
    if (!doc) return NextResponse.json({ error: "Doc not found" }, { status: 404 });

    const workspaceMembership = await prisma.workspaceMember.findFirst({
      where: { workspaceId: doc.workspaceId, userId: user.id },
      select: { id: true },
    });
    if (!workspaceMembership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    if (parsed.itemId) {
      const item = await prisma.item.findUnique({
        where: { id: parsed.itemId },
        select: { id: true, boardId: true },
      });
      if (!item || item.boardId !== boardId) {
        return NextResponse.json({ error: "Invalid item for board" }, { status: 400 });
      }
    }

    const embed = await prisma.docEmbed.create({
      data: {
        docId: parsed.docId,
        boardId,
        itemId: parsed.itemId ?? null,
        embedType: parsed.embedType,
        embedData: JSON.parse(JSON.stringify(parsed.embedData)),
        createdById: user.id,
      },
      include: {
        doc: {
          select: {
            id: true,
            title: true,
            icon: true,
            content: true,
            updatedAt: true,
            workspaceId: true,
          },
        },
        item: { select: { id: true, name: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
    });

    return NextResponse.json({ embed }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "ZodError") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    console.error("Create board doc embed error:", err);
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

    const { id: boardId } = await params;
    const allowed = await ensureBoardAccess(boardId, user.id);
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const embedId = new URL(req.url).searchParams.get("embedId");
    if (!embedId) return NextResponse.json({ error: "embedId required" }, { status: 400 });

    const embed = await prisma.docEmbed.findFirst({
      where: { id: embedId, boardId },
      select: { id: true },
    });
    if (!embed) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.docEmbed.delete({ where: { id: embedId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete board doc embed error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
