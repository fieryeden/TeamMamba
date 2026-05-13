import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const activities = await prisma.activity.findMany({
      where: {
        board: {
          members: { some: { userId: user.id } },
        },
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        board: { select: { id: true, name: true } },
        item: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json({ activities });
  } catch (err) {
    console.error("Get activities error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
