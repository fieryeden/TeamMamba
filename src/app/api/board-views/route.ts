import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";
import { createBoardViewSchema } from "@/lib/validations";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const boardId = new URL(req.url).searchParams.get("boardId");
    if (!boardId) return NextResponse.json({ error: "boardId required" }, { status: 400 });

    const views = await prisma.boardView.findMany({
      where: { boardId, userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ views });
  } catch (err) {
    console.error("Get board views error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const data = createBoardViewSchema.parse(body);

    const view = await prisma.boardView.create({
      data: {
        boardId: data.boardId,
        userId: user.id,
        name: data.name,
        viewKind: data.viewKind,
        config: data.config ? (JSON.parse(JSON.stringify(data.config)) as any) : undefined,
      },
    });

    return NextResponse.json({ view }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "ZodError") {
      return NextResponse.json({ error: "Invalid board view payload" }, { status: 400 });
    }
    console.error("Create board view error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
