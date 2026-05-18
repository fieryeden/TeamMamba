import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";
import { updateColumnValueSchema } from "@/lib/validations";
import { evaluateFormulaExpression } from "@/lib/formulas";
import { sendEmail } from "@/lib/mailer";
import { broadcastToBoard } from "@/lib/socket";
import { processAutomation } from "@/lib/automation-engine";
import { recomputeDerivedColumnsForTargetItem } from "@/lib/connect-columns";
import { canEditColumn } from "@/lib/column-permissions";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json();
    const { value } = updateColumnValueSchema.parse(body);

    const columnValue = await prisma.columnValue.update({
      where: { id },
      data: { value: JSON.parse(JSON.stringify(value)) as any },
      include: { column: true },
    });

    // Check automations
    const item = await prisma.columnValue.findUnique({
      where: { id },
      select: { itemId: true },
    });

    if (item?.itemId) {
      const itemData = await prisma.item.findUnique({
        where: { id: item.itemId },
        include: {
          board: { include: { columns: { orderBy: { order: "asc" } } } },
          columnValues: { include: { column: true } },
          assignees: { include: { user: true } },
        },
      });

      if (itemData) {
        const formulaColumns = itemData.board.columns.filter((column) => column.columnType === "FORMULA");
        if (formulaColumns.length > 0) {
          const currentValueContext: Record<string, unknown> = {};
          for (const entry of itemData.columnValues) {
            currentValueContext[entry.column.id] = entry.value;
            currentValueContext[entry.column.title] = entry.value;
          }

          const boardItemsWithValues = await prisma.item.findMany({
            where: { boardId: itemData.boardId },
            orderBy: { createdAt: "asc" },
            include: {
              columnValues: { include: { column: { select: { id: true, title: true } } } },
            },
          });
          const boardValuesByKey: Record<string, unknown[]> = {};
          const boardItemValues: Array<Record<string, unknown>> = [];
          for (const boardItem of boardItemsWithValues) {
            const row: Record<string, unknown> = {};
            for (const entry of boardItem.columnValues) {
              if (!boardValuesByKey[entry.column.id]) boardValuesByKey[entry.column.id] = [];
              boardValuesByKey[entry.column.id].push(entry.value);
              if (!boardValuesByKey[entry.column.title]) boardValuesByKey[entry.column.title] = [];
              boardValuesByKey[entry.column.title].push(entry.value);
              row[entry.column.id] = entry.value;
              row[entry.column.title] = entry.value;
            }
            boardItemValues.push(row);
          }

          for (const formulaColumn of formulaColumns) {
            const formula = (formulaColumn.config as { formula?: string } | null)?.formula;
            if (!formula) continue;
            let computedValue: unknown = null;
            try {
              computedValue = evaluateFormulaExpression(formula, {
                currentItemValues: currentValueContext,
                boardColumnValues: boardValuesByKey,
                boardItemValues,
              });
            } catch {
              computedValue = null;
            }

            const existing = itemData.columnValues.find((entry) => entry.columnId === formulaColumn.id);
            if (existing) {
              await prisma.columnValue.update({
                where: { id: existing.id },
                data: { value: JSON.parse(JSON.stringify(computedValue)) as any },
              });
            } else {
              await prisma.columnValue.create({
                data: {
                  itemId: itemData.id,
                  columnId: formulaColumn.id,
                  value: JSON.parse(JSON.stringify(computedValue)) as any,
                },
              });
            }
            currentValueContext[formulaColumn.id] = computedValue;
            currentValueContext[formulaColumn.title] = computedValue;
            if (!boardValuesByKey[formulaColumn.id]) boardValuesByKey[formulaColumn.id] = [];
            boardValuesByKey[formulaColumn.id].push(computedValue);
            if (!boardValuesByKey[formulaColumn.title]) boardValuesByKey[formulaColumn.title] = [];
            boardValuesByKey[formulaColumn.title].push(computedValue);
          }
        }

        // Log activity
        await prisma.activity.create({
          data: {
            boardId: itemData.boardId,
            itemId: item.itemId,
            userId: user.id,
            action: "COLUMN_VALUE_CHANGED",
            details: JSON.parse(JSON.stringify({ columnId: columnValue.columnId, columnTitle: columnValue.column.title })),
          },
        });

        await processAutomation(itemData.boardId, "COLUMN_VALUE_CHANGED", {
          id: itemData.id,
          boardId: itemData.boardId,
          groupId: itemData.groupId,
          name: itemData.name,
          triggeredColumnId: columnValue.columnId,
          triggeredColumnType: columnValue.column.columnType,
          triggeredByUserId: user.id,
          newValue: value,
        });

        if (columnValue.column.columnType === "STATUS") {
          await processAutomation(itemData.boardId, "STATUS_CHANGED", {
            id: itemData.id,
            boardId: itemData.boardId,
            groupId: itemData.groupId,
            name: itemData.name,
            triggeredColumnId: columnValue.columnId,
            triggeredByUserId: user.id,
            newValue: value,
          });
        }

        if (columnValue.column.columnType === "PEOPLE") {
          await processAutomation(itemData.boardId, "ASSIGNEE_CHANGED", {
            id: itemData.id,
            boardId: itemData.boardId,
            groupId: itemData.groupId,
            name: itemData.name,
            triggeredColumnId: columnValue.columnId,
            triggeredByUserId: user.id,
            newValue: value,
          });
        }

        if (columnValue.column.title.toLowerCase().includes("priority")) {
          await processAutomation(itemData.boardId, "PRIORITY_CHANGED", {
            id: itemData.id,
            boardId: itemData.boardId,
            groupId: itemData.groupId,
            name: itemData.name,
            triggeredColumnId: columnValue.columnId,
            triggeredByUserId: user.id,
            newValue: value,
          });
        }

        await processAutomation(itemData.boardId, "ITEM_UPDATED", {
          id: itemData.id,
          boardId: itemData.boardId,
          groupId: itemData.groupId,
          name: itemData.name,
          triggeredColumnId: columnValue.columnId,
          triggeredColumnType: columnValue.column.columnType,
          triggeredByUserId: user.id,
          newValue: value,
        });

        await processAutomation(itemData.boardId, "COLUMN_CHANGED", {
          id: itemData.id,
          boardId: itemData.boardId,
          groupId: itemData.groupId,
          name: itemData.name,
          triggeredColumnId: columnValue.columnId,
          triggeredColumnType: columnValue.column.columnType,
          triggeredByUserId: user.id,
          newValue: value,
        });

        if (columnValue.column.columnType === "PEOPLE") {
          const userIds = Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : [];
          if (userIds.length > 0) {
            const recipients = await prisma.user.findMany({
              where: {
                id: { in: userIds as string[] },
                emailNotificationsEnabled: true,
                emailOnAssignments: true,
              },
              select: { email: true },
            });
            await Promise.all(
              recipients.map((recipient) =>
                sendEmail({
                  to: recipient.email,
                  subject: `Assigned to item: ${itemData.name}`,
                  text: `You were assigned to "${itemData.name}" on board "${itemData.board.name}".`,
                })
              )
            );
          }
        }

        if (columnValue.column.columnType === "DATE" && value) {
          const recipients = itemData.assignees
            .map((assignee) => assignee.user)
            .filter((member) => member.emailNotificationsEnabled && member.emailOnDueDates);
          await Promise.all(
            recipients.map((recipient) =>
              sendEmail({
                to: recipient.email,
                subject: `Due date updated: ${itemData.name}`,
                text: `The due date for "${itemData.name}" is now ${String(value)}.`,
              })
            )
          );
        }

      broadcastToBoard(itemData.boardId, "column:updated", { boardId: itemData.boardId, columnValue });

      await recomputeDerivedColumnsForTargetItem(itemData.id);
      }
    }

      return NextResponse.json({ columnValue });
  } catch (err) {
    console.error("Update column value error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
