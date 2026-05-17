import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";
import { runIntegration } from "@/lib/integration-runners";

const executeSchema = z.object({
  itemId: z.string().uuid(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const integration = await prisma.integrationConfig.findUnique({ where: { id } });
    if (!integration || integration.createdById !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = executeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const item = await prisma.item.findUnique({
      where: { id: parsed.data.itemId },
      include: {
        board: { select: { id: true, name: true } },
        columnValues: { include: { column: { select: { id: true, title: true, columnType: true } } } },
        assignees: {
          select: {
            userId: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

    if (integration.boardId && integration.boardId !== item.boardId) {
      return NextResponse.json({ error: "Item does not belong to integration board" }, { status: 400 });
    }

    const member = await prisma.boardMember.findFirst({
      where: { boardId: item.boardId, userId: user.id },
      select: { id: true },
    });
    if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    let success = false;
    let result: unknown = null;

    try {
      const runResult = await runIntegration(
        {
          id: integration.id,
          type: integration.type,
          config: integration.config,
          enabled: integration.enabled,
          boardId: integration.boardId,
        },
        {
          action: "EXECUTE",
          item: {
            id: item.id,
            boardId: item.boardId,
            boardName: item.board.name,
            name: item.name,
            columnValues: item.columnValues.map((entry) => ({
              columnId: entry.columnId,
              columnTitle: entry.column.title,
              columnType: entry.column.columnType,
              value: entry.value,
            })),
            assignees: item.assignees.map((entry) => ({
              userId: entry.userId,
              firstName: entry.user.firstName,
              lastName: entry.user.lastName,
            })),
          },
          itemUrl: `/board/${item.boardId}`,
        }
      );

      success = runResult.ok;
      result = runResult;
    } catch (err) {
      success = false;
      result = { error: err instanceof Error ? err.message : "Unknown execution error" };
    }

    await prisma.integrationLog.create({
      data: {
        integrationId: integration.id,
        action: "EXECUTE",
        success,
        result: JSON.parse(JSON.stringify(result ?? null)),
      },
    });

    return NextResponse.json({ success, result });
  } catch (err) {
    console.error("Execute integration error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
