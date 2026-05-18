import { type BoardRole } from "@prisma/client";

export type AISuggestAction = "assign" | "priority" | "status" | "categorize" | "summarize";

interface BoardMemberShape {
  userId?: string;
  role?: BoardRole;
  user?: { id: string; firstName?: string | null; lastName?: string | null; email?: string | null } | null;
}

interface ColumnShape {
  id: string;
  title: string;
  columnType: string;
}

interface ItemAssigneeShape {
  userId: string;
  user?: { firstName?: string | null; lastName?: string | null } | null;
}

interface ColumnValueShape {
  columnId: string;
  value: unknown;
}

interface ItemShape {
  id: string;
  name: string;
  createdAt?: string | Date;
  assignees: ItemAssigneeShape[];
  columnValues: ColumnValueShape[];
}

interface GroupShape {
  id: string;
  name: string;
  items: ItemShape[];
}

export interface BoardShape {
  id: string;
  name: string;
  columns: ColumnShape[];
  groups: GroupShape[];
  members: BoardMemberShape[];
}

export interface BoardMetrics {
  totalItems: number;
  completionRate: number;
  statusBreakdown: Record<string, number>;
  unassignedItems: number;
  overdueItems: number;
  overdueItemNames: string[];
  groupSummaries: Array<{ name: string; total: number; done: number; progress: number }>;
  workload: Record<string, number>;
  healthScore: number;
}

export interface BoardContext {
  summary: string;
  metrics: BoardMetrics;
  memberNames: string[];
  groupNames: string[];
  statusPatterns: Array<{ status: string; count: number }>;
}

function getStatusLabel(value: unknown): string {
  if (value && typeof value === "object") {
    const label = (value as Record<string, unknown>).label;
    if (typeof label === "string" && label.trim().length > 0) {
      return label;
    }
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  return "No Status";
}

function getDateValue(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const date = (value as Record<string, unknown>).date;
    return typeof date === "string" ? date : null;
  }
  return null;
}

function getMemberName(member: BoardMemberShape): string {
  if (member.user?.firstName || member.user?.lastName) {
    return `${member.user.firstName ?? ""} ${member.user.lastName ?? ""}`.trim();
  }
  return member.user?.id ?? member.userId ?? "Unknown";
}

export function computeBoardMetrics(board: BoardShape): BoardMetrics {
  const allItems = board.groups.flatMap((group) => group.items);
  const statusColumn = board.columns.find((column) => column.columnType === "STATUS");
  const dueDateColumn = board.columns.find((column) => column.columnType === "DATE");

  const statusBreakdown: Record<string, number> = {};
  const overdueItemNames: string[] = [];
  let unassignedItems = 0;
  let overdueItems = 0;

  const workload: Record<string, number> = {};

  for (const item of allItems) {
    const statusValue = item.columnValues.find((value) => value.columnId === statusColumn?.id)?.value;
    const status = getStatusLabel(statusValue);
    statusBreakdown[status] = (statusBreakdown[status] ?? 0) + 1;

    if (item.assignees.length === 0) {
      unassignedItems += 1;
    } else {
      for (const assignee of item.assignees) {
        const fullName = `${assignee.user?.firstName ?? ""} ${assignee.user?.lastName ?? ""}`.trim() || assignee.userId;
        workload[fullName] = (workload[fullName] ?? 0) + 1;
      }
    }

    if (dueDateColumn) {
      const dateValue = item.columnValues.find((value) => value.columnId === dueDateColumn.id)?.value;
      const dateString = getDateValue(dateValue);
      if (dateString) {
        const date = new Date(dateString);
        if (!Number.isNaN(date.getTime()) && date.getTime() < Date.now()) {
          overdueItems += 1;
          overdueItemNames.push(item.name);
        }
      }
    }
  }

  const doneCount = (statusBreakdown.Done ?? 0) + (statusBreakdown.Complete ?? 0);
  const completionRate = allItems.length > 0 ? Math.round((doneCount / allItems.length) * 100) : 0;

  const groupSummaries = board.groups.map((group) => {
    let done = 0;
    for (const item of group.items) {
      const statusValue = item.columnValues.find((value) => value.columnId === statusColumn?.id)?.value;
      const status = getStatusLabel(statusValue);
      if (status === "Done" || status === "Complete") done += 1;
    }

    return {
      name: group.name,
      total: group.items.length,
      done,
      progress: group.items.length > 0 ? Math.round((done / group.items.length) * 100) : 0,
    };
  });

  const healthScore = Math.max(0, 100 - unassignedItems * 5 - overdueItems * 10);

  return {
    totalItems: allItems.length,
    completionRate,
    statusBreakdown,
    unassignedItems,
    overdueItems,
    overdueItemNames,
    groupSummaries,
    workload,
    healthScore,
  };
}

