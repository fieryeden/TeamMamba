import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";
import { z } from "zod";

const createEmbedSchema = z.object({
  boardId: z.string().uuid(),
  itemId: z.string().uuid().optional().nullable(),
  embedType: z.string().min(1).max(100),
  embedData: z.record(z.unknown()).default({}),
});

async function getDocWithAccess(docId: string, userId: string) {
  const doc = await prisma.doc.findUnique({
    where: { id: docId },
    select: { id: true, workspaceId: true },
  });
  if (!doc) return null;

  const membership = await prisma.workspaceMember.findFirst({
    where: { workspaceId: doc.workspaceId, userId },
    select: { id: true },
  });
  if (!membership) return null;

  return doc;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: docId } = await params;
    const doc = await getDocWithAccess(docId, user.id);
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const embeds = await prisma.docEmbed.findMany({
      where: { docId },
      include: {
        board: { select: { id: true, name: true, workspaceId: true } },
        item: { select: { id: true, name: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ embeds });
  } catch (err) {
    console.error("Get doc embeds error:", err);
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

    const { id: docId } = await params;
    const doc = await getDocWithAccess(docId, user.id);
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();
    const parsed = createEmbedSchema.parse(body);

    const boardMembership = await prisma.boardMember.findFirst({
      where: { boardId: parsed.boardId, userId: user.id },
      select: { id: true },
    });
    if (!boardMembership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    if (parsed.itemId) {
      const item = await prisma.item.findUnique({
        where: { id: parsed.itemId },
        select: { id: true, boardId: true },
      });
      if (!item || item.boardId !== parsed.boardId) {
        return NextResponse.json({ error: "Invalid item for board" }, { status: 400 });
      }
    }

    const embed = await prisma.docEmbed.create({
      data: {
        docId,
        boardId: parsed.boardId,
        itemId: parsed.itemId ?? null,
        embedType: parsed.embedType,
        embedData: JSON.parse(JSON.stringify(parsed.embedData)),
        createdById: user.id,
      },
      include: {
        board: { select: { id: true, name: true, workspaceId: true } },
        item: { select: { id: true, name: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
    });

    return NextResponse.json({ embed }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "ZodError") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    console.error("Create doc embed error:", err);
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

    const { id: docId } = await params;
    const doc = await getDocWithAccess(docId, user.id);
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const embedId = new URL(req.url).searchParams.get("embedId");
    if (!embedId) return NextResponse.json({ error: "embedId required" }, { status: 400 });

    const embed = await prisma.docEmbed.findFirst({
      where: { id: embedId, docId },
      select: { id: true },
    });
    if (!embed) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.docEmbed.delete({ where: { id: embedId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete doc embed error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
