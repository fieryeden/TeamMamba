export type BoardTemplateConfig = {
  key: "PROJECT_TRACKER" | "SPRINT_BOARD" | "BUG_TRACKER" | "CRM_PIPELINE" | "CONTENT_CALENDAR";
  name: string;
  description: string;
  columns: Array<{
    title: string;
    columnType:
      | "TEXT"
      | "LONG_TEXT"
      | "NUMBER"
      | "STATUS"
      | "DATE"
      | "PEOPLE"
      | "TAGS"
      | "CHECKBOX"
      | "TIMELINE"
      | "LINK"
      | "FILE"
      | "FORMULA"
      | "PROGRESS"
      | "RATING"
      | "EMAIL"
      | "PHONE";
    config?: Record<string, unknown>;
  }>;
  groups: Array<{ name: string; color: string }>;
};

export const BOARD_TEMPLATES: BoardTemplateConfig[] = [
  {
    key: "PROJECT_TRACKER",
    name: "Project Tracker",
    description: "Track project milestones, owners, and progress.",
    columns: [
      { title: "Status", columnType: "STATUS", config: { labels: ["Not Started", "In Progress", "Done"], colors: ["#c4c4c4", "#fdab3d", "#00c875"] } },
      { title: "Owner", columnType: "PEOPLE" },
      { title: "Due Date", columnType: "DATE" },
      { title: "Progress", columnType: "PROGRESS" },
    ],
    groups: [{ name: "Backlog", color: "#579bfc" }, { name: "Active", color: "#fdab3d" }, { name: "Completed", color: "#00c875" }],
  },
  {
    key: "SPRINT_BOARD",
    name: "Sprint Board",
    description: "Plan and execute sprints.",
    columns: [
      { title: "Status", columnType: "STATUS", config: { labels: ["Todo", "In Progress", "QA", "Done"], colors: ["#c4c4c4", "#fdab3d", "#579bfc", "#00c875"] } },
      { title: "Assignee", columnType: "PEOPLE" },
      { title: "Story Points", columnType: "NUMBER" },
      { title: "Sprint", columnType: "TEXT" },
    ],
    groups: [{ name: "Sprint Backlog", color: "#579bfc" }, { name: "Current Sprint", color: "#fdab3d" }],
  },
  {
    key: "BUG_TRACKER",
    name: "Bug Tracker",
    description: "Capture and triage product issues.",
    columns: [
      { title: "Severity", columnType: "STATUS", config: { labels: ["Critical", "High", "Medium", "Low"], colors: ["#333333", "#e2445c", "#fdab3d", "#579bfc"] } },
      { title: "Status", columnType: "STATUS", config: { labels: ["Open", "Investigating", "Fixed", "Closed"], colors: ["#e2445c", "#fdab3d", "#00c875", "#c4c4c4"] } },
      { title: "Reporter", columnType: "TEXT" },
      { title: "Due", columnType: "DATE" },
    ],
    groups: [{ name: "Incoming", color: "#e2445c" }, { name: "Resolved", color: "#00c875" }],
  },
  {
    key: "CRM_PIPELINE",
    name: "CRM Pipeline",
    description: "Track leads and deals from contact to close.",
    columns: [
      { title: "Stage", columnType: "STATUS", config: { labels: ["Lead", "Qualified", "Proposal", "Won", "Lost"], colors: ["#579bfc", "#fdab3d", "#784bd1", "#00c875", "#c4c4c4"] } },
      { title: "Deal Value", columnType: "NUMBER" },
      { title: "Contact Email", columnType: "EMAIL" },
      { title: "Next Follow-up", columnType: "DATE" },
    ],
    groups: [{ name: "Open Deals", color: "#579bfc" }, { name: "Closed Deals", color: "#00c875" }],
  },
  {
    key: "CONTENT_CALENDAR",
    name: "Content Calendar",
    description: "Plan publishing timelines and owners.",
    columns: [
      { title: "Status", columnType: "STATUS", config: { labels: ["Idea", "Draft", "Review", "Published"], colors: ["#c4c4c4", "#579bfc", "#fdab3d", "#00c875"] } },
      { title: "Publish Date", columnType: "DATE" },
      { title: "Channel", columnType: "TAGS" },
      { title: "Owner", columnType: "PEOPLE" },
    ],
    groups: [{ name: "This Month", color: "#579bfc" }, { name: "Next Month", color: "#fdab3d" }],
  },
];

export function getBoardTemplate(key?: string | null): BoardTemplateConfig | null {
  if (!key) return null;
  return BOARD_TEMPLATES.find((template) => template.key === key) ?? null;
}
