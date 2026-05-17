import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/mailer";
import { runIntegration } from "@/lib/integration-runners";
import { Prisma } from "@prisma/client";

type AutomationEvent =
  | "ITEM_CREATED"
  | "ITEM_UPDATED"
  | "STATUS_CHANGED"
  | "DATE_ARRIVED"
  | "DATE_ARRIVES"
  | "COLUMN_CHANGED"
  | "COLUMN_VALUE_CHANGED"
  | "ITEM_MOVED_TO_GROUP"
  | "PRIORITY_CHANGED"
  | "ASSIGNEE_CHANGED"
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

type RuleCondition = {
  field: string;
  operator:
    | "field_equals"
    | "field_not_equals"
    | "field_contains"
    | "field_is_empty"
    | "field_greater_than"
    | "field_less_than";
  value?: unknown;
};

type RuleAction = {
  action:
    | "change_status"
    | "move_item_to_group"
    | "assign_user"
    | "send_notification"
    | "send_email"
    | "create_item"
    | "update_column"
    | "add_tag"
    | "trigger_integration";
  config?: Record<string, unknown>;
};

type AutomationExecutionItem = {
  id: string;
  boardId: string;
  groupId: string;
  name: string;
  assignees: Array<{ userId: string; firstName: string | null; lastName: string | null }>;
  columnValues: Array<{
    id: string;
    columnId: string;
    value: unknown;
    column: { title: string; columnType: string };
  }>;
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
    if (Array.isArray(expected)) return expected.every((value) => actual.includes(value));
    return actual.includes(expected);
  }
  if (typeof actual === "number" && typeof expected === "string") {
    const maybeNum = Number(expected);
    if (!Number.isNaN(maybeNum)) return actual === maybeNum;
  }
  if (typeof expected === "number" && typeof actual === "string") {
    const maybeNum = Number(actual);
    if (!Number.isNaN(maybeNum)) return expected === maybeNum;
  }
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function getConditionValue(item: ItemShape, key: string): unknown {
  if (key.startsWith("column.")) {
    const columnId = key.slice("column.".length);
    return item.columnValues?.find((entry) => entry.columnId === columnId)?.value;
  }
  if (key === "assigneeIds") return item.assignees?.map((entry) => entry.userId) ?? [];
  if (key.includes(".")) return getByPath(item, key);
  return item[key];
}

function evaluateRuleCondition(item: ItemShape, condition: RuleCondition): boolean {
  const actual = getConditionValue(item, condition.field);
  const expected = condition.value;
  switch (condition.operator) {
    case "field_equals":
      return valuesEqual(actual, expected);
    case "field_not_equals":
      return !valuesEqual(actual, expected);
    case "field_contains":
      return String(actual ?? "").toLowerCase().includes(String(expected ?? "").toLowerCase());
    case "field_is_empty":
      return actual == null || String(actual).trim() === "" || (Array.isArray(actual) && actual.length === 0);
    case "field_greater_than":
      return Number(actual) > Number(expected);
    case "field_less_than":
      return Number(actual) < Number(expected);
    default:
      return false;
  }
}

function toRuleConditions(raw: unknown): { logic: "AND" | "OR"; conditions: RuleCondition[] } {
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.conditions)) {
      const parsed: RuleCondition[] = obj.conditions
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const cond = entry as Record<string, unknown>;
          if (typeof cond.field !== "string" || typeof cond.operator !== "string") return null;
          return {
            field: cond.field,
            operator: cond.operator as RuleCondition["operator"],
            value: cond.value,
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry != null) as RuleCondition[];
      return {
        logic: obj.logic === "OR" ? "OR" : "AND",
        conditions: parsed,
      };
    }

    const legacyConditions: RuleCondition[] = Object.entries(obj).map(([key, value]) => {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const entry = value as Record<string, unknown>;
        const op = typeof entry.operator === "string" ? entry.operator : "field_equals";
        const normalizedOperator: RuleCondition["operator"] =
          op === "contains" || op === "field_contains"
            ? "field_contains"
            : op === "not_contains" || op === "field_not_equals" || op === "is_not"
              ? "field_not_equals"
              : op === "gt" || op === "field_greater_than"
                ? "field_greater_than"
                : op === "lt" || op === "field_less_than"
                  ? "field_less_than"
                  : op === "field_is_empty"
                    ? "field_is_empty"
                    : "field_equals";
        return { field: key, operator: normalizedOperator, value: entry.value };
      }
      return { field: key, operator: "field_equals", value };
    });
    return { logic: "AND", conditions: legacyConditions };
  }
  return { logic: "AND", conditions: [] };
}

