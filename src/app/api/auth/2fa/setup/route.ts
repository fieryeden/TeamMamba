import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";
import { buildTotpUri, generateTotpSecret } from "@/lib/totp";

export async function POST() {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const secret = generateTotpSecret();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorSecret: secret,
        twoFactorEnabled: false,
      },
    });

    const otpauthUrl = buildTotpUri(secret, user.email);
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(otpauthUrl)}`;

    return NextResponse.json({
      secret,
      otpauthUrl,
      qrCodeUrl,
    });
  } catch (err) {
    console.error("2FA setup error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
