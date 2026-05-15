#!/usr/bin/env npx tsx
// @ts-nocheck
/**
 * TeamMamba Migration Tool — Import from monday.com CSV export
 *
 * Usage:
 *   npx tsx scripts/migrate-from-monday.ts --csv <path> --workspaceId <id> [--dryRun]
 *
 * monday.com CSV export format (per board):
 *   Name, Status, People, Date, Priority, Text, ...
 *
 * This script:
 * 1. Reads the CSV file
 * 2. Creates a board with matching columns
 * 3. Creates groups and items with column values
 * 4. Maps monday.com column types to TeamMamba types
 */

import { parse } from "csv-parse/sync";
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const COLUMN_TYPE_MAP: Record<string, string> = {
  status: "STATUS",
  people: "PEOPLE",
  person: "PEOPLE",
  date: "DATE",
  timeline: "DATE",
  priority: "STATUS",
  text: "TEXT",
  numbers: "NUMBER",
  number: "NUMBER",
  tags: "TAGS",
  tag: "TAGS",
  files: "FILE",
  file: "FILE",
  link: "LINK",
  email: "EMAIL",
  phone: "PHONE",
  checkbox: "CHECKBOX",
  timeline: "DATE",
  item_id: "TEXT",
  group: "TEXT",
  last_update: "DATE",
  created: "DATE",
};

function guessColumnType(header: string): string {
  const lower = header.toLowerCase().trim();
  for (const [key, type] of Object.entries(COLUMN_TYPE_MAP)) {
    if (lower.includes(key)) return type;
  }
  return "TEXT";
}

async function main() {
  const args = process.argv.slice(2);
  const csvPath = args[args.indexOf("--csv") + 1];
  const workspaceId = args[args.indexOf("--workspaceId") + 1];
  const dryRun = args.includes("--dryRun");
  const boardName = args[args.indexOf("--boardName") + 1] || "Imported from monday.com";

  if (!csvPath || !workspaceId) {
    console.error("Usage: npx tsx scripts/migrate-from-monday.ts --csv <path> --workspaceId <id> [--dryRun] [--boardName <name>]");
    process.exit(1);
  }

  if (!fs.existsSync(csvPath)) {
    console.error(`CSV file not found: ${csvPath}`);
    process.exit(1);
  }

  // Verify workspace exists
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) {
    console.error(`Workspace not found: ${workspaceId}`);
    process.exit(1);
  }

  // Read and parse CSV
  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const records: Record<string, string>[] = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  if (records.length === 0) {
    console.error("CSV file is empty");
    process.exit(1);
  }

  const headers = Object.keys(records[0]);
  console.log(`\n📋 Found ${records.length} rows with columns: ${headers.join(", ")}`);

  // Map columns — skip system columns
  const systemCols = new Set(["name", "item_id", "group", "last_update", "created"]);
  const columns = headers
    .filter((h) => !systemCols.has(h.toLowerCase()))
    .map((h, i) => ({
      title: h.trim(),
      columnType: guessColumnType(h),
      order: i,
    }));

  console.log(`📊 Mapped columns:`);
  columns.forEach((c) => console.log(`   ${c.title} → ${c.columnType}`));

  if (dryRun) {
    console.log(`\n🏃 Dry run — would create board "${boardName}" with ${columns.length} columns and ${records.length} items`);
    console.log("Remove --dryRun to actually import.");
    return;
  }

  // Create the board
  const board = await prisma.board.create({
    data: {
      workspaceId,
      name: boardName,
      icon: "📦",
      boardKind: "KANBAN",
      columns: {
        createMany: {
          data: columns.map((c) => ({
            title: c.title,
            columnType: c.columnType,
            order: c.order,
            config: c.columnType === "STATUS"
              ? { labels: ["Not Started", "Working on it", "Done", "Stuck"], colors: ["#c4c4c4", "#fdab3d", "#00c875", "#e2445c"] }
              : undefined,
          })),
        },
      },
      groups: {
        create: { name: "Imported Items", color: "#fdab3d", position: 0 },
      },
      members: {
        create: {
          userId: (await prisma.workspaceMember.findFirst({
            where: { workspaceId, role: "OWNER" },
            select: { userId: true },
          }))!.userId,
          role: "OWNER",
        },
      },
    },
    include: { columns: true, groups: true },
  });

  const group = board.groups[0];
  const colMap = new Map(board.columns.map((c) => [c.title.toLowerCase(), c]));

  console.log(`\n✅ Created board "${board.name}" (${board.id})`);

  // Import items
  let imported = 0;
  for (const record of records) {
    const itemName = record["Name"] || record["name"] || record["Item"] || `Item ${imported + 1}`;
    if (!itemName?.trim()) continue;

    const item = await prisma.item.create({
      data: {
        boardId: board.id,
        groupId: group.id,
        name: itemName.trim(),
        position: imported,
      },
    });

    // Create column values
    for (const [header, value] of Object.entries(record)) {
      if (!value?.trim() || systemCols.has(header.toLowerCase())) continue;

      const col = colMap.get(header.toLowerCase().trim());
      if (!col) continue;

      let parsedValue: unknown = value;
      if (col.columnType === "STATUS") {
        parsedValue = { label: value };
      } else if (col.columnType === "DATE") {
        parsedValue = { date: value };
      } else if (col.columnType === "PEOPLE") {
        parsedValue = { names: value.split(",").map((s) => s.trim()) };
      } else if (col.columnType === "NUMBER") {
        parsedValue = { number: parseFloat(value) || 0 };
      }

      await prisma.columnValue.create({
        data: {
          itemId: item.id,
          columnId: col.id,
          value: parsedValue as any,
        },
      });
    }

    imported++;
    if (imported % 50 === 0) {
      console.log(`   Imported ${imported}/${records.length} items...`);
    }
  }

  console.log(`\n🎉 Migration complete!`);
  console.log(`   Board: ${board.name} (${board.id})`);
  console.log(`   Items: ${imported}`);
  console.log(`   Columns: ${columns.length}`);
  console.log(`\n   Access at: /boards/${board.id}`);
}

main()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
