import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const boardId = url.searchParams.get("boardId");

    // Get user's boards
    const memberBoards = await prisma.boardMember.findMany({
      where: { userId: user.id },
      include: { board: { select: { id: true, name: true } } },
    });
    const boardIds = memberBoards.map((m) => m.boardId);

    const targetBoardIds = boardId ? [boardId] : boardIds;

    // Get all team members for these boards
    const boardMembers = await prisma.boardMember.findMany({
      where: { boardId: { in: targetBoardIds } },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            email: true,
          },
        },
      },
    });

    // Get item assignees
    const assignees = await prisma.itemAssignee.findMany({
      where: { item: { boardId: { in: targetBoardIds } } },
      include: {
        item: {
          select: {
            id: true,
            name: true,
            boardId: true,
            board: { select: { name: true } },
            columnValues: {
              where: { column: { columnType: "STATUS" } },
              select: { value: true },
            },
            timeEntries: {
              select: { durationSeconds: true },
            },
          },
        },
      },
    });

    // Get time entries per user
    const timeEntries = await prisma.timeEntry.findMany({
      where: { item: { boardId: { in: targetBoardIds } } },
      select: {
        userId: true,
        durationSeconds: true,
        isRunning: true,
      },
    });

    // Build per-user workload
    const userMap = new Map<string, {
      user: { id: string; firstName: string; lastName: string; avatarUrl: string | null; email: string };
      items: { id: string; name: string; boardName: string; status: string | null; timeSpent: number }[];
      totalItems: number;
      totalTimeSeconds: number;
      runningTimers: number;
    }>();

    for (const bm of boardMembers) {
      userMap.set(bm.user.id, {
        user: bm.user,
        items: [],
        totalItems: 0,
        totalTimeSeconds: 0,
        runningTimers: 0,
      });
    }

    for (const a of assignees) {
      const entry = userMap.get(a.userId);
      if (!entry || !a.item) continue;

      const statusVal = a.item.columnValues[0]?.value as Record<string, unknown> | null;
      const status = (statusVal?.["label"] as string) ?? null;
      const timeSpent = a.item.timeEntries.reduce((sum, t) => sum + t.durationSeconds, 0);

      entry.items.push({
        id: a.item.id,
        name: a.item.name,
        boardName: a.item.board?.name ?? "Unknown",
        status,
        timeSpent,
      });
      entry.totalItems++;
    }

    for (const te of timeEntries) {
      const entry = userMap.get(te.userId);
      if (!entry) continue;
      entry.totalTimeSeconds += te.durationSeconds;
      if (te.isRunning) entry.runningTimers++;
    }

    const workload = Array.from(userMap.values()).sort((a, b) => b.totalItems - a.totalItems);

    return NextResponse.json({
      workload,
      boards: memberBoards.map((m) => m.board),
    });
  } catch (err) {
    console.error("Workload error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
