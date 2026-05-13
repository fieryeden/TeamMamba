import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";
import { updateColumnValueSchema } from "@/lib/validations";

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
        select: { boardId: true, groupId: true },
      });

      if (itemData) {
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
        }
      }
    }

    return NextResponse.json({ columnValue });
  } catch (err) {
    console.error("Update column value error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
