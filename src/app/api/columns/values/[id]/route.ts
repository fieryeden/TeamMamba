import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";
import { updateColumnValueSchema } from "@/lib/validations";
import { evaluateFormulaExpression } from "@/lib/formulas";
import { sendEmail } from "@/lib/mailer";

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
          const contextByTitle: Record<string, unknown> = Object.fromEntries(
            itemData.columnValues.map((entry) => [entry.column.title, entry.value])
          );

          for (const formulaColumn of formulaColumns) {
            const formula = (formulaColumn.config as { formula?: string } | null)?.formula;
            if (!formula) continue;
            let computedValue: unknown = null;
            try {
              computedValue = evaluateFormulaExpression(formula, contextByTitle);
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
            contextByTitle[formulaColumn.title] = computedValue;
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

        // Trigger automations
        const automations = await prisma.automation.findMany({
          where: { boardId: itemData.boardId, isEnabled: true, trigger: "STATUS_CHANGED" },
        });

        for (const auto of automations) {
          if (auto.action === "CHANGE_STATUS" && auto.actionConfig) {
            const config = auto.actionConfig as Record<string, unknown>;
            if (config.targetColumnId && config.targetValue !== undefined) {
              await prisma.columnValue.updateMany({
                where: { itemId: item.itemId, columnId: config.targetColumnId as string },
                data: { value: JSON.parse(JSON.stringify(config.targetValue)) as any },
              });
            }
          }

          if (auto.action === "SEND_EMAIL") {
            const config = (auto.actionConfig as Record<string, unknown> | null) ?? {};
            const to = typeof config.to === "string" ? config.to : user.email;
            const subject = typeof config.subject === "string" ? config.subject : `Automation: ${auto.name}`;
            const text = typeof config.body === "string" ? config.body : `Item "${itemData.name}" changed in ${itemData.board.name}.`;
            await sendEmail({ to, subject, text });
          }
        }

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
      }
    }

    return NextResponse.json({ columnValue });
  } catch (err) {
    console.error("Update column value error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
