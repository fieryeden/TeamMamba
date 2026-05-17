import { prisma } from "@/lib/prisma";

function safeJson<T>(value: T): T {
  if (value === undefined) return null as T;
  return JSON.parse(JSON.stringify(value)) as T;
}

async function upsertColumnValue(itemId: string, columnId: string, value: unknown) {
  const existing = await prisma.columnValue.findFirst({
    where: { itemId, columnId },
    select: { id: true },
  });

  if (existing) {
    await prisma.columnValue.update({
      where: { id: existing.id },
      data: { value: safeJson(value) as any },
    });
    return;
  }

  await prisma.columnValue.create({
    data: {
      itemId,
      columnId,
      value: safeJson(value) as any,
    },
  });
}

export async function syncConnectColumnValue(sourceItemId: string, columnId: string) {
  const links = await prisma.connectColumn.findMany({
    where: { sourceItemId, columnId },
    include: {
      targetItem: {
        select: {
          id: true,
          name: true,
          boardId: true,
          board: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const payload = links.map((entry) => ({
    id: entry.targetItem.id,
    name: entry.targetItem.name,
    boardId: entry.targetItem.boardId,
    boardName: entry.targetItem.board.name,
  }));

  await upsertColumnValue(sourceItemId, columnId, payload);
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export async function computeMirrorValue(itemId: string, config: unknown): Promise<unknown> {
  if (!config || typeof config !== "object") return null;
  const conf = config as Record<string, unknown>;
  const connectColumnId = typeof conf.connectColumnId === "string" ? conf.connectColumnId : null;
  const targetColumnId = typeof conf.targetColumnId === "string" ? conf.targetColumnId : null;
  if (!connectColumnId || !targetColumnId) return null;

  const links = await prisma.connectColumn.findMany({
    where: { sourceItemId: itemId, columnId: connectColumnId },
    include: {
      targetItem: {
        select: {
          id: true,
          name: true,
          boardId: true,
          board: { select: { name: true } },
          columnValues: {
            where: { columnId: targetColumnId },
            select: { value: true },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const values = links.map((entry) => ({
    itemId: entry.targetItem.id,
    itemName: entry.targetItem.name,
    boardId: entry.targetItem.boardId,
    boardName: entry.targetItem.board.name,
    value: entry.targetItem.columnValues[0]?.value ?? null,
  }));

  if (values.length === 1) {
    return values[0];
  }
  return values;
}

export async function computeRollupValue(itemId: string, config: unknown): Promise<unknown> {
  if (!config || typeof config !== "object") return null;
  const conf = config as Record<string, unknown>;
  const connectColumnId = typeof conf.connectColumnId === "string" ? conf.connectColumnId : null;
  const targetColumnId = typeof conf.targetColumnId === "string" ? conf.targetColumnId : null;
  const operation = typeof conf.operation === "string" ? conf.operation.toUpperCase() : "COUNT";
  if (!connectColumnId) return null;

  const links = await prisma.connectColumn.findMany({
    where: { sourceItemId: itemId, columnId: connectColumnId },
    include: targetColumnId
      ? {
          targetItem: {
            select: {
              columnValues: {
                where: { columnId: targetColumnId },
                select: { value: true },
              },
            },
          },
        }
      : undefined,
  });

  const total = links.length;
  if (operation === "COUNT") return { operation, value: total, count: total };

  const numbers = links
 .map((entry) => 0) // TODO: fetch target item column values via separate query
    .filter((entry): entry is number => entry != null);

  if (!numbers.length) return { operation, value: null, count: total };

  if (operation === "SUM") return { operation, value: numbers.reduce((acc, curr) => acc + curr, 0), count: total };
  if (operation === "AVG") return { operation, value: numbers.reduce((acc, curr) => acc + curr, 0) / numbers.length, count: total };
  if (operation === "MIN") return { operation, value: Math.min(...numbers), count: total };
  if (operation === "MAX") return { operation, value: Math.max(...numbers), count: total };

  return { operation: "COUNT", value: total, count: total };
}

export async function recomputeDerivedColumnsForItem(itemId: string) {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: {
      board: {
        include: {
          columns: {
            where: {
              columnType: { in: ["MIRROR", "ROLLUP"] },
            },
          },
        },
      },
    },
  });
  if (!item) return;

  for (const column of item.board.columns) {
    if (column.columnType === "MIRROR") {
      const value = await computeMirrorValue(item.id, column.config);
      await upsertColumnValue(item.id, column.id, value);
      continue;
    }
    if (column.columnType === "ROLLUP") {
      const value = await computeRollupValue(item.id, column.config);
      await upsertColumnValue(item.id, column.id, value);
    }
  }
}

export async function recomputeDerivedColumnsForTargetItem(targetItemId: string) {
  const links = await prisma.connectColumn.findMany({
    where: { targetItemId },
    select: { sourceItemId: true },
  });
  const sourceItemIds = Array.from(new Set(links.map((entry) => entry.sourceItemId)));
  for (const sourceItemId of sourceItemIds) {
    await recomputeDerivedColumnsForItem(sourceItemId);
  }
}
