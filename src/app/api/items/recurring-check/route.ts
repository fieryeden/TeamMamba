import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";

function nextOccurrence(date: Date, recurrenceRule: string) {
  const next = new Date(date);
  if (recurrenceRule === "DAILY") {
    next.setDate(next.getDate() + 1);
  } else if (recurrenceRule === "WEEKLY") {
    next.setDate(next.getDate() + 7);
  } else {
    next.setMonth(next.getMonth() + 1);
  }
  return next;
}

export async function POST() {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const now = new Date();

    const recurringItems = await prisma.item.findMany({
      where: { recurrenceRule: { in: ["DAILY", "WEEKLY", "MONTHLY"] } },
      include: {
        assignees: { select: { userId: true } },
        columnValues: { include: { column: true } },
      },
      orderBy: { updatedAt: "asc" },
    });

    let createdCount = 0;
    const createdItemIds: string[] = [];

    for (const item of recurringItems) {
      const recurrenceRule = item.recurrenceRule ?? "";
      const dueValue = item.columnValues.find((value) => value.column.columnType === "DATE" && typeof value.value === "string");
      if (!dueValue || typeof dueValue.value !== "string") continue;

      const dueDate = new Date(dueValue.value);
      if (Number.isNaN(dueDate.getTime()) || dueDate > now) continue;

      const nextDueDate = nextOccurrence(dueDate, recurrenceRule);
      const maxPos = await prisma.item.findFirst({
        where: { groupId: item.groupId },
        orderBy: { position: "desc" },
        select: { position: true },
      });

      await prisma.$transaction(async (tx) => {
        const clone = await tx.item.create({
          data: {
            boardId: item.boardId,
            groupId: item.groupId,
            name: item.name,
            recurrenceRule: null,
            color: item.color,
            icon: item.icon,
            position: (maxPos?.position ?? -1) + 1,
          },
        });

        if (item.assignees.length > 0) {
          await tx.itemAssignee.createMany({
            data: item.assignees.map((assignee) => ({
              itemId: clone.id,
              userId: assignee.userId,
            })),
          });
        }

        await tx.columnValue.createMany({
          data: item.columnValues.map((value) => ({
            itemId: clone.id,
            columnId: value.columnId,
            value: value.value as any,
          })),
        });

        await tx.columnValue.update({
          where: { id: dueValue.id },
          data: { value: nextDueDate.toISOString().slice(0, 10) },
        });

        createdItemIds.push(clone.id);
        createdCount += 1;
      });
    }

    return NextResponse.json({ success: true, createdCount, createdItemIds });
  } catch (err) {
    console.error("Recurring check error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET() {
  return POST();
}
