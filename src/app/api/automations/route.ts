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

    if (!boardId) return NextResponse.json({ error: "boardId required" }, { status: 400 });

    const automations = await prisma.automation.findMany({
      where: { boardId },
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
