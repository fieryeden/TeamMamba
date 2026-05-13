// Domain types for TeamMamba

export type UserRole = "ADMIN" | "MEMBER" | "VIEWER" | "GUEST";
export type UserStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";
export type WorkspaceRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
export type BoardKind = "KANBAN" | "TABLE" | "TIMELINE" | "CALENDAR" | "FORM";
export type BoardRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
export type ColumnType =
  | "TEXT" | "LONG_TEXT" | "NUMBER" | "STATUS" | "DATE"
  | "PEOPLE" | "TAGS" | "CHECKBOX" | "TIMELINE" | "LINK"
  | "FILE" | "FORMULA" | "PROGRESS" | "RATING" | "EMAIL"
  | "PHONE" | "AUTO_NUMBER" | "ITEM_ID" | "CREATION_LOG"
  | "LAST_UPDATE" | "COLOR" | "LOCATION" | "WORLD_CLOCK"
  | "HOUR" | "DEPENDENCY" | "VOTE" | "TIME_TRACKING" | "FORM_LINK";

export type DependencyType = "FINISH_TO_START" | "START_TO_START" | "FINISH_TO_FINISH" | "START_TO_FINISH";

export type ActivityAction =
  | "ITEM_CREATED" | "ITEM_UPDATED" | "ITEM_DELETED" | "ITEM_MOVED"
  | "STATUS_CHANGED" | "ASSIGNEE_ADDED" | "ASSIGNEE_REMOVED"
  | "COMMENT_ADDED" | "COLUMN_VALUE_CHANGED" | "GROUP_CREATED"
  | "GROUP_DELETED" | "BOARD_CREATED" | "BOARD_UPDATED" | "AUTOMATION_TRIGGERED";

export type NotificationType =
  | "ASSIGNMENT" | "MENTION" | "STATUS_CHANGE" | "DUE_DATE" | "AUTOMATION" | "SYSTEM";

export type AutomationTrigger =
  | "STATUS_CHANGED" | "DATE_ARRIVES" | "ITEM_CREATED" | "ITEM_MOVED_TO_GROUP"
  | "PRIORITY_CHANGED" | "ASSIGNEE_CHANGED" | "COLUMN_VALUE_CHANGED" | "RECURRING_SCHEDULE";

export type AutomationAction =
  | "CHANGE_STATUS" | "MOVE_ITEM_TO_GROUP" | "NOTIFY_ASSIGNEE" | "NOTIFY_USER"
  | "SET_COLUMN_VALUE" | "CREATE_ITEM" | "SEND_EMAIL" | "ASSIGN_USER" | "SHIFT_DATE";

// API response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface UserPayload {
  userId: string;
  email: string;
}
