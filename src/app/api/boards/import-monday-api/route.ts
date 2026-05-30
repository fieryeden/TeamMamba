import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";

const MONDAY_API_URL = "https://api.monday.com/v2";

interface MondayBoard {
  id: string;
  name: string;
  columns: Array<{
    id: string;
    title: string;
    type: string;
    settings_str?: string;
  }>;
  groups: Array<{
    id: string;
    title: string;
    color?: string;
    position?: number;
  }>;
}

interface MondayItem {
  id: string;
  name: string;
  group: { id: string };
  column_values: Array<{
    id: string;
    text: string;
    value: string | null;
  }>;
}

async function mondayFetch(token: string, query: string, variables?: Record<string, unknown>) {
  const res = await fetch(MONDAY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Monday API error ${res.status}: ${text}`);
  }
  const json = await res.json();
  if (json.errors) {
    throw new Error(`Monday API errors: ${json.errors.map((e: any) => e.message).join("; ")}`);
  }
  return json.data;
}

function mondayColumnTypeToPrisma(mondayType: string): "TEXT" | "NUMBER" | "CHECKBOX" | "DATE" | "STATUS" | "LONG_TEXT" | "PROGRESS" | "RATING" {
  switch (mondayType) {
    case "numeric":
    case "rating":
      return "NUMBER";
    case "checkbox":
      return "CHECKBOX";
    case "date":
      return "DATE";
    case "status":
      return "STATUS";
    case "long-text":
    case "text":
    default:
      return "TEXT";
  }
}

function parseMondayColumnValue(columnType: string, text: string, rawValue: string | null): unknown {
  if (!text && !rawValue) return null;
  const raw = (text ?? "").trim();
  if (!raw) return null;

  switch (columnType) {
    case "NUMBER":
    case "PROGRESS":
    case "RATING": {
      const num = Number(raw);
      return Number.isFinite(num) ? num : raw;
    }
    case "CHECKBOX":
      return raw === "true" || raw === "1" || raw.toLowerCase() === "yes";
    case "DATE":
      try {
        const d = new Date(raw);
        if (!isNaN(d.getTime())) return d.toISOString();
      } catch {}
      return raw;
    case "STATUS":
      return raw;
    default:
      return raw;
  }
}

async function fetchMondayBoards(token: string): Promise<MondayBoard[]> {
  const query = `
    query {
      boards(limit: 50) {
        id
        name
        columns { id title type settings_str }
        groups { id title color position }
      }
    }
  `;
  const data = await mondayFetch(token, query);
  return data.boards || [];
}

async function fetchMondayItems(token: string, boardIds: string[]): Promise<Record<string, MondayItem[]>> {
  const query = `
    query GetBoards($boardIds: [ID!]!) {
      boards(ids: $boardIds) {
        id
        items(limit: 200) {
          id
          name
          group { id }
          column_values { id text value }
        }
      }
    }
  `;
  const data = await mondayFetch(token, query, { boardIds });
  const result: Record<string, MondayItem[]> = {};
  for (const board of data.boards || []) {
    result[board.id] = board.items || [];
  }
  return result;
}

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "token is required" }, { status: 400 });

  try {
    const boards = await fetchMondayBoards(token);
    return NextResponse.json({ boards });
  } catch (err) {
    console.error("Monday.com API fetch error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to fetch Monday boards" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { token, mondayBoardIds, boardId } = body as {
      token?: string;
      mondayBoardIds?: string[];
      boardId?: string;
    };

    if (!token) return NextResponse.json({ error: "token is required" }, { status: 400 });
    if (!mondayBoardIds || !Array.isArray(mondayBoardIds) || mondayBoardIds.length === 0) {
      return NextResponse.json({ error: "mondayBoardIds is required" }, { status: 400 });
    }
    if (!boardId) return NextResponse.json({ error: "boardId is required" }, { status: 400 });

    // Verify board membership
    const membership = await prisma.boardMember.findFirst({
      where: { boardId, userId: user.id },
      select: { id: true },
    });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const board = await prisma.board.findUnique({
      where: { id: boardId },
      include: {
        columns: { orderBy: { order: "asc" } },
        groups: { orderBy: { position: "asc" } },
      },
    });
    if (!board) return NextResponse.json({ error: "Board not found" }, { status: 404 });

    // Fetch boards metadata to get column info
    const mondayBoards = await fetchMondayBoards(token);
    const selectedBoards = mondayBoards.filter(b => mondayBoardIds.includes(b.id));

    // Fetch items from Monday
    const mondayItemsByBoard = await fetchMondayItems(token, mondayBoardIds);

    // Import columns that don't exist yet
    type ColInfo = { id: string; columnType: string };
    const existingColumns = new Map<string, ColInfo>(board.columns.map(c => [normalizeHeader(c.title), { id: c.id, columnType: c.columnType as string }]));
    const createdColumns: Array<{ id: string; title: string }> = [];
    let nextOrder = board.columns.length;

    for (const mb of selectedBoards) {
      for (const mc of mb.columns) {
        const key = normalizeHeader(mc.title);
        if (existingColumns.has(key)) continue;
        const created = await prisma.boardColumn.create({
          data: {
            boardId,
            title: mc.title,
            columnType: mondayColumnTypeToPrisma(mc.type),
            order: nextOrder,
          },
        });
        nextOrder++;
        existingColumns.set(key, { id: created.id, columnType: created.columnType });
        createdColumns.push({ id: created.id, title: created.title });
      }
    }

    // Build updated column map after creating new ones
    const allColumns = await prisma.boardColumn.findMany({
      where: { boardId },
      orderBy: { order: "asc" },
    });
    const columnMap = new Map<string, ColInfo>();
    for (const col of allColumns) {
      columnMap.set(normalizeHeader(col.title), { id: col.id, columnType: col.columnType as string });
    }

    // Also map by Monday column ID
    const mondayColToPrisma = new Map<string, ColInfo>();
    for (const mb of selectedBoards) {
      for (const mc of mb.columns) {
        const prismaCol = columnMap.get(normalizeHeader(mc.title));
        if (prismaCol) {
          mondayColToPrisma.set(mc.id, prismaCol);
        }
      }
    }

    // Import groups
    const existingGroups = new Map(board.groups.map(g => [g.name.toLowerCase(), g]));
    const createdGroups: Array<{ id: string; name: string }> = [];
    let nextGroupPos = board.groups.length;
    const mondayGroupToPrisma = new Map<string, string>();
    let fallbackGroupId = board.groups[0]?.id ?? null;

    // If no groups exist, create one
    if (!fallbackGroupId) {
      const fg = await prisma.group.create({
        data: { boardId, name: "Imported Monday", color: "#579bfc", position: 0 },
      });
      fallbackGroupId = fg.id;
      existingGroups.set(fg.name.toLowerCase(), fg);
      createdGroups.push({ id: fg.id, name: fg.name });
      nextGroupPos = 1;
    }

    for (const mb of selectedBoards) {
      for (const mg of mb.groups) {
        const key = mg.title.toLowerCase();
        if (existingGroups.has(key)) {
          mondayGroupToPrisma.set(mg.id, existingGroups.get(key)!.id);
          continue;
        }
        const group = await prisma.group.create({
          data: {
            boardId,
            name: mg.title,
            color: mg.color || "#579bfc",
            position: nextGroupPos,
          },
        });
        nextGroupPos++;
        mondayGroupToPrisma.set(mg.id, group.id);
        existingGroups.set(key, group);
        createdGroups.push({ id: group.id, name: group.name });
      }
    }

    // Import items
    const maxPositions = await prisma.item.groupBy({
      by: ["groupId"],
      where: { boardId },
      _max: { position: true },
    });
    const nextPositionByGroupId = new Map<string, number>();
    for (const group of board.groups) {
      const max = maxPositions.find(entry => entry.groupId === group.id)?._max.position ?? -1;
      nextPositionByGroupId.set(group.id, max + 1);
    }
    for (const g of createdGroups) {
      if (!nextPositionByGroupId.has(g.id)) {
        nextPositionByGroupId.set(g.id, 0);
      }
    }

    const errors: string[] = [];
    let rowsImported = 0;

    for (const mb of selectedBoards) {
      const mondayItems = mondayItemsByBoard[mb.id] || [];
      for (const mi of mondayItems) {
        const prismaGroupId = mondayGroupToPrisma.get(mi.group.id) || fallbackGroupId;
        if (!prismaGroupId) {
          errors.push(`Item "${mi.name}": no group available`);
          continue;
        }

        try {
          const nextPos = nextPositionByGroupId.get(prismaGroupId) ?? 0;
          const item = await prisma.item.create({
            data: {
              boardId,
              groupId: prismaGroupId,
              name: mi.name || "Untitled",
              position: nextPos,
            },
          });
          nextPositionByGroupId.set(prismaGroupId, nextPos + 1);

          // Import column values
          const values: Array<{ itemId: string; columnId: string; value: unknown }> = [];
          for (const cv of mi.column_values) {
            const prismaCol = mondayColToPrisma.get(cv.id);
            if (!prismaCol) continue;
            const parsed = parseMondayColumnValue(prismaCol.columnType, cv.text, cv.value);
            if (parsed == null) continue;
            values.push({ itemId: item.id, columnId: prismaCol.id, value: parsed });
          }

          if (values.length > 0) {
            await prisma.columnValue.createMany({ data: values as any[] });
          }

          rowsImported++;
        } catch (err) {
          errors.push(`Item "${mi.name}": ${err instanceof Error ? err.message : "Import failed"}`);
        }
      }
    }

    return NextResponse.json({
      rowsImported,
      groupsCreated: createdGroups,
      columnsCreated: createdColumns,
      errors,
    });
  } catch (err) {
    console.error("Monday.com API import error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Internal server error" }, { status: 500 });
  }
}

function normalizeHeader(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}
