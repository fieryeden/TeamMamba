import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";
import { startTimeTrackingSchema, timeEntryActionSchema } from "@/lib/validations";
import { broadcastToBoard } from "@/lib/socket";

function computeElapsedSeconds(start: Date, end: Date) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const itemId = new URL(req.url).searchParams.get("itemId");
    if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });

    const entries = await prisma.timeEntry.findMany({
      where: { itemId },
      orderBy: { createdAt: "desc" },
    });

    const totalSeconds = entries.reduce((acc, entry) => {
      if (entry.isRunning) {
        return acc + entry.durationSeconds + computeElapsedSeconds(entry.startTime, new Date());
      }
      return acc + entry.durationSeconds;
    }, 0);

    return NextResponse.json({ entries, totalSeconds });
  } catch (err) {
    console.error("Get time entries error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const action = String(body.action ?? "");

    if (action === "start" || action === "resume") {
      const { itemId } = startTimeTrackingSchema.parse(body);
      const existingRunning = await prisma.timeEntry.findFirst({
        where: { itemId, userId: user.id, isRunning: true },
      });

      if (existingRunning) {
        return NextResponse.json({ entry: existingRunning });
      }

      const entry = await prisma.timeEntry.create({
        data: {
          itemId,
          userId: user.id,
          startTime: new Date(),
          isRunning: true,
        },
      });

      const item = await prisma.item.findUnique({ where: { id: itemId }, select: { boardId: true } });
      if (item) broadcastToBoard(item.boardId, "time:updated", { itemId });
      return NextResponse.json({ entry }, { status: 201 });
    }

    const { entryId, itemId } = timeEntryActionSchema.parse(body);
    const running = entryId
      ? await prisma.timeEntry.findUnique({ where: { id: entryId } })
      : await prisma.timeEntry.findFirst({
          where: { itemId, userId: user.id, isRunning: true },
          orderBy: { createdAt: "desc" },
        });

    if (!running) {
      return NextResponse.json({ error: "Running entry not found" }, { status: 404 });
    }

    if (action === "pause" || action === "stop") {
      const now = new Date();
      const duration = running.durationSeconds + computeElapsedSeconds(running.startTime, now);
      const entry = await prisma.timeEntry.update({
        where: { id: running.id },
        data: { endTime: now, durationSeconds: duration, isRunning: false },
      });
      const item = await prisma.item.findUnique({ where: { id: running.itemId }, select: { boardId: true } });
      if (item) broadcastToBoard(item.boardId, "time:updated", { itemId: running.itemId });
      return NextResponse.json({ entry });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "ZodError") {
      return NextResponse.json({ error: "Invalid time tracking payload" }, { status: 400 });
    }
    console.error("Time tracking mutation error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
