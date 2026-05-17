import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";
import { verifyTotpToken } from "@/lib/totp";

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const token = typeof body.token === "string" ? body.token : "";
    if (!token) return NextResponse.json({ error: "Token is required" }, { status: 400 });

    const current = await prisma.user.findUnique({
      where: { id: user.id },
      select: { twoFactorSecret: true },
    });

    if (!current?.twoFactorSecret) {
      return NextResponse.json({ error: "2FA is not set up yet" }, { status: 400 });
    }

    const valid = verifyTotpToken(current.twoFactorSecret, token);
    if (!valid) {
      return NextResponse.json({ error: "Invalid verification code" }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: true },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("2FA verify error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
