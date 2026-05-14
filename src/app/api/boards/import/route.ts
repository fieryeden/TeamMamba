import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";
import { importBoardSchema } from "@/lib/validations";

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const parsed = importBoardSchema.parse(body);
    const source = parsed.board as Record<string, unknown>;

    const sourceColumns = Array.isArray(source.columns) ? source.columns : [];
    const sourceGroups = Array.isArray(source.groups) ? source.groups : [];

    const board = await prisma.board.create({
      data: {
        workspaceId: parsed.workspaceId,
        name: String(source.name ?? "Imported Board"),
        description: typeof source.description === "string" ? source.description : null,
        boardKind: "TABLE",
        members: { create: { userId: user.id, role: "OWNER" } },
      },
    });

    const columnIdMap = new Map<string, string>();
    for (let index = 0; index < sourceColumns.length; index += 1) {
      const column = sourceColumns[index] as Record<string, unknown>;
      const created = await prisma.boardColumn.create({
        data: {
          boardId: board.id,
          title: String(column.title ?? `Column ${index + 1}`),
          columnType: String(column.columnType ?? "TEXT") as any,
          order: index,
          config: column.config ? (JSON.parse(JSON.stringify(column.config)) as any) : undefined,
          width: typeof column.width === "number" ? column.width : null,
        },
      });
      if (typeof column.id === "string") {
        columnIdMap.set(column.id, created.id);
      }
    }

    for (let groupIndex = 0; groupIndex < sourceGroups.length; groupIndex += 1) {
      const group = sourceGroups[groupIndex] as Record<string, unknown>;
      const createdGroup = await prisma.group.create({
        data: {
          boardId: board.id,
          name: String(group.name ?? `Group ${groupIndex + 1}`),
          color: typeof group.color === "string" ? group.color : "#579bfc",
          position: groupIndex,
        },
      });

      const items = Array.isArray(group.items) ? group.items : [];
      for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
        const item = items[itemIndex] as Record<string, unknown>;
        const createdItem = await prisma.item.create({
          data: {
            boardId: board.id,
            groupId: createdGroup.id,
            name: String(item.name ?? `Item ${itemIndex + 1}`),
            position: itemIndex,
          },
        });

        const columnValues = Array.isArray(item.columnValues) ? item.columnValues : [];
        for (const columnValue of columnValues) {
          const value = columnValue as Record<string, unknown>;
          const sourceColumnId = String(value.columnId ?? "");
          const nextColumnId = columnIdMap.get(sourceColumnId);
          if (!nextColumnId) continue;
          await prisma.columnValue.create({
            data: {
              itemId: createdItem.id,
              columnId: nextColumnId,
              value: JSON.parse(JSON.stringify(value.value ?? null)) as any,
            },
          });
        }
      }
    }

    return NextResponse.json({ board }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "ZodError") {
      return NextResponse.json({ error: "Invalid import payload" }, { status: 400 });
    }
    console.error("Import board error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
