import { prisma } from "@/lib/prisma";
import { type LLMTool, type LLMToolCall } from "@/lib/llm";
import { broadcastToBoard } from "@/lib/socket";

type BoardWithRelations = {
  id: string;
  columns: Array<{ id: string; title: string; columnType: string }>;
  groups: Array<{ id: string; name: string }>;
  members: Array<{ user: { id: string; firstName: string; lastName: string } }>;
};

export function getBoardTools(board: BoardWithRelations): LLMTool[] {
  const statusColumn = board.columns.find((c) => c.columnType === "STATUS");
  const statusLabels = statusColumn
    ? ((statusColumn as any).config as { labels?: string[] } | null)?.labels ?? ["To Do", "In Progress", "Done"]
    : ["To Do", "In Progress", "Done"];

  return [
    {
      name: "create_item",
      description: "Create a new item (task) on the board",
      parameters: {
        type: "object" as const,
        properties: {
          name: { type: "string", description: "Name/title of the item" },
          group_name: { type: "string", description: "Which group/column to put it in. Options: " + board.groups.map((g) => g.name).join(", ") },
          status: { type: "string", description: "Initial status. Options: " + statusLabels.join(", ") },
          assignee_name: { type: "string", description: "Full name of a team member to assign. Options: " + board.members.map((m) => `${m.user.firstName} ${m.user.lastName}`).join(", ") },
        },
        required: ["name"],
      },
    },
    {
      name: "assign_item",
      description: "Assign or unassign a team member to/from an existing item",
      parameters: {
        type: "object" as const,
        properties: {
          item_name: { type: "string", description: "Name of the item to assign" },
          assignee_name: { type: "string", description: "Full name of the team member (e.g. 'John Smith'). Use empty string to unassign." },
        },
        required: ["item_name", "assignee_name"],
      },
    },
    {
      name: "move_item",
      description: "Move an item to a different status or group",
      parameters: {
        type: "object" as const,
        properties: {
          item_name: { type: "string", description: "Name of the item to move" },
          target_status: { type: "string", description: "Target status. Options: " + statusLabels.join(", ") },
          target_group: { type: "string", description: "Target group name. Options: " + board.groups.map((g) => g.name).join(", ") },
        },
        required: ["item_name"],
      },
    },
    {
      name: "rename_item",
      description: "Rename an existing item",
      parameters: {
        type: "object" as const,
        properties: {
          item_name: { type: "string", description: "Current name of the item" },
          new_name: { type: "string", description: "New name for the item" },
        },
        required: ["item_name", "new_name"],
      },
    },
    {
      name: "list_items",
      description: "List all items on the board, optionally filtered",
      parameters: {
        type: "object" as const,
        properties: {
          filter_status: { type: "string", description: "Filter by status. Options: " + statusLabels.join(", ") },
          filter_assignee: { type: "string", description: "Filter by assignee name" },
          filter_group: { type: "string", description: "Filter by group name" },
        },
      },
    },
    {
      name: "get_item_details",
      description: "Get detailed information about a specific item",
      parameters: {
        type: "object" as const,
        properties: {
          item_name: { type: "string", description: "Name of the item" },
        },
        required: ["item_name"],
      },
    },
  ];
}

