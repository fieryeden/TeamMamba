import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;

    const board = await prisma.board.findUnique({
      where: { id },
      include: {
        columns: { orderBy: { order: "asc" } },
        groups: {
          orderBy: { position: "asc" },
          include: {
            items: {
              orderBy: { position: "asc" },
              include: {
                columnValues: true,
                subitems: { include: { columnValues: true } },
              },
            },
          },
        },
        automations: true,
      },
    });

    if (!board) return NextResponse.json({ error: "Board not found" }, { status: 404 });
    return NextResponse.json({ board });
  } catch (err) {
    console.error("Export board error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
