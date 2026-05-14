import { z } from "zod";

// Auth
export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const updateThemePreferenceSchema = z.object({
  themePreference: z.enum(["LIGHT", "DARK", "SYSTEM"]),
});

// Workspace
export const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  icon: z.string().optional(),
});

export const updateWorkspaceSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  icon: z.string().optional(),
});

// Board
export const createBoardSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  icon: z.string().optional(),
  boardKind: z.enum(["KANBAN", "TABLE", "TIMELINE", "CALENDAR", "FORM"]).default("KANBAN"),
  templateKey: z
    .enum(["PROJECT_TRACKER", "SPRINT_BOARD", "BUG_TRACKER", "CRM_PIPELINE", "CONTENT_CALENDAR"])
    .optional(),
});

export const updateBoardSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  icon: z.string().optional(),
  boardKind: z.enum(["KANBAN", "TABLE", "TIMELINE", "CALENDAR", "FORM"]).optional(),
  color: z.string().optional(),
});

// Group
export const createGroupSchema = z.object({
  boardId: z.string().uuid(),
  name: z.string().min(1).max(200),
  color: z.string().default("#579bfc"),
});

export const updateGroupSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  color: z.string().optional(),
  position: z.number().int().optional(),
  isCollapsed: z.boolean().optional(),
});

// Item
export const createItemSchema = z.object({
  boardId: z.string().uuid(),
  groupId: z.string().uuid(),
  name: z.string().min(1).max(500),
  columnValues: z.record(z.unknown()).optional(),
});

export const updateItemSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  position: z.number().int().optional(),
  groupId: z.string().uuid().optional(),
});

// Column
export const createColumnSchema = z.object({
  boardId: z.string().uuid(),
  title: z.string().min(1).max(200),
  columnType: z.enum([
    "TEXT", "LONG_TEXT", "NUMBER", "STATUS", "DATE", "PEOPLE",
    "TAGS", "CHECKBOX", "TIMELINE", "LINK", "FILE", "FORMULA",
    "PROGRESS", "RATING", "EMAIL", "PHONE", "AUTO_NUMBER",
  ]),
  config: z.record(z.unknown()).optional(),
});

export const updateColumnSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  config: z.record(z.unknown()).optional(),
  order: z.number().int().optional(),
  width: z.number().int().optional(),
});

// Column Value
export const updateColumnValueSchema = z.object({
  value: z.unknown(),
});

// Automation
export const createAutomationSchema = z.object({
  boardId: z.string().uuid(),
  name: z.string().min(1).max(200),
  trigger: z.enum([
    "STATUS_CHANGED", "DATE_ARRIVES", "ITEM_CREATED",
    "ITEM_MOVED_TO_GROUP", "PRIORITY_CHANGED", "ASSIGNEE_CHANGED",
    "COLUMN_VALUE_CHANGED", "RECURRING_SCHEDULE",
  ]),
  conditions: z.record(z.unknown()).optional(),
  action: z.enum([
    "CHANGE_STATUS", "MOVE_ITEM_TO_GROUP", "NOTIFY_ASSIGNEE",
    "NOTIFY_USER", "SET_COLUMN_VALUE", "CREATE_ITEM",
    "SEND_EMAIL", "ASSIGN_USER", "SHIFT_DATE",
  ]),
  actionConfig: z.record(z.unknown()).optional(),
});

// Comment
export const createCommentSchema = z.object({
  body: z.string().min(1).max(10000),
  parentId: z.string().uuid().optional(),
});

export const formSubmissionSchema = z.object({
  itemName: z.string().min(1).max(500),
  groupId: z.string().uuid().optional(),
  values: z.record(z.unknown()).default({}),
});

export const uploadFileSchema = z.object({
  itemId: z.string().uuid(),
  columnId: z.string().uuid(),
});

export const startTimeTrackingSchema = z.object({
  itemId: z.string().uuid(),
});

export const timeEntryActionSchema = z.object({
  entryId: z.string().uuid().optional(),
  itemId: z.string().uuid().optional(),
});

export const createDependencySchema = z.object({
  fromItemId: z.string().uuid(),
  toItemId: z.string().uuid(),
  dependencyType: z.enum(["FINISH_TO_START", "START_TO_START", "FINISH_TO_FINISH", "START_TO_FINISH"]).default("FINISH_TO_START"),
});

export const createSubitemSchema = z.object({
  parentId: z.string().uuid(),
  name: z.string().min(1).max(500),
  statusColumnId: z.string().uuid().optional(),
  statusValue: z.number().int().optional(),
});

export const updateSubitemSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  statusColumnId: z.string().uuid().optional(),
  statusValue: z.number().int().optional(),
});

export const createItemCommentSchema = z.object({
  itemId: z.string().uuid(),
  body: z.string().min(1).max(10000),
  parentId: z.string().uuid().optional(),
});

export const commentReactionSchema = z.object({
  emoji: z.string().min(1).max(8),
});

export const createBoardViewSchema = z.object({
  boardId: z.string().uuid(),
  name: z.string().min(1).max(200),
  viewKind: z.enum(["KANBAN", "TABLE", "TIMELINE", "CALENDAR", "FORM"]).default("TABLE"),
  config: z.record(z.unknown()).optional(),
});

export const notificationPreferencesSchema = z.object({
  emailNotificationsEnabled: z.boolean().optional(),
  emailOnMentions: z.boolean().optional(),
  emailOnAssignments: z.boolean().optional(),
  emailOnDueDates: z.boolean().optional(),
});

export const importBoardSchema = z.object({
  workspaceId: z.string().uuid(),
  board: z.record(z.unknown()),
});

export const createGuestAccessSchema = z.object({
  boardId: z.string().uuid(),
  expiresAt: z.string().datetime().optional(),
});

export const onboardingSchema = z.object({
  onboardingCompleted: z.boolean().optional(),
});