export async function executeBoardTool(
  tc: LLMToolCall,
  board: BoardWithRelations,
  userId: string,
): Promise<Record<string, unknown>> {
  const args = tc.arguments;

  switch (tc.name) {
    case "create_item": {
      const name = String(args.name || "").trim();
      if (!name) return { success: false, error: "Item name is required" };

      const groupName = args.group_name ? String(args.group_name).trim() : null;
      const targetGroup = groupName
        ? board.groups.find((g) => g.name.toLowerCase() === groupName.toLowerCase())
        : board.groups[0];
      if (!targetGroup) return { success: false, error: `Group not found: ${groupName}` };

      const item = await prisma.item.create({
        data: {
          name,
          boardId: board.id,
          groupId: targetGroup.id,
          position: Date.now(),
        },
      });

      // Set status if specified
      if (args.status) {
        const statusCol = board.columns.find((c) => c.columnType === "STATUS");
        if (statusCol) {
          const labels = ((statusCol as any).config as { labels?: string[] } | null)?.labels ?? [];
          const statusIdx = labels.findIndex((l: string) => l.toLowerCase() === String(args.status).toLowerCase());
          if (statusIdx >= 0) {
            await prisma.columnValue.create({
              data: { itemId: item.id, columnId: statusCol.id, value: statusIdx },
            });
          }
        }
      }

      // Set assignee if specified
      if (args.assignee_name) {
        const assigneeName = String(args.assignee_name).trim();
        const member = board.members.find(
          (m) => `${m.user.firstName} ${m.user.lastName}`.toLowerCase() === assigneeName.toLowerCase()
        );
        if (member) {
          await prisma.itemAssignee.create({
            data: { itemId: item.id, userId: member.user.id },
          });
          // Also set people column value
          const peopleCol = board.columns.find((c) => c.columnType === "PEOPLE");
          if (peopleCol) {
            await prisma.columnValue.create({
              data: {
                itemId: item.id,
                columnId: peopleCol.id,
                value: JSON.parse(JSON.stringify([{ id: member.user.id, name: assigneeName }])),
              },
            });
          }
        }
      }

      broadcastToBoard(board.id, "item:created", { boardId: board.id, item });
      return { success: true, message: `Created "${name}" in ${targetGroup.name}`, item_id: item.id };
    }

    case "assign_item": {
      const itemName = String(args.item_name || "").trim();
      const assigneeName = String(args.assignee_name || "").trim();
      if (!itemName) return { success: false, error: "Item name is required" };

      const allItems = await prisma.item.findMany({
        where: { boardId: board.id },
        include: {
          assignees: { include: { user: true } },
          columnValues: { include: { column: true } },
        },
      });

      const item = allItems.find((i) => i.name.toLowerCase() === itemName.toLowerCase());
      if (!item) return { success: false, error: `Item not found: ${itemName}` };

      const peopleCol = board.columns.find((c) => c.columnType === "PEOPLE");

      if (!assigneeName) {
        // Unassign everyone
        await prisma.itemAssignee.deleteMany({ where: { itemId: item.id } });
        if (peopleCol) {
          const pcv = item.columnValues.find((cv) => cv.column.id === peopleCol.id);
          if (pcv) {
            await prisma.columnValue.update({ where: { id: pcv.id }, data: { value: [] } });
          }
        }
        broadcastToBoard(board.id, "item:updated", { boardId: board.id, item });
        return { success: true, message: `Unassigned everyone from "${item.name}"` };
      }

      const member = board.members.find(
        (m) => `${m.user.firstName} ${m.user.lastName}`.toLowerCase() === assigneeName.toLowerCase()
      );
      if (!member) return { success: false, error: `Team member not found: ${assigneeName}` };

      // Add assignee (connect)
      await prisma.itemAssignee.upsert({
        where: { itemId_userId: { itemId: item.id, userId: member.user.id } },
        create: { itemId: item.id, userId: member.user.id },
        update: {},
      });

      // Update people column value
      if (peopleCol) {
        const pcv = item.columnValues.find((cv) => cv.column.id === peopleCol.id);
        const currentPeople: Array<{ id: string; name: string }> = pcv
          ? ((pcv.value as any) || [])
          : [];
        const alreadyIn = currentPeople.some((p) => p.id === member.user.id);
        if (!alreadyIn) {
          const updated = [...currentPeople, { id: member.user.id, name: assigneeName }];
          if (pcv) {
            await prisma.columnValue.update({ where: { id: pcv.id }, data: { value: JSON.parse(JSON.stringify(updated)) } });
          } else {
            await prisma.columnValue.create({
              data: { itemId: item.id, columnId: peopleCol.id, value: JSON.parse(JSON.stringify(updated)) },
            });
          }
        }
      }

      const updatedItem = await prisma.item.findUnique({ where: { id: item.id } });
      broadcastToBoard(board.id, "item:updated", { boardId: board.id, item: updatedItem });
      return { success: true, message: `Assigned ${assigneeName} to "${item.name}"` };
    }

    case "move_item": {
      const itemName = String(args.item_name || "").trim();
      if (!itemName) return { success: false, error: "Item name is required" };

      const allItems = await prisma.item.findMany({
        where: { boardId: board.id },
        include: { columnValues: { include: { column: true } } },
      });

      const item = allItems.find((i) => i.name.toLowerCase() === itemName.toLowerCase());
      if (!item) return { success: false, error: `Item not found: ${itemName}` };

      let message = "";

      // Move to different group
      if (args.target_group) {
        const groupName = String(args.target_group).trim();
        const targetGroup = board.groups.find((g) => g.name.toLowerCase() === groupName.toLowerCase());
        if (targetGroup && targetGroup.id !== item.groupId) {
          await prisma.item.update({ where: { id: item.id }, data: { groupId: targetGroup.id } });
          message += `Moved to group "${targetGroup.name}". `;
        }
      }

      // Change status
      if (args.target_status) {
        const statusCol = board.columns.find((c) => c.columnType === "STATUS");
        if (statusCol) {
          const labels = ((statusCol as any).config as { labels?: string[] } | null)?.labels ?? [];
          const statusIdx = labels.findIndex((l: string) => l.toLowerCase() === String(args.target_status).toLowerCase());
          if (statusIdx >= 0) {
            const statusCv = item.columnValues.find((cv) => cv.column.id === statusCol.id);
            if (statusCv) {
              await prisma.columnValue.update({ where: { id: statusCv.id }, data: { value: statusIdx } });
            } else {
              await prisma.columnValue.create({
                data: { itemId: item.id, columnId: statusCol.id, value: statusIdx },
              });
            }
            message += `Status changed to "${labels[statusIdx]}". `;
          }
        }
      }

      const updatedItem = await prisma.item.findUnique({ where: { id: item.id } });
      broadcastToBoard(board.id, "item:updated", { boardId: board.id, item: updatedItem });
      return { success: true, message: message || `Item "${item.name}" updated` };
    }

    case "rename_item": {
      const itemName = String(args.item_name || "").trim();
      const newName = String(args.new_name || "").trim();
      if (!itemName || !newName) return { success: false, error: "Both item_name and new_name are required" };

      const allItems = await prisma.item.findMany({ where: { boardId: board.id } });
      const item = allItems.find((i) => i.name.toLowerCase() === itemName.toLowerCase());
      if (!item) return { success: false, error: `Item not found: ${itemName}` };

      const updatedItem = await prisma.item.update({ where: { id: item.id }, data: { name: newName } });
      broadcastToBoard(board.id, "item:updated", { boardId: board.id, item: updatedItem });
      return { success: true, message: `Renamed "${item.name}" to "${newName}"` };
    }

    case "list_items": {
      const allItems = await prisma.item.findMany({
        where: { boardId: board.id },
        include: {
          assignees: { include: { user: true } },
          columnValues: { include: { column: true } },
          group: { select: { name: true } },
        },
        orderBy: { position: "asc" },
      });

      let filtered = allItems;
      const statusCol = board.columns.find((c) => c.columnType === "STATUS");
      const labels = statusCol
        ? ((statusCol as any).config as { labels?: string[] } | null)?.labels ?? []
        : [];

      if (args.filter_status && statusCol) {
        const statusIdx = labels.findIndex((l: string) => l.toLowerCase() === String(args.filter_status).toLowerCase());
        if (statusIdx >= 0) {
          filtered = filtered.filter((item) => {
            const cv = item.columnValues.find((v) => v.column.id === statusCol.id);
            return cv && cv.value === statusIdx;
          });
        }
      }

      if (args.filter_assignee) {
        const name = String(args.filter_assignee).toLowerCase();
        filtered = filtered.filter((item) =>
          item.assignees.some((a) =>
            `${a.user.firstName} ${a.user.lastName}`.toLowerCase().includes(name)
          )
        );
      }

      if (args.filter_group) {
        const name = String(args.filter_group).toLowerCase();
        filtered = filtered.filter((item) => item.group.name.toLowerCase().includes(name));
      }

      const summary = filtered.map((item) => {
        const statusCv = statusCol ? item.columnValues.find((v) => v.column.id === statusCol.id) : null;
        const statusName = statusCv ? labels[Number(statusCv.value)] || "Unknown" : "Unknown";
        const assignees = item.assignees.map((a) => `${a.user.firstName} ${a.user.lastName}`).join(", ") || "Unassigned";
        return `- ${item.name} [${statusName}] (${item.group.name}) — ${assignees}`;
      });

      return {
        success: true,
        count: filtered.length,
        items: summary,
        message: filtered.length === 0 ? "No items matching the filter." : `${filtered.length} items found.`,
      };
    }

    case "get_item_details": {
      const itemName = String(args.item_name || "").trim();
      if (!itemName) return { success: false, error: "Item name is required" };

      const allItems = await prisma.item.findMany({
        where: { boardId: board.id },
        include: {
          assignees: { include: { user: true } },
          columnValues: { include: { column: true } },
          group: { select: { name: true } },
        },
      });

      const item = allItems.find((i) => i.name.toLowerCase() === itemName.toLowerCase());
      if (!item) return { success: false, error: `Item not found: ${itemName}` };

      const details: Record<string, unknown> = {
        name: item.name,
        group: item.group.name,
        assignees: item.assignees.map((a) => `${a.user.firstName} ${a.user.lastName}`),
      };

      for (const cv of item.columnValues) {
        details[cv.column.title] = cv.value;
      }

      return { success: true, details };
    }

    default:
      return { success: false, error: `Unknown tool: ${tc.name}` };
  }
}
