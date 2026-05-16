import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/mailer";

type AutomationEvent =
  | "STATUS_CHANGED"
  | "DATE_ARRIVES"
  | "ITEM_CREATED"
  | "ITEM_MOVED_TO_GROUP"
  | "PRIORITY_CHANGED"
  | "ASSIGNEE_CHANGED"
  | "COLUMN_VALUE_CHANGED"
  | "RECURRING_SCHEDULE";

type ItemShape = {
  id: string;
  boardId?: string;
  groupId?: string;
  name?: string;
  columnValues?: Array<{ columnId: string; value: unknown }>;
  assignees?: Array<{ userId: string }>;
  [key: string]: unknown;
};

function getByPath(source: unknown, path: string): unknown {
  if (!source || typeof source !== "object") return undefined;
  const parts = path.split(".").filter(Boolean);
  let current: unknown = source;
  for (const part of parts) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function valuesEqual(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(actual)) {
    if (Array.isArray(expected)) {
      return expected.every((value) => actual.includes(value));
    }
    return actual.includes(expected);
  }
  if (typeof actual === "number" && typeof expected === "string" && expected.trim() !== "") {
    const maybeNum = Number(expected);
    if (!Number.isNaN(maybeNum)) return actual === maybeNum;
  }
  if (typeof expected === "number" && typeof actual === "string" && actual.trim() !== "") {
    const maybeNum = Number(actual);
    if (!Number.isNaN(maybeNum)) return expected === maybeNum;
  }
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function getConditionActualValue(item: ItemShape, key: string): unknown {
  if (key.startsWith("column.")) {
    const columnId = key.slice("column.".length);
    return item.columnValues?.find((entry) => entry.columnId === columnId)?.value;
  }
  if (key === "itemId") return item.id;
  if (key === "assigneeIds") return item.assignees?.map((entry) => entry.userId) ?? [];
  if (key.includes(".")) return getByPath(item, key);
  return item[key];
}

function matchesConditions(item: ItemShape, conditions: Record<string, unknown> | null | undefined): boolean {
  if (!conditions) return true;

  return Object.entries(conditions).every(([key, expected]) => {
    const actual = getConditionActualValue(item, key);

    if (expected && typeof expected === "object" && !Array.isArray(expected)) {
      const entry = expected as Record<string, unknown>;
      const operator = entry.operator;
      const value = entry.value;
      if (operator === "contains") {
        return String(actual ?? "").toLowerCase().includes(String(value ?? "").toLowerCase());
      }
      if (operator === "not_contains") {
        return !String(actual ?? "").toLowerCase().includes(String(value ?? "").toLowerCase());
      }
      if (operator === "is_not") {
        return !valuesEqual(actual, value);
      }
      if (operator === "gt") {
        return Number(actual) > Number(value);
      }
      if (operator === "lt") {
        return Number(actual) < Number(value);
      }
      return valuesEqual(actual, value);
    }

    return valuesEqual(actual, expected);
  });
}

async function upsertColumnValue(itemId: string, columnId: string, value: unknown) {
  const existing = await prisma.columnValue.findFirst({
    where: { itemId, columnId },
    select: { id: true },
  });

  const serialized = JSON.parse(JSON.stringify(value)) as any;

  if (existing) {
    await prisma.columnValue.update({
      where: { id: existing.id },
      data: { value: serialized },
    });
    return;
  }

  await prisma.columnValue.create({
    data: { itemId, columnId, value: serialized },
  });
}

function shiftDateValue(rawValue: unknown, days: number): unknown {
  if (typeof rawValue === "string") {
    const date = new Date(rawValue);
    if (Number.isNaN(date.getTime())) return rawValue;
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }

  if (rawValue && typeof rawValue === "object") {
    const value = rawValue as Record<string, unknown>;
    const current = typeof value.date === "string" ? value.date : typeof value.start === "string" ? value.start : null;
    if (!current) return rawValue;
    const date = new Date(current);
    if (Number.isNaN(date.getTime())) return rawValue;
    date.setDate(date.getDate() + days);
    const next = date.toISOString().slice(0, 10);
    if (value.date) return { ...value, date: next };
    if (value.start) return { ...value, start: next };
  }

  return rawValue;
}

async function executeAction(automation: {
  id: string;
  name: string;
  action: string;
  actionConfig: unknown;
}, item: {
  id: string;
  boardId: string;
  groupId: string;
  name: string;
  assignees: Array<{ userId: string }>;
  columnValues: Array<{ id: string; columnId: string; value: unknown }>;
}) {
  const config = (automation.actionConfig as Record<string, unknown> | null) ?? {};

  switch (automation.action) {
    case "CHANGE_STATUS": {
      const targetColumnId = typeof config.targetColumnId === "string" ? config.targetColumnId : typeof config.columnId === "string" ? config.columnId : null;
      if (!targetColumnId) return;
      const targetValue = config.targetValue ?? config.value ?? config.status;
      if (targetValue === undefined) return;
      await upsertColumnValue(item.id, targetColumnId, targetValue);
      return;
    }

    case "MOVE_ITEM_TO_GROUP": {
      const targetGroupId = typeof config.targetGroupId === "string" ? config.targetGroupId : typeof config.groupId === "string" ? config.groupId : null;
      if (!targetGroupId || targetGroupId === item.groupId) return;

      const last = await prisma.item.findFirst({
        where: { groupId: targetGroupId },
        orderBy: { position: "desc" },
        select: { position: true },
      });

      await prisma.item.update({
        where: { id: item.id },
        data: {
          groupId: targetGroupId,
          position: (last?.position ?? -1) + 1,
        },
      });
      return;
    }

    case "NOTIFY_ASSIGNEE": {
      if (!item.assignees.length) return;
      await prisma.notification.createMany({
        data: item.assignees.map((assignee) => ({
          userId: assignee.userId,
          type: "AUTOMATION",
          title: typeof config.title === "string" ? config.title : `Automation: ${automation.name}`,
          body: typeof config.body === "string" ? config.body : `Item "${item.name}" was updated by an automation.`,
          actionUrl: `/board/${item.boardId}`,
        })),
      });
      return;
    }

    case "NOTIFY_USER": {
      const userId = typeof config.userId === "string" ? config.userId : null;
      if (!userId) return;
      await prisma.notification.create({
        data: {
          userId,
          type: "AUTOMATION",
          title: typeof config.title === "string" ? config.title : `Automation: ${automation.name}`,
          body: typeof config.body === "string" ? config.body : `Item "${item.name}" triggered an automation.`,
          actionUrl: typeof config.actionUrl === "string" ? config.actionUrl : `/board/${item.boardId}`,
        },
      });
      return;
    }

    case "SET_COLUMN_VALUE": {
      const columnId = typeof config.columnId === "string" ? config.columnId : null;
      if (!columnId) return;
      if (!Object.prototype.hasOwnProperty.call(config, "value")) return;
      await upsertColumnValue(item.id, columnId, config.value);
      return;
    }

    case "CREATE_ITEM": {
      const groupId = typeof config.groupId === "string" ? config.groupId : item.groupId;
      const maxPos = await prisma.item.findFirst({
        where: { groupId },
        orderBy: { position: "desc" },
        select: { position: true },
      });
      const name = typeof config.itemName === "string" && config.itemName.trim().length > 0
        ? config.itemName.trim()
        : `${item.name} follow-up`;
      await prisma.item.create({
        data: {
          boardId: item.boardId,
          groupId,
          name,
          position: (maxPos?.position ?? -1) + 1,
        },
      });
      return;
    }

    case "SEND_EMAIL": {
      const to = typeof config.to === "string" ? config.to : null;
      if (!to) return;
      await sendEmail({
        to,
        subject: typeof config.subject === "string" ? config.subject : `Automation: ${automation.name}`,
        text: typeof config.body === "string" ? config.body : `Item "${item.name}" triggered an automation.`,
      });
      return;
    }

    case "ASSIGN_USER": {
      const userIds = Array.isArray(config.userIds)
        ? config.userIds.filter((value): value is string => typeof value === "string")
        : typeof config.userId === "string"
          ? [config.userId]
          : [];
      if (!userIds.length) return;
      await prisma.itemAssignee.createMany({
        data: userIds.map((userId) => ({ itemId: item.id, userId })),
        skipDuplicates: true,
      });
      return;
    }

    case "SHIFT_DATE": {
      const columnId = typeof config.columnId === "string" ? config.columnId : null;
      if (!columnId) return;
      const days = Number(config.days ?? 0);
      if (!Number.isFinite(days) || days === 0) return;
      const existingValue = item.columnValues.find((entry) => entry.columnId === columnId)?.value;
      if (existingValue == null) return;
      await upsertColumnValue(item.id, columnId, shiftDateValue(existingValue, days));
      return;
    }

    default:
      return;
  }
}

export async function processAutomation(boardId: string, event: AutomationEvent, item: ItemShape): Promise<void> {
  if (!boardId || !item.id) return;

  const automations = await prisma.automation.findMany({
    where: {
      boardId,
      isEnabled: true,
      trigger: event,
    },
    orderBy: { createdAt: "asc" },
  });

  if (!automations.length) return;

  const dbItem = await prisma.item.findUnique({
    where: { id: item.id },
    include: {
      assignees: { select: { userId: true } },
      columnValues: { select: { id: true, columnId: true, value: true } },
    },
  });

  if (!dbItem) return;

  const contextItem: ItemShape = {
    ...dbItem,
    ...item,
    id: dbItem.id,
    boardId: dbItem.boardId,
    groupId: dbItem.groupId,
    name: dbItem.name,
    assignees: dbItem.assignees,
    columnValues: dbItem.columnValues,
  };

  for (const automation of automations) {
    const conditions = (automation.conditions as Record<string, unknown> | null) ?? null;
    if (!matchesConditions(contextItem, conditions)) continue;

    await executeAction(automation, {
      id: dbItem.id,
      boardId: dbItem.boardId,
      groupId: dbItem.groupId,
      name: dbItem.name,
      assignees: dbItem.assignees,
      columnValues: dbItem.columnValues,
    });

    await prisma.automation.update({
      where: { id: automation.id },
      data: { lastFiredAt: new Date() },
    });

    await prisma.activity.create({
      data: {
        boardId,
        itemId: dbItem.id,
        userId: automation.userId,
        action: "AUTOMATION_TRIGGERED",
        details: {
          automationId: automation.id,
          automationName: automation.name,
          trigger: event,
          action: automation.action,
        } as any,
      },
    });
  }
}
