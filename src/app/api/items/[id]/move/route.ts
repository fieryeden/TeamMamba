import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";

/**
 * POST /api/items/[id]/move
 * Move an item to a different board, remapping column values.
 * Body: { targetBoardId: string, targetGroupId?: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: itemId } = await params;
    const body = await req.json();
    const { targetBoardId, targetGroupId } = body;

    if (!targetBoardId) {
      return NextResponse.json({ error: "targetBoardId required" }, { status: 400 });
    }

    // Get the source item with its board info
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: {
        board: {
          include: {
            columns: { select: { id: true, title: true, columnType: true } },
          },
        },
        columnValues: true,
        assignees: { select: { userId: true } },
        subitems: true,
        dependenciesFrom: { select: { toItemId: true } },
        dependenciesTo: { select: { fromItemId: true } },
      },
    });

    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

    // Verify user can access source board
    const srcMembership = await prisma.boardMember.findFirst({
      where: { boardId: item.boardId, userId: user.id },
    });
    if (!srcMembership) return NextResponse.json({ error: "Forbidden on source board" }, { status: 403 });

    // Verify user can access target board
    const tgtMembership = await prisma.boardMember.findFirst({
      where: { boardId: targetBoardId, userId: user.id },
    });
    if (!tgtMembership) return NextResponse.json({ error: "Forbidden on target board" }, { status: 403 });

    // Get target board columns
    const targetBoard = await prisma.board.findUnique({
      where: { id: targetBoardId },
      include: {
        columns: { select: { id: true, title: true, columnType: true } },
        groups: { select: { id: true, name: true } },
        members: { select: { userId: true } },
      },
    });

    if (!targetBoard) return NextResponse.json({ error: "Target board not found" }, { status: 404 });

    const srcColumns = item.board.columns;
    const tgtColumns = targetBoard.columns;

    // Build column mapping: match by title then by type
    const tgtColByTitle = new Map(tgtColumns.map((c) => [c.title.toLowerCase(), c]));
    const tgtColByType = new Map<string, typeof tgtColumns[0][]>();
    for (const col of tgtColumns) {
      const arr = tgtColByType.get(col.columnType) ?? [];
      arr.push(col);
      tgtColByType.set(col.columnType, arr);
    }

    const columnMapping = new Map<string, string>(); // srcColId -> tgtColId
    for (const srcCol of srcColumns) {
      const titleMatch = tgtColByTitle.get(srcCol.title.toLowerCase());
      if (titleMatch) {
        columnMapping.set(srcCol.id, titleMatch.id);
        continue;
      }
      const typeMatches = tgtColByType.get(srcCol.columnType);
      if (typeMatches && typeMatches.length > 0) {
        const unmatched = typeMatches.find(
          (t) => !Array.from(columnMapping.values()).includes(t.id)
        );
        if (unmatched) {
          columnMapping.set(srcCol.id, unmatched.id);
        }
      }
    }

    // Find or create target group
    let groupId = targetGroupId;
    if (!groupId) {
      const existingGroup = targetBoard.groups[0];
      if (existingGroup) {
        groupId = existingGroup.id;
      } else {
        const newGroup = await prisma.group.create({
          data: {
            name: "Moved Items",
            board: { connect: { id: targetBoardId } },
            color: "#fdab3d",
            position: 0,
          },
        });
        groupId = newGroup.id;
      }
    }

    // Perform the move in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Delete old column values that don't map
      const unmappedValueIds = item.columnValues
        .filter((cv: any) => !columnMapping.has(cv.columnId))
        .map((cv: any) => cv.id);

      if (unmappedValueIds.length > 0) {
        await tx.columnValue.deleteMany({
          where: { id: { in: unmappedValueIds } },
        });
      }

      // Remap column values that do map
      for (const cv of item.columnValues as any[]) {
        const tgtColId = columnMapping.get(cv.columnId);
        if (tgtColId) {
          await tx.columnValue.update({
            where: { id: cv.id },
            data: { columnId: tgtColId },
          });
        }
      }

      // Move the item itself
      const movedItem = await tx.item.update({
        where: { id: itemId },
        data: {
          boardId: targetBoardId,
          groupId,
        },
      });

      // Subitems inherit parent's board — no boardId on Subitem, so no update needed

      // Remove assignees who aren't members of target board
      const targetMemberIds = new Set(targetBoard.members.map((m) => m.userId));
      for (const assignee of item.assignees) {
        if (!targetMemberIds.has(assignee.userId)) {
          await tx.itemAssignee.deleteMany({
            where: { itemId, userId: assignee.userId },
          });
        }
      }

      // Remove cross-board dependencies
      // Dependencies where this item is the "from" and the "to" item is on a different board
      const crossBoardDepIds: string[] = [];
      for (const dep of item.dependenciesFrom) {
        const toItem = await tx.item.findUnique({
          where: { id: dep.toItemId },
          select: { boardId: true },
        });
        if (toItem && toItem.boardId !== targetBoardId) {
          const depRecord = await tx.dependency.findFirst({
            where: { fromItemId: itemId, toItemId: dep.toItemId },
            select: { id: true },
          });
          if (depRecord) crossBoardDepIds.push(depRecord.id);
        }
      }
      for (const dep of item.dependenciesTo) {
        const fromItem = await tx.item.findUnique({
          where: { id: dep.fromItemId },
          select: { boardId: true },
        });
        if (fromItem && fromItem.boardId !== targetBoardId) {
          const depRecord = await tx.dependency.findFirst({
            where: { toItemId: itemId, fromItemId: dep.fromItemId },
            select: { id: true },
          });
          if (depRecord) crossBoardDepIds.push(depRecord.id);
        }
      }
      if (crossBoardDepIds.length > 0) {
        await tx.dependency.deleteMany({
          where: { id: { in: crossBoardDepIds } },
        });
      }

      // Log activity
      await tx.activity.create({
        data: {
          action: "ITEM_MOVED_TO_BOARD",
          userId: user.id,
          boardId: targetBoardId,
          itemId,
          details: {
            fromBoardId: item.boardId,
            toBoardId: targetBoardId,
            toBoardName: targetBoard.name,
          } as any,
        },
      });

      return movedItem;
    });

    return NextResponse.json({
      item: result,
      columnMapping: Object.fromEntries(columnMapping),
      unmappedColumns: srcColumns
        .filter((c) => !columnMapping.has(c.id))
        .map((c) => ({ id: c.id, title: c.title, type: c.columnType })),
    });
  } catch (err) {
    console.error("Move item error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
