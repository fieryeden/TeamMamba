import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";
import Papa from "papaparse";
import * as XLSX from "xlsx";

function normalizeHeader(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array.from({ length: n + 1 }, () => 0));
  for (let i = 0; i <= m; i += 1) dp[i]![0] = i;
  for (let j = 0; j <= n; j += 1) dp[0]![j] = j;

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const del = (dp[i - 1]?.[j] ?? 0) + 1;
      const ins = (dp[i]?.[j - 1] ?? 0) + 1;
      const sub = (dp[i - 1]?.[j - 1] ?? 0) + cost;
      dp[i]![j] = Math.min(del, ins, sub);
    }
  }

  return dp[m]?.[n] ?? Math.max(m, n);
}

function isEmptyValue(value: unknown) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  return false;
}

function parseCellValue(columnType: string, value: unknown): unknown {
  if (isEmptyValue(value)) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  if (columnType === "NUMBER" || columnType === "PROGRESS" || columnType === "RATING") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (columnType === "CHECKBOX") {
    return ["1", "true", "yes", "y", "checked"].includes(raw.toLowerCase());
  }

  if (columnType === "DATE") {
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw;
    return parsed.toISOString().slice(0, 10);
  }

  if (columnType === "TAGS") {
    return raw
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return raw;
}

function parseRowsFromCsv(text: string): Record<string, unknown>[] {
  const result = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  if (result.errors.length > 0) {
    throw new Error(result.errors[0]?.message ?? "CSV parsing failed");
  }
  return result.data;
}

function parseRowsFromXlsx(buffer: ArrayBuffer): Record<string, unknown>[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const sheet = workbook.Sheets[firstSheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
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

    const name = file.name.toLowerCase();
    let rows: Record<string, unknown>[] = [];

    if (name.endsWith(".csv")) {
      rows = parseRowsFromCsv(await file.text());
    } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      rows = parseRowsFromXlsx(await file.arrayBuffer());
    } else {
      return NextResponse.json({ error: "Only CSV or XLSX files are supported" }, { status: 400 });
    }

    if (rows.length === 0) {
      return NextResponse.json({
        rowsImported: 0,
        columnsCreated: [],
        errors: ["No rows found in file"],
      });
    }

    const headers = Array.from(
      new Set(
        rows.flatMap((row) => Object.keys(row).map((key) => key.trim()).filter(Boolean))
      )
    );

    const columnMap = new Map<string, { id: string; title: string; columnType: string }>();
    const normalizedColumns = board.columns.map((column) => ({
      id: column.id,
      title: column.title,
      columnType: column.columnType,
      normalized: normalizeHeader(column.title),
    }));

    const createdColumns: Array<{ id: string; title: string }> = [];
    let nextColumnOrder = board.columns.length;

    for (const header of headers) {
      const normalizedHeader = normalizeHeader(header);
      const exact = normalizedColumns.find((column) => column.normalized === normalizedHeader);
      if (exact) {
        columnMap.set(header, { id: exact.id, title: exact.title, columnType: exact.columnType });
        continue;
      }

      let best: { id: string; title: string; columnType: string; score: number; length: number } | null = null;
      for (const column of normalizedColumns) {
        const score = levenshtein(normalizedHeader, column.normalized);
        const candidate = {
          id: column.id,
          title: column.title,
          columnType: column.columnType,
          score,
          length: Math.max(normalizedHeader.length, column.normalized.length),
        };
        if (!best || candidate.score < best.score) best = candidate;
      }

      if (best) {
        const threshold = Math.max(2, Math.round(best.length * 0.35));
        if (best.score <= threshold) {
          columnMap.set(header, { id: best.id, title: best.title, columnType: best.columnType });
          continue;
        }
      }

      const created = await prisma.boardColumn.create({
        data: {
          boardId,
          title: header,
          columnType: "TEXT",
          order: nextColumnOrder,
        },
      });
      nextColumnOrder += 1;
      normalizedColumns.push({
        id: created.id,
        title: created.title,
        columnType: created.columnType,
        normalized: normalizeHeader(created.title),
      });
      columnMap.set(header, { id: created.id, title: created.title, columnType: created.columnType });
      createdColumns.push({ id: created.id, title: created.title });
    }

    let targetGroupId = board.groups[0]?.id;
    if (!targetGroupId) {
      const group = await prisma.group.create({
        data: {
          boardId,
          name: "Imported",
          color: "#579bfc",
          position: 0,
        },
      });
      targetGroupId = group.id;
    }

    const existingCount = await prisma.item.count({ where: { groupId: targetGroupId } });
    const errors: string[] = [];
    let imported = 0;

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex] ?? {};
      try {
        const nameCell =
          (row["name"] as string | undefined) ??
          (row["Name"] as string | undefined) ??
          (row["item"] as string | undefined) ??
          (row["Item"] as string | undefined);
        const itemName = String(nameCell ?? `Imported row ${rowIndex + 1}`).trim() || `Imported row ${rowIndex + 1}`;

        const item = await prisma.item.create({
          data: {
            boardId,
            groupId: targetGroupId,
            name: itemName,
            position: existingCount + rowIndex,
          },
        });

        const valuesToCreate = Object.entries(row)
          .map(([header, rawValue]) => {
            const mapped = columnMap.get(header);
            if (!mapped) return null;
            const parsedValue = parseCellValue(mapped.columnType, rawValue);
            if (isEmptyValue(parsedValue)) return null;
            return {
              itemId: item.id,
              columnId: mapped.id,
              value: JSON.parse(JSON.stringify(parsedValue)) as any,
            };
          })
          .filter((entry): entry is { itemId: string; columnId: string; value: unknown } => Boolean(entry));

        if (valuesToCreate.length > 0) {
          await prisma.columnValue.createMany({ data: valuesToCreate as any[] });
        }

        imported += 1;
      } catch (err) {
        errors.push(`Row ${rowIndex + 1}: ${err instanceof Error ? err.message : "Import failed"}`);
      }
    }

    return NextResponse.json({
      rowsImported: imported,
      columnsCreated: createdColumns,
      errors,
    });
  } catch (err) {
    console.error("Import CSV/XLSX error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