function matchesConditions(item: ItemShape, rawConditions: unknown): boolean {
  const { logic, conditions } = toRuleConditions(rawConditions);
  if (!conditions.length) return true;
  if (logic === "OR") return conditions.some((condition) => evaluateRuleCondition(item, condition));
  return conditions.every((condition) => evaluateRuleCondition(item, condition));
}

async function upsertColumnValue(itemId: string, columnId: string, value: unknown) {
  const existing = await prisma.columnValue.findFirst({
    where: { itemId, columnId },
    select: { id: true },
  });
  const serialized = JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
  if (existing) {
    await prisma.columnValue.update({ where: { id: existing.id }, data: { value: serialized } });
    return;
  }
  await prisma.columnValue.create({ data: { itemId, columnId, value: serialized } });
}

function normalizeActionName(action: string): RuleAction["action"] | null {
  const value = action.toUpperCase();
  if (value === "CHANGE_STATUS") return "change_status";
  if (value === "MOVE_ITEM_TO_GROUP") return "move_item_to_group";
  if (value === "ASSIGN_USER") return "assign_user";
  if (value === "NOTIFY_ASSIGNEE" || value === "NOTIFY_USER" || value === "SEND_NOTIFICATION") return "send_notification";
  if (value === "SEND_EMAIL") return "send_email";
  if (value === "CREATE_ITEM") return "create_item";
  if (value === "SET_COLUMN_VALUE" || value === "UPDATE_COLUMN") return "update_column";
  if (value === "ADD_TAG") return "add_tag";
  if (value === "TRIGGER_INTEGRATION") return "trigger_integration";
  return null;
}

async function resolveIntegrationConfig(
  config: Record<string, unknown>,
  boardId: string,
  createdById: string
) {
  const integrationId = typeof config.integrationId === "string" ? config.integrationId : null;
  const integrationType = typeof config.integrationType === "string" ? config.integrationType : null;

  if (integrationId) {
    return prisma.integrationConfig.findFirst({
      where: {
        id: integrationId,
        enabled: true,
        createdById,
        OR: [{ boardId }, { boardId: null }],
      },
    });
  }

  if (integrationType) {
    return prisma.integrationConfig.findFirst({
      where: {
        type: integrationType,
        enabled: true,
        createdById,
        OR: [{ boardId }, { boardId: null }],
      },
      orderBy: { createdAt: "desc" },
    });
  }

  return null;
}

async function runAutomationIntegration(
  integration: { id: string; type: string; config: unknown; enabled: boolean; boardId: string | null },
  item: AutomationExecutionItem,
  config: Record<string, unknown>
) {
  let success = false;
  let result: unknown = null;

  try {
    const response = await runIntegration(
      {
        id: integration.id,
        type: integration.type,
        config: integration.config,
        enabled: integration.enabled,
        boardId: integration.boardId,
      },
      {
        action: "AUTOMATION",
        item: {
          id: item.id,
          boardId: item.boardId,
          name: item.name,
          columnValues: item.columnValues.map((entry) => ({
            columnId: entry.columnId,
            columnTitle: entry.column.title,
            columnType: entry.column.columnType,
            value: entry.value,
          })),
          assignees: item.assignees.map((entry) => ({
            userId: entry.userId,
            firstName: entry.firstName,
            lastName: entry.lastName,
          })),
        },
        itemUrl: `/board/${item.boardId}`,
        messageOverride: typeof config.body === "string" ? config.body : undefined,
      }
    );

    success = response.ok;
    result = response;
  } catch (err) {
    success = false;
    result = { error: err instanceof Error ? err.message : "Integration execution failed" };
  }

  await prisma.integrationLog.create({
    data: {
      integrationId: integration.id,
      action: "AUTOMATION",
      success,
      result: JSON.parse(JSON.stringify(result ?? null)),
    },
  });
}

