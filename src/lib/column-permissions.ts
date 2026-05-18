import { type BoardRole } from "@prisma/client";

export interface ColumnPermissionShape {
  columnId: string;
  role: BoardRole;
  canView: boolean;
  canEdit: boolean;
}

export function filterColumnsByRole<T extends { id: string }>(
  columns: T[],
  userRole: BoardRole,
  permissions: ColumnPermissionShape[]
): T[] {
  if (permissions.length === 0) return columns;

  const permissionByColumn = new Map<string, ColumnPermissionShape>(
    permissions
      .filter((permission) => permission.role === userRole)
      .map((permission) => [permission.columnId, permission])
  );

  return columns.filter((column) => {
    const permission = permissionByColumn.get(column.id);
    return permission ? permission.canView : true;
  });
}

export function canEditColumn(
  columnId: string,
  userRole: BoardRole,
  permissions: ColumnPermissionShape[]
): boolean {
  if (permissions.length === 0) return true;
  const permission = permissions.find((entry) => entry.columnId === columnId && entry.role === userRole);
  if (!permission) return true;
  return permission.canView && permission.canEdit;
}

function filterItemColumnValues<T extends { columnId?: string; column?: { id: string } | null }>(
  values: T[] | undefined,
  visibleColumnIds: Set<string>
): T[] {
  if (!values) return [];
  return values.filter((value) => {
    const columnId = value.columnId ?? value.column?.id;
    return Boolean(columnId && visibleColumnIds.has(columnId));
  });
}

export function applyColumnPermissions<
  TBoard extends {
    id: string;
    columns: Array<{ id: string }>;
    members?: Array<{ userId?: string; user?: { id: string } | null; role: BoardRole }>;
    columnPermissions?: ColumnPermissionShape[];
    groups?: Array<{
      items?: Array<{
        columnValues?: Array<{ columnId?: string; column?: { id: string } | null }>;
      }>;
    }>;
    items?: Array<{
      columnValues?: Array<{ columnId?: string; column?: { id: string } | null }>;
    }>;
  }
>(board: TBoard, userId: string): TBoard {
  const membership = board.members?.find((member) => {
    const candidateId = member.userId ?? member.user?.id;
    return candidateId === userId;
  });

  if (!membership) {
    return board;
  }

  const permissions = board.columnPermissions ?? [];
  const visibleColumns = filterColumnsByRole(board.columns, membership.role, permissions);
  const visibleColumnIds = new Set(visibleColumns.map((column) => column.id));

  const groups = board.groups?.map((group) => ({
    ...group,
    items: group.items?.map((item) => ({
      ...item,
      columnValues: filterItemColumnValues(item.columnValues, visibleColumnIds),
    })),
  }));

  const items = board.items?.map((item) => ({
    ...item,
    columnValues: filterItemColumnValues(item.columnValues, visibleColumnIds),
  }));

  return {
    ...board,
    columns: visibleColumns,
    groups,
    items,
  };
}
