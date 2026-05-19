import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";

function normalizeHeader(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

function isEmptyCell(value: unknown) {
  return value == null || (typeof value === "string" && value.trim() === "");
}

function parseCellValue(columnType: string, value: string): unknown {
  const raw = value.trim();
  if (!raw) return null;

  if (columnType === "NUMBER" || columnType === "PROGRESS" || columnType === "RATING") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : raw;
  }

  if (columnType === "CHECKBOX") {
    return ["1", "true", "yes", "y", "checked"].includes(raw.toLowerCase());
  }

  if (columnType === "DATE") {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }

  if (columnType === "TAGS") {
    return raw
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return raw;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get("file");
    const boardId = formData.get("boardId");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    if (typeof boardId !== "string" || !boardId) {
      return NextResponse.json({ error: "boardId is required" }, { status: 400 });
    }

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

    const csvText = await file.text();
    const parsed = Papa.parse<string[]>(csvText, {
      header: false,
      skipEmptyLines: false,
    });
    if (parsed.errors.length > 0) {
      return NextResponse.json({ error: parsed.errors[0]?.message ?? "CSV parsing failed" }, { status: 400 });
    }

    const rows = parsed.data.filter((row) => Array.isArray(row));
    if (!rows.length) {
      return NextResponse.json({
        rowsImported: 0,
        groupsCreated: [],
        columnsCreated: [],
        errors: ["No rows found in file"],
      });
    }

    const headerRow = rows[0]?.map((entry) => (entry ?? "").toString().trim()) ?? [];
    if (!headerRow.length || !headerRow.some((entry) => entry)) {
      return NextResponse.json({ error: "Missing header row" }, { status: 400 });
    }

    const headerMeta = headerRow.map((header, index) => ({
      header,
      index,
      normalized: normalizeHeader(header),
    }));
    const firstColumnIndex = headerMeta.findIndex((entry) => entry.normalized.length > 0);
    if (firstColumnIndex < 0) {
      return NextResponse.json({ error: "Could not detect item name column" }, { status: 400 });
    }

    const normalizedColumns = board.columns.map((column) => ({
      id: column.id,
      columnType: column.columnType,
      normalized: normalizeHeader(column.title),
    }));
    const columnMap = new Map<number, { id: string; columnType: string }>();
    const createdColumns: Array<{ id: string; title: string }> = [];
    let nextOrder = board.columns.length;

    for (const meta of headerMeta) {
      if (!meta.header || meta.index === firstColumnIndex) continue;
      const existing = normalizedColumns.find((column) => column.normalized === meta.normalized);
      if (existing) {
        columnMap.set(meta.index, { id: existing.id, columnType: existing.columnType });
        continue;
      }
      const created = await prisma.boardColumn.create({
        data: {
          boardId,
          title: meta.header,
          columnType: "TEXT",
          order: nextOrder,
        },
      });
      nextOrder += 1;
      normalizedColumns.push({
        id: created.id,
        columnType: created.columnType,
        normalized: normalizeHeader(created.title),
      });
      columnMap.set(meta.index, { id: created.id, columnType: created.columnType });
      createdColumns.push({ id: created.id, title: created.title });
    }

    const groupByLowerName = new Map(board.groups.map((group) => [group.name.toLowerCase(), group]));
    const createdGroups: Array<{ id: string; name: string }> = [];
    let nextGroupPosition = board.groups.length;
    let currentGroupId = board.groups[0]?.id ?? null;

    if (!currentGroupId) {
      const fallbackGroup = await prisma.group.create({
        data: {
          boardId,
          name: "Imported Monday",
          color: "#579bfc",
          position: 0,
        },
      });
      currentGroupId = fallbackGroup.id;
      groupByLowerName.set(fallbackGroup.name.toLowerCase(), fallbackGroup);
      createdGroups.push({ id: fallbackGroup.id, name: fallbackGroup.name });
      nextGroupPosition = 1;
    }

    const maxPositions = await prisma.item.groupBy({
      by: ["groupId"],
      where: { boardId },
      _max: { position: true },
    });
    const nextPositionByGroupId = new Map<string, number>();
    for (const group of board.groups) {
      const max = maxPositions.find((entry) => entry.groupId === group.id)?._max.position ?? -1;
      nextPositionByGroupId.set(group.id, max + 1);
    }
    if (currentGroupId && !nextPositionByGroupId.has(currentGroupId)) {
      nextPositionByGroupId.set(currentGroupId, 0);
    }

    const errors: string[] = [];
    let rowsImported = 0;

    for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex] ?? [];
      const safeRow = headerMeta.map((meta) => (row[meta.index] ?? "").toString());
      const firstValue = safeRow[firstColumnIndex]?.trim() ?? "";
      const otherValues = safeRow.filter((_, index) => index !== firstColumnIndex);

      if (safeRow.every((value) => isEmptyCell(value))) continue;

      const isGroupRow = Boolean(firstValue) && otherValues.every((value) => isEmptyCell(value));
      if (isGroupRow) {
        const key = firstValue.toLowerCase();
        const existing = groupByLowerName.get(key);
        if (existing) {
          currentGroupId = existing.id;
          if (!nextPositionByGroupId.has(existing.id)) nextPositionByGroupId.set(existing.id, 0);
          continue;
        }

        const group = await prisma.group.create({
          data: {
            boardId,
            name: firstValue,
            color: "#579bfc",
            position: nextGroupPosition,
          },
        });
        nextGroupPosition += 1;
        currentGroupId = group.id;
        groupByLowerName.set(key, group);
        nextPositionByGroupId.set(group.id, 0);
        createdGroups.push({ id: group.id, name: group.name });
        continue;
      }

      if (!currentGroupId) {
        errors.push(`Row ${rowIndex + 1}: Missing group header before item row`);
        continue;
      }

      const itemName = firstValue || `Imported row ${rowIndex + 1}`;

      try {
        const nextPosition = nextPositionByGroupId.get(currentGroupId) ?? 0;
        const item = await prisma.item.create({
          data: {
            boardId,
            groupId: currentGroupId,
            name: itemName,
            position: nextPosition,
          },
        });
        nextPositionByGroupId.set(currentGroupId, nextPosition + 1);

        const values = headerMeta
          .filter((meta) => meta.index !== firstColumnIndex)
          .map((meta) => {
            const mapped = columnMap.get(meta.index);
            if (!mapped) return null;
            const parsedValue = parseCellValue(mapped.columnType, safeRow[meta.index] ?? "");
            if (parsedValue == null) return null;
            return {
              itemId: item.id,
              columnId: mapped.id,
              value: JSON.parse(JSON.stringify(parsedValue)) as any,
            };
          })
          .filter((entry): entry is { itemId: string; columnId: string; value: unknown } => Boolean(entry));

        if (values.length > 0) {
          await prisma.columnValue.createMany({ data: values as any[] });
        }

        rowsImported += 1;
      } catch (err) {
        errors.push(`Row ${rowIndex + 1}: ${err instanceof Error ? err.message : "Import failed"}`);
      }
    }

    return NextResponse.json({
      rowsImported,
      groupsCreated: createdGroups,
      columnsCreated: createdColumns,
      errors,
    });
  } catch (err) {
    console.error("Import Monday CSV error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
