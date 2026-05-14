import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/session";
import { randomBytes, createHash } from "crypto";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const tokens = await prisma.apiToken.findMany({
      where: { userId: user.id },
      select: { id: true, name: true, lastUsed: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ tokens });
  } catch (err) {
    console.error("Get tokens error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const name = (body.name as string)?.trim();
    if (!name) return NextResponse.json({ error: "Token name required" }, { status: 400 });

    // Generate a random token string
    const rawToken = `tm_${randomBytes(32).toString("hex")}`;
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");

    const apiToken = await prisma.apiToken.create({
      data: { userId: user.id, name, tokenHash },
      select: { id: true, name: true, lastUsed: true, createdAt: true },
    });

    // Return the raw token ONLY on creation — never stored, can't be retrieved again
    return NextResponse.json({ token: apiToken, rawToken }, { status: 201 });
  } catch (err) {
    console.error("Create token error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