export function heuristicSummaryText(boardName: string, metrics: BoardMetrics): string {
  const done = (metrics.statusBreakdown.Done ?? 0) + (metrics.statusBreakdown.Complete ?? 0);
  let summary = `Board \"${boardName}\" has ${metrics.totalItems} items. `;
  summary += `${metrics.completionRate}% complete (${done} done). `;
  if (metrics.overdueItems > 0) {
    summary += `${metrics.overdueItems} item${metrics.overdueItems === 1 ? "" : "s"} overdue. `;
  }
  if (metrics.unassignedItems > 0) {
    summary += `${metrics.unassignedItems} item${metrics.unassignedItems === 1 ? "" : "s"} unassigned. `;
  }
  summary += `Health score: ${metrics.healthScore}/100.`;
  return summary;
}

export function buildBoardContextSummary(board: BoardShape): string {
  const metrics = computeBoardMetrics(board);
  const items = board.groups.flatMap((group) => group.items.map((item) => ({ group: group.name, item })));
  const sampleItems = items.slice(0, 80).map(({ group, item }) => {
    const assignees = item.assignees
      .map((assignee) => `${assignee.user?.firstName ?? ""} ${assignee.user?.lastName ?? ""}`.trim() || assignee.userId)
      .join(", ");
    return `- [${group}] ${item.name}${assignees ? ` (assignees: ${assignees})` : ""}`;
  });

  const members = board.members
    .map((member) => `${getMemberName(member)} (${member.role ?? "MEMBER"})`)
    .slice(0, 25)
    .join(", ");

  return [
    `Board: ${board.name}`,
    `Columns: ${board.columns.map((column) => `${column.title}:${column.columnType}`).join(", ")}`,
    `Members: ${members}`,
    `Groups: ${board.groups.map((group) => group.name).join(", ")}`,
    `Metrics: total=${metrics.totalItems}, completion=${metrics.completionRate}%, overdue=${metrics.overdueItems}, unassigned=${metrics.unassignedItems}`,
    `Status breakdown: ${JSON.stringify(metrics.statusBreakdown)}`,
    "Sample items:",
    ...sampleItems,
  ].join("\n");
}

export function buildBoardContext(board: BoardShape): BoardContext {
  const metrics = computeBoardMetrics(board);
  const memberNames = board.members.map((member) => getMemberName(member)).filter((name) => name.length > 0);
  const groupNames = board.groups.map((group) => group.name);
  const statusPatterns = Object.entries(metrics.statusBreakdown)
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);

  return {
    summary: buildBoardContextSummary(board),
    metrics,
    memberNames,
    groupNames,
    statusPatterns,
  };
}

export function heuristicSuggest(board: BoardShape, action: AISuggestAction, itemId?: string) {
  const allItems = board.groups.flatMap((group) => group.items);
  const statusColumn = board.columns.find((column) => column.columnType === "STATUS" && column.title.toLowerCase().includes("status"));

  switch (action) {
    case "assign": {
      const memberWorkload = new Map<string, number>();
      for (const member of board.members) {
        const userId = member.user?.id ?? member.userId;
        if (userId) memberWorkload.set(userId, 0);
      }

      for (const item of allItems) {
        for (const assignee of item.assignees) {
          memberWorkload.set(assignee.userId, (memberWorkload.get(assignee.userId) ?? 0) + 1);
        }
      }

      const suggestions = Array.from(memberWorkload.entries())
        .sort((a, b) => a[1] - b[1])
        .slice(0, 3)
        .map(([userId, count]) => {
          const member = board.members.find((entry) => (entry.user?.id ?? entry.userId) === userId);
          const name = member ? getMemberName(member) : userId;
          return {
            userId,
            name,
            itemCount: count,
            reason: count === 0 ? "No current assignments" : `Only ${count} item${count > 1 ? "s" : ""} assigned`,
          };
        });

      return { suggestions };
    }

    case "priority": {
      const item = allItems.find((entry) => entry.id === itemId);
      if (!item) return { suggestion: "Medium", confidence: 0.4 };

      const name = item.name.toLowerCase();
      let suggestedPriority = "Medium";
      let confidence = 0.5;

      const criticalWords = ["urgent", "critical", "asap", "blocker", "outage", "broken"];
      const highWords = ["important", "deadline", "release", "launch", "fix"];
      const lowWords = ["nice to have", "later", "chore", "cleanup", "refactor"];

      if (criticalWords.some((word) => name.includes(word))) {
        suggestedPriority = "Critical";
        confidence = 0.9;
      } else if (highWords.some((word) => name.includes(word))) {
        suggestedPriority = "High";
        confidence = 0.8;
      } else if (lowWords.some((word) => name.includes(word))) {
        suggestedPriority = "Low";
        confidence = 0.7;
      }

      return { suggestion: suggestedPriority, confidence };
    }

    case "status": {
      const item = allItems.find((entry) => entry.id === itemId);
      if (!item) return { suggestion: "Working on it", confidence: 0.5, currentStatus: null };

      const currentStatus = getStatusLabel(item.columnValues.find((value) => value.columnId === statusColumn?.id)?.value);
      let suggestion = "Working on it";
      let confidence = 0.5;

      if (!currentStatus || currentStatus === "No Status" || currentStatus === "Not Started") {
        suggestion = "Working on it";
        confidence = 0.7;
      } else if (currentStatus === "Working on it") {
        const ageMs = Date.now() - new Date(item.createdAt ?? Date.now()).getTime();
        if (item.assignees.length > 0 && ageMs > 1000 * 60 * 60 * 24 * 3) {
          suggestion = "Done";
          confidence = 0.6;
        } else {
          suggestion = "Working on it";
          confidence = 0.8;
        }
      } else if (currentStatus === "Stuck") {
        suggestion = "Working on it";
        confidence = 0.5;
      }

      return { suggestion, confidence, currentStatus };
    }

    case "categorize": {
      const item = allItems.find((entry) => entry.id === itemId);
      if (!item) return { suggestion: null, groupId: null, confidence: 0 };

      const groupScores = board.groups.map((group) => {
        const groupItems = group.items.map((entry) => entry.name.toLowerCase());
        const groupWords = groupItems
          .join(" ")
          .split(/\s+/)
          .map((word) => word.trim())
          .filter((word) => word.length > 3);
        const itemWords = item.name
          .toLowerCase()
          .split(/\s+/)
          .map((word) => word.trim())
          .filter((word) => word.length > 3);
        const overlap = itemWords.filter((word) => groupWords.includes(word)).length;

        return {
          groupId: group.id,
          groupName: group.name,
          score: groupItems.length === 0 ? 0 : overlap / Math.max(itemWords.length, 1),
          itemCount: groupItems.length,
        };
      });

      groupScores.sort((a, b) => b.score - a.score);
      const best = groupScores[0];

      return {
        suggestion: best && best.score > 0 ? best.groupName : null,
        groupId: best && best.score > 0 ? best.groupId : null,
        confidence: best ? Math.min(best.score * 2, 1) : 0,
        alternatives: groupScores.slice(1, 3).filter((entry) => entry.score > 0),
      };
    }

    case "summarize": {
      return computeBoardMetrics(board);
    }

    default:
      return {};
  }
}

