import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";
import { createGuestAccessSchema } from "@/lib/validations";

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const data = createGuestAccessSchema.parse(body);

    const token = randomBytes(20).toString("hex");
    const access = await prisma.guestAccess.create({
      data: {
        boardId: data.boardId,
        createdById: user.id,
        token,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      },
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3010";
    return NextResponse.json({
      access,
      shareUrl: `${baseUrl}/share/${access.token}`,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "ZodError") {
      return NextResponse.json({ error: "Invalid share payload" }, { status: 400 });
    }
    console.error("Create guest access error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
