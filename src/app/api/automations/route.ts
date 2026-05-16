import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";
import { createAutomationSchema } from "@/lib/validations";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const boardId = searchParams.get("boardId");

    const automations = await prisma.automation.findMany({
      where: { userId: user.id, ...(boardId ? { boardId } : {}) },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ automations });
  } catch (err) {
    console.error("Get automations error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const data = createAutomationSchema.parse(body);

    const automation = await prisma.automation.create({
      data: {
        boardId: data.boardId,
        userId: user.id,
        name: data.name,
        trigger: data.trigger,
        conditions: data.conditions ? JSON.parse(JSON.stringify(data.conditions)) : undefined,
        action: data.action,
        actionConfig: data.actionConfig ? JSON.parse(JSON.stringify(data.actionConfig)) : undefined,
      },
    });

    return NextResponse.json({ automation }, { status: 201 });
  } catch (err) {
    console.error("Create automation error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { id } = body as { id?: string };
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const existing = await prisma.automation.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!existing || existing.userId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const allowed = [
      "boardId",
      "name",
      "trigger",
      "conditions",
      "action",
      "actionConfig",
      "isEnabled",
    ] as const;
    const data: Record<string, unknown> = {};
    for (const key of allowed) {
      if (body[key] !== undefined) {
        data[key] = key === "conditions" || key === "actionConfig"
          ? JSON.parse(JSON.stringify(body[key]))
          : body[key];
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const automation = await prisma.automation.update({
      where: { id },
      data,
    });

    return NextResponse.json({ automation });
  } catch (err) {
    console.error("Update automation error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { id } = body as { id?: string };
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const existing = await prisma.automation.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!existing || existing.userId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.automation.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete automation error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