export function heuristicGenerateItems(description: string): string[] {
  const text = description.trim();
  if (!text) return [];

  const itemNames: string[] = [];
  const numberedMatch = text.match(/(?:\d+[.)]\s+.+)/g);
  if (numberedMatch && numberedMatch.length >= 2) {
    for (const match of numberedMatch) {
      const cleaned = match.replace(/^\d+[.)]\s+/, "").trim();
      if (cleaned) itemNames.push(cleaned);
    }
  }

  if (itemNames.length === 0) {
    const colonSplit = text.split(":").slice(1).join(":").trim();
    const candidates = (colonSplit || text)
      .split(/[,\n]/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    if (candidates.length >= 2) {
      itemNames.push(...candidates);
    }
  }

  if (itemNames.length === 0) {
    const lines = text
      .split(/\n/)
      .map((entry) => entry.replace(/^[-•*]\s+/, "").trim())
      .filter((entry) => entry.length > 0);
    if (lines.length >= 2) {
      itemNames.push(...lines);
    }
  }

  if (itemNames.length === 0) {
    itemNames.push(text);
  }

  return itemNames;
}

export function heuristicChatResponse(message: string, board: BoardShape, metrics: BoardMetrics) {
  const normalized = message.toLowerCase();

  if (normalized.includes("overdue")) {
    return {
      answer: `There are ${metrics.overdueItems} overdue item${metrics.overdueItems === 1 ? "" : "s"}.`,
      actionSuggestions: metrics.overdueItems > 0 ? ["Filter the board by due date and resolve overdue work."] : [],
    };
  }

  if (normalized.includes("most tasks") || normalized.includes("most items") || normalized.includes("workload")) {
    const top = Object.entries(metrics.workload).sort((a, b) => b[1] - a[1])[0];
    if (top) {
      return {
        answer: `${top[0]} currently has the highest workload with ${top[1]} item${top[1] === 1 ? "" : "s"}.`,
        actionSuggestions: ["Review assignments to balance workload."],
      };
    }
    return {
      answer: "No assignees were found on this board yet.",
      actionSuggestions: ["Assign owners to active items."],
    };
  }

  if (normalized.includes("status") || normalized.includes("progress") || normalized.includes("summary")) {
    return {
      answer: heuristicSummaryText(board.name, metrics),
      actionSuggestions: ["Open AI summarize for a richer project brief."],
    };
  }

  return {
    answer: `Board ${board.name} has ${metrics.totalItems} items, ${metrics.overdueItems} overdue, and ${metrics.completionRate}% completion. Ask about overdue items, workload, or progress for more detail.`,
    actionSuggestions: [],
  };
}
