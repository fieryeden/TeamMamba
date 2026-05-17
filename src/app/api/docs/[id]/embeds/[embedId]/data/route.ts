import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";

function getJsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; embedId: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: docId, embedId } = await params;

    const doc = await prisma.doc.findUnique({
      where: { id: docId },
      select: { id: true, workspaceId: true },
    });
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const membership = await prisma.workspaceMember.findFirst({
      where: { workspaceId: doc.workspaceId, userId: user.id },
      select: { id: true },
    });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const embed = await prisma.docEmbed.findFirst({
      where: { id: embedId, docId },
      include: {
        board: {
          include: {
            columns: { orderBy: { order: "asc" } },
            groups: {
              orderBy: { position: "asc" },
              include: {
                items: {
                  orderBy: { position: "asc" },
                  include: {
                    columnValues: {
                      select: { columnId: true, value: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!embed) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const embedData = getJsonRecord(embed.embedData);
    const itemFilter =
      typeof embedData.itemId === "string"
        ? embedData.itemId
        : embed.itemId ?? null;
    const groupFilter = typeof embedData.groupId === "string" ? embedData.groupId : null;

    const filteredGroups = embed.board.groups
      .filter((group) => (groupFilter ? group.id === groupFilter : true))
      .map((group) => ({
        id: group.id,
        name: group.name,
        items: group.items
          .filter((item) => (itemFilter ? item.id === itemFilter : true))
          .map((item) => ({
            id: item.id,
            name: item.name,
            columnValues: item.columnValues,
          })),
      }))
      .filter((group) => group.items.length > 0 || !itemFilter);

    return NextResponse.json({
      board: {
        name: embed.board.name,
        columns: embed.board.columns.map((column) => ({
          id: column.id,
          title: column.title,
          columnType: column.columnType,
        })),
      },
      groups: filteredGroups,
    });
  } catch (err) {
    console.error("Get embed data error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