function getActionsForAutomation(automation: {
  action: string;
  actionConfig: unknown;
}): RuleAction[] {
  const config = (automation.actionConfig as Record<string, unknown> | null) ?? {};
  if (Array.isArray(config.actions)) {
    const steps: RuleAction[] = config.actions
      .map((entry): RuleAction | null => {
        if (!entry || typeof entry !== "object") return null;
        const raw = entry as Record<string, unknown>;
        const normalized = typeof raw.action === "string" ? normalizeActionName(raw.action) : null;
        if (!normalized) return null;
        return {
          action: normalized,
          config: (raw.config && typeof raw.config === "object" ? raw.config : raw) as Record<string, unknown>,
        };
      })
      .filter((entry): entry is RuleAction => entry !== null);
    if (steps.length) return steps;
  }

  const normalizedAction = normalizeActionName(automation.action);
  if (!normalizedAction) return [];
  return [{ action: normalizedAction, config }];
}

async function executeRuleAction(
  automationName: string,
  automationUserId: string,
  action: RuleAction,
  item: AutomationExecutionItem
) {
  const config = action.config ?? {};

  switch (action.action) {
    case "change_status": {
      const targetColumnId = typeof config.targetColumnId === "string"
        ? config.targetColumnId
        : typeof config.columnId === "string"
          ? config.columnId
          : null;
      const targetValue = config.targetValue ?? config.value ?? config.status;
      if (!targetColumnId || targetValue === undefined) return;
      await upsertColumnValue(item.id, targetColumnId, targetValue);
      return;
    }

    case "move_item_to_group": {
      const targetGroupId = typeof config.targetGroupId === "string"
        ? config.targetGroupId
        : typeof config.groupId === "string"
          ? config.groupId
          : null;
      if (!targetGroupId || targetGroupId === item.groupId) return;
      const last = await prisma.item.findFirst({
        where: { groupId: targetGroupId },
        orderBy: { position: "desc" },
        select: { position: true },
      });
      await prisma.item.update({
        where: { id: item.id },
        data: { groupId: targetGroupId, position: (last?.position ?? -1) + 1 },
      });
      return;
    }

    case "assign_user": {
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

    case "send_notification": {
      const externalIntegration =
        (await resolveIntegrationConfig(config, item.boardId, automationUserId))
        ?? (await prisma.integrationConfig.findFirst({
          where: {
            createdById: automationUserId,
            enabled: true,
            type: { in: ["slack", "microsoft_teams"] },
            OR: [{ boardId: item.boardId }, { boardId: null }],
          },
          orderBy: { createdAt: "desc" },
        }));
      if (externalIntegration && (externalIntegration.type === "slack" || externalIntegration.type === "microsoft_teams")) {
        await runAutomationIntegration(externalIntegration, item, config);
        return;
      }

      const configuredUserIds = Array.isArray(config.userIds)
        ? config.userIds.filter((value): value is string => typeof value === "string")
        : typeof config.userId === "string"
          ? [config.userId]
          : [];
      const useAssignees = config.toAssignees === true || (!configuredUserIds.length && item.assignees.length > 0);
      const recipients = useAssignees ? item.assignees.map((entry) => entry.userId) : configuredUserIds;
      if (!recipients.length) return;
      await prisma.notification.createMany({
        data: recipients.map((userId) => ({
          userId,
          type: "AUTOMATION",
          title: typeof config.title === "string" ? config.title : `Automation: ${automationName}`,
          body: typeof config.body === "string" ? config.body : `Item "${item.name}" triggered an automation.`,
          actionUrl: typeof config.actionUrl === "string" ? config.actionUrl : `/board/${item.boardId}`,
        })),
      });
      return;
    }

    case "send_email": {
      const to = typeof config.to === "string" ? config.to : null;
      if (!to) return;
      await sendEmail({
        to,
        subject: typeof config.subject === "string" ? config.subject : `Automation: ${automationName}`,
        text: typeof config.body === "string" ? config.body : `Item "${item.name}" triggered an automation.`,
      });
      return;
    }

    case "create_item": {
      const groupId = typeof config.groupId === "string" ? config.groupId : item.groupId;
      const maxPos = await prisma.item.findFirst({
        where: { groupId },
        orderBy: { position: "desc" },
        select: { position: true },
      });
      const name = typeof config.itemName === "string" && config.itemName.trim()
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

    case "update_column": {
      const columnId = typeof config.columnId === "string"
        ? config.columnId
        : typeof config.targetColumnId === "string"
          ? config.targetColumnId
          : null;
      if (!columnId) return;
      const value = Object.prototype.hasOwnProperty.call(config, "value") ? config.value : config.targetValue;
      if (value === undefined) return;
      await upsertColumnValue(item.id, columnId, value);
      return;
    }

    case "add_tag": {
      const columnId = typeof config.columnId === "string" ? config.columnId : null;
      const tag = typeof config.tag === "string" ? config.tag : typeof config.value === "string" ? config.value : null;
      if (!columnId || !tag) return;
      const existing = item.columnValues.find((entry) => entry.columnId === columnId)?.value;
      const current = Array.isArray(existing) ? existing.filter((entry): entry is string => typeof entry === "string") : [];
      const next = Array.from(new Set([...current, tag]));
      await upsertColumnValue(item.id, columnId, next);
      return;
    }

    case "trigger_integration": {
      const integration = await resolveIntegrationConfig(config, item.boardId, automationUserId);
      if (!integration) return;
      await runAutomationIntegration(integration, item, config);
      return;
    }
  }
}

function triggerAliases(event: AutomationEvent): string[] {
  switch (event) {
    case "DATE_ARRIVED":
      return ["DATE_ARRIVED", "DATE_ARRIVES"];
    case "COLUMN_CHANGED":
      return ["COLUMN_CHANGED", "COLUMN_VALUE_CHANGED"];
    case "COLUMN_VALUE_CHANGED":
      return ["COLUMN_VALUE_CHANGED", "COLUMN_CHANGED"];
    default:
      return [event];
  }
}

export async function processAutomation(boardId: string, event: AutomationEvent, item: ItemShape): Promise<void> {
  if (!boardId || !item.id) return;

  const automations = await prisma.automation.findMany({
    where: {
      boardId,
      isEnabled: true,
      trigger: { in: triggerAliases(event) as any },
    },
    orderBy: { createdAt: "asc" },
  });
  if (!automations.length) return;

  const dbItem = await prisma.item.findUnique({
    where: { id: item.id },
    include: {
      assignees: {
        select: { userId: true, user: { select: { firstName: true, lastName: true } } },
      },
      columnValues: {
        select: { id: true, columnId: true, value: true, column: { select: { title: true, columnType: true } } },
      },
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
    if (!matchesConditions(contextItem, automation.conditions)) continue;

    const actions = getActionsForAutomation(automation);
    for (const action of actions) {
      await executeRuleAction(automation.name, automation.userId, action, {
        id: dbItem.id,
        boardId: dbItem.boardId,
        groupId: dbItem.groupId,
        name: dbItem.name,
        assignees: dbItem.assignees.map((entry) => ({
          userId: entry.userId,
          firstName: entry.user.firstName,
          lastName: entry.user.lastName,
        })),
        columnValues: dbItem.columnValues,
      });
    }

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
          actionsExecuted: actions.map((entry) => entry.action),
        } as any,
      },
    });
  }
}
